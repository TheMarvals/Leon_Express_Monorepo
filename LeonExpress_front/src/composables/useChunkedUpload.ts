/**
 * useChunkedUpload
 *
 * Composable para subir imágenes (base64 o File) en lotes pequeños con
 * reintentos automáticos por chunk. Ideal para conexiones móviles lentas
 * o inestables donde un solo request grande falla fácilmente.
 *
 * Uso para pickup (base64):
 *   const { uploadBatchChunked } = useChunkedUpload()
 *   await uploadBatchChunked({ pickupId, images, chunkSize: 5 })
 *
 * Uso para evidencias (File):
 *   const { uploadFilesChunked } = useChunkedUpload()
 *   await uploadFilesChunked({ packageId, files, formMeta })
 */

import axios from 'axios'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

function getAuthHeaders() {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Espera ms milisegundos antes de continuar */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Reintenta una función async con backoff exponencial.
 * @param fn       Función a reintentar
 * @param retries  Número máximo de intentos
 * @param delay    Espera inicial en ms (se duplica en cada reintento)
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  let lastError: any
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastError = err
      // No reintentar en errores de autenticación / validación del servidor
      if (err?.response?.status === 401 || err?.response?.status === 400) throw err
      if (attempt < retries) {
        console.warn(`⚠️ Intento ${attempt}/${retries} fallido. Reintentando en ${delay}ms...`, err?.message)
        await sleep(delay)
        delay *= 2 // backoff exponencial
      }
    }
  }
  throw lastError
}

// ─────────────────────────────────────────────────────────────────
// PICKUP: Subida de imágenes base64 en chunks al Smart Batch
// ─────────────────────────────────────────────────────────────────

export interface BatchChunkOptions {
  pickupId: string
  images: string[] // Array de base64 strings
  clientPrice?: number
  deliveryCost?: number
  /** Imágenes por chunk (default: 10) */
  chunkSize?: number
  /** Máximo de reintentos por chunk (default: 3) */
  retries?: number
  /** Callback de progreso: (enviadas, total, currentChunkSize) */
  onProgress?: (sent: number, total: number, currentChunkSize?: number) => void
}

export interface BatchChunkResult {
  batch_id: string
  total_images: number
}

/**
 * Divide las imágenes en chunks y envía cada uno independientemente.
 * Retorna el batch_id del primer chunk (los demás se agregan al mismo batch).
 */
export async function uploadBatchChunked(opts: BatchChunkOptions): Promise<BatchChunkResult> {
  const {
    pickupId,
    images,
    clientPrice = 0,
    deliveryCost = 0,
    chunkSize = 3, // Reducido de 10 a 3 para evitar errores 413 de Cloudflare/Nginx
    retries = 3,
    onProgress,
  } = opts

  if (images.length === 0) throw new Error('No hay imágenes para subir.')

  const chunks: string[][] = []
  for (let i = 0; i < images.length; i += chunkSize) {
    chunks.push(images.slice(i, i + chunkSize))
  }

  // Sesión única para esta operación de subida completa.
  // Cada chunk recibe una clave de idempotencia única (pickup + índice de chunk + sesión),
  // lo que evita que el backend rechace chunks distintos que tengan el mismo hash de imágenes.
  const sessionId = Math.random().toString(36).substring(2, 10)

  let lastBatchId: string = ''
  let sent = 0

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const chunkNum = i + 1

    // Clave de idempotencia única por chunk: pickup + sesión + índice
    // Esto garantiza que chunk 0, chunk 1, chunk 2... no colisionen entre sí,
    // y que reintentos del MISMO chunk sí sean detectados correctamente.
    const idempotencyKey = `${pickupId}_s${sessionId}_c${i}`

    console.log(`📤 Enviando chunk ${chunkNum}/${chunks.length} (${chunk.length} imágenes)... key=${idempotencyKey}`)

    // El backend crea un batch propio por cada request, todos asociados al mismo pickup_id
    const payload = {
      pickup_id: pickupId,
      images: chunk,
      client_price: clientPrice,
      delivery_cost: deliveryCost,
      idempotency_key: idempotencyKey,
    }

    const response = await withRetry(
      () =>
        axios.post(`${BASE_URL}/smart-batch/upload`, payload, {
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          timeout: 60_000,
        }),
      retries,
    )

    lastBatchId = response.data?.batch_id ?? lastBatchId
    sent += chunk.length
    onProgress?.(sent, images.length, chunk.length)

    console.log(`✅ Chunk ${chunkNum}/${chunks.length} enviado.`)
  }

  return { batch_id: lastBatchId, total_images: images.length }
}

// ─────────────────────────────────────────────────────────────────
// EVIDENCIAS: Subida de archivos File[] en chunks al endpoint de entregas
// ─────────────────────────────────────────────────────────────────

export interface FilesChunkOptions {
  /** FormData base con los campos de texto (status, receiver_name, etc.) */
  baseFormData: FormData
  /** Archivos de foto a subir */
  files: File[]
  /** URL del endpoint destino, ej: /api/packages/:id/delivery */
  endpoint: string
  /** Imágenes por chunk (default: 3) */
  chunkSize?: number
  /** Máximo de reintentos por chunk (default: 3) */
  retries?: number
  /** Callback de progreso: (enviadas, total) */
  onProgress?: (sent: number, total: number) => void
}

/**
 * Sube los metadatos de la entrega en el primer chunk junto con las primeras fotos.
 * Los chunks adicionales solo agregan photos. Los campos de texto SOLO van en el primero.
 *
 * Si solo hay 1 chunk, se comporta exactamente como el request original.
 */
export async function uploadFilesChunked(opts: FilesChunkOptions): Promise<any> {
  const { baseFormData, files, endpoint, chunkSize = 3, retries = 3, onProgress } = opts

  const fullUrl = `${BASE_URL}${endpoint}`
  const headers = { ...getAuthHeaders() }

  // Si no hay archivos, enviar solo los metadatos
  if (files.length === 0) {
    return withRetry(() => axios.post(fullUrl, baseFormData, { headers, timeout: 30_000 }), retries)
  }

  const chunks: File[][] = []
  for (let i = 0; i < files.length; i += chunkSize) {
    chunks.push(files.slice(i, i + chunkSize))
  }

  let deliveryId: string | null = null
  let sent = 0

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const isFirst = i === 0
    const fd = new FormData()

    if (isFirst) {
      // Copiar todos los campos de texto del FormData original
      for (const [key, value] of (baseFormData as any).entries()) {
        if (key !== 'photos') fd.append(key, value)
      }
    } else {
      // En chunks posteriores, incluir solo el delivery_id para que el backend asocie las fotos
      fd.append('delivery_id', deliveryId ?? '')
      fd.append('photos_only', 'true')
    }

    chunk.forEach((file) => fd.append('photos', file))

    const response = await withRetry(() => axios.post(fullUrl, fd, { headers, timeout: 60_000 }), retries)

    if (isFirst && response.data?.delivery_id) {
      deliveryId = response.data.delivery_id
    }
    sent += chunk.length
    onProgress?.(sent, files.length)

    console.log(`✅ Chunk fotos ${i + 1}/${chunks.length} enviado. Delivery ID: ${deliveryId}`)
  }

  return { delivery_id: deliveryId }
}
