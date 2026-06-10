<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed, PropType, nextTick } from 'vue'
import { useForm, useToast } from 'vuestic-ui'
import { useRouter } from 'vue-router'
import { validators } from '../../../services/utils'
import api from '../../../services/api'
import { uploadBatchChunked } from '../../../composables/useChunkedUpload'
import { Package } from '../types'
import axios from 'axios'
import { debounce } from 'lodash'
const MAPBOX_API_KEY = import.meta.env.VITE_MAPBOX_API_KEY
const router = useRouter()
// --- DEFINICIÓN DE PROPS Y EMITS ---
const props = defineProps({
  pkg: { type: Object as PropType<Package | null>, default: null },
  pickupId: { type: String, default: '' },
  clientId: { type: String, default: '' },
  clientName: { type: String, default: '' },
  prefillPickupData: { type: Boolean, default: false },
})
const emit = defineEmits<{
  (event: 'save', payload: PackageFormData): void
  (event: 'close'): void
}>()
// --- INTERFAZ PARA LOS DATOS DEL FORMULARIO ---
interface PackageFormData {
  tracking_code: string
  external_tracking_code: string | null
  pickup_id: string
  client_id: string
  is_cod: boolean
  cod_amount: number
  client_price: number
  delivery_cost: number
  destination_address: string
  recipient_name: string
  recipient_phone: string
  scanned_at_origin_datetime: string
}
type BatchOcrStatus = 'success' | 'not_found' | 'error' | 'invalid'
interface BatchOcrResult {
  index: number
  status: BatchOcrStatus
  text?: string
  overlay?: { texto: string; confianza: number }[]
  message?: string
}
// --- CONFIGURACIÓN DE FORMULARIO Y NOTIFICACIONES ---
const { validate, reset, resetValidation } = useForm('package-form')
const { init: notify } = useToast()
// --- ESTADO REACTIVO DEL FORMULARIO ---
const tracking_code = ref('')
const external_tracking_code = ref('')
const pickup_id = ref<string>('')
const client_id = ref<string>('')
const is_cod = ref(false)
const cod_amount = ref<number>(0)
const is_change = ref(false)
const client_price = ref<number>(0)
const delivery_cost = ref<number>(0)
const destination_address = ref('')
const recipient_name = ref('')
const recipient_phone = ref('')
const scanned_at_origin_datetime = ref(new Date())
const searchResults = ref<any[]>([])
const isLoadingSearch = ref(false)
const mapboxError = ref(false)
const searchAddress = async () => {
  if (destination_address.value.length < 4) {
    searchResults.value = []
    return
  }
  // Verificar si la clave de API está disponible
  if (!MAPBOX_API_KEY) {
    console.warn('Clave de API de Mapbox no configurada')
    mapboxError.value = true
    return
  }
  isLoadingSearch.value = true
  const searchText = encodeURIComponent(destination_address.value)
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${searchText}.json`
  try {
    const response = await axios.get(url, {
      params: {
        access_token: MAPBOX_API_KEY,
        country: 'CL', // Limitar a Chile
        autocomplete: true, // Habilitar sugerencias
        // Opcional: Dar prioridad a resultados cerca de una ubicación
        proximity: '-70.6506,-33.4372', // Coordenadas de Santiago
      },
    })
    // La respuesta de Mapbox está en `response.data.features`
    searchResults.value = response.data.features
    mapboxError.value = false // Reset error state on success
  } catch (error: any) {
    console.error('Error buscando dirección con Mapbox:', error)
    // Manejar diferentes tipos de errores
    if (error.response?.status === 401) {
      mapboxError.value = true
      notify({
        message:
          'Error de configuración: La clave de API de Mapbox no es válida. Puedes ingresar la dirección manualmente.',
        color: 'warning',
      })
    } else {
      notify({
        message: 'Error temporal en la búsqueda de direcciones. Puedes ingresar la dirección manualmente.',
        color: 'warning',
      })
    }
    searchResults.value = []
  } finally {
    isLoadingSearch.value = false
  }
}
const debouncedSearch = debounce(searchAddress, 500)
const selectAddress = (result: any) => {
  // `place_name` de Mapbox contiene la dirección completa y formateada
  destination_address.value = result.place_name
  searchResults.value = []
}
// --- ESTADO PARA LA CÁMARA Y OCR ---
const video = ref<HTMLVideoElement | null>(null)
const isCameraActive = ref(false)
const isProcessing = ref(false)
let cameraStream: MediaStream | null = null

// AudioContext global para reutilizar (evita el límite de 6 contextos)
let globalAudioContext: AudioContext | null = null
// Hardware zoom capabilities and level
const cameraCapabilities = ref<any>(null)
const hardwareZoomLevel = ref<number>(1)
// Indica si el navegador/contexto soporta getUserMedia (evaluado en cliente)
const supportsMediaDevices = ref<boolean>(false)
const hardwareFocusLevel = ref<number>(0.5)
// Intervalos de re-enfoque para limpiarlos cuando se detenga la cámara
let refocusIntervals: NodeJS.Timeout[] = []
// Lista de dispositivos de cámara y selector visual
const videoDevicesList = ref<{ label: string; deviceId: string }[]>([])
const showCameraModal = ref(false)
const selectedDeviceId = ref<string>('')
// Hidden native capture input ref and opener for mobile rear camera
const fileCaptureInput = ref<HTMLInputElement | null>(null)
const openDeviceCamera = () => {
  if (fileCaptureInput.value) {
    // clear to allow same-file reselect
    try {
      fileCaptureInput.value.value = ''
    } catch (e) {}
    isBatchMode.value = true
    notify({ message: 'Abriendo cámara nativa del dispositivo...', color: 'info' })
    fileCaptureInput.value.click()
  } else {
    notify({ message: 'No es posible abrir la cámara nativa en este dispositivo.', color: 'warning' })
  }
}
// Multi-capture control (auto re-open native camera after each capture)
const multiCaptureEnabled = ref<boolean>(false)
// Current active device and helper list
const currentDeviceId = ref<string>('')
const availableVideoDevices = ref<MediaDeviceInfo[]>([])
const getVideoDevices = async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [] as MediaDeviceInfo[]
  try {
    // Primero solicitar permisos para obtener etiquetas completas
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true })
      tempStream.getTracks().forEach((track) => track.stop())
    } catch (permError) {
      console.warn('No se pudieron obtener permisos para enumerar dispositivos:', permError)
    }

    const devices = await navigator.mediaDevices.enumerateDevices()
    availableVideoDevices.value = devices.filter((d) => d.kind === 'videoinput')
    return availableVideoDevices.value
  } catch (e) {
    console.log('Error enumerando dispositivos:', e)
    return [] as MediaDeviceInfo[]
  }
}
const switchToDevice = async (deviceId: string) => {
  try {
    stopCamera()
    await new Promise((resolve) => setTimeout(resolve, 200))
    await connectToCamera(deviceId)
    currentDeviceId.value = deviceId
  } catch (e) {
    console.error('Error al cambiar de cámara:', e)
    notify({ message: 'No se pudo cambiar de cámara.', color: 'danger' })
  }
}
// --- ESTADO PARA CAPTURA Y OCR BATCH ---
const batchImages = ref<string[]>([])
const batchOcrResults = ref<BatchOcrResult[]>([])
const isBatchMode = ref(false)
const isBatchProcessing = ref(false)
const batchError = ref('')
// Computed para el conteo de fotos (asegura reactividad)
const batchImagesCount = computed(() => batchImages.value.length)
// --- ESTADO PARA MODAL DE DUPLICADOS ---
const showDuplicateModal = ref(false)
const duplicateModalData = ref<{
  queueId: string
  externalCode: string
  originalPackage: any
  newScanData: any
} | null>(null)
function clearBatch() {
  batchImages.value = []
  batchOcrResults.value = []
  batchError.value = ''
}
// Función para eliminar una imagen individual del batch
function removeBatchImage(index: number) {
  if (index >= 0 && index < batchImages.value.length) {
    // Crear nuevo array sin la imagen en el índice especificado
    batchImages.value = batchImages.value.filter((_, i) => i !== index)
    // También eliminar el resultado OCR correspondiente si existe
    if (batchOcrResults.value.length > index) {
      batchOcrResults.value = batchOcrResults.value.filter((_, i) => i !== index)
    }
    notify({
      message: 'Imagen eliminada del batch',
      color: 'info',
      duration: 1500,
    })
  }
}
function getBatchStatusColor(status: BatchOcrStatus) {
  switch (status) {
    case 'success':
      return 'text-green-600'
    case 'error':
      return 'text-red-600'
    default:
      return 'text-amber-600'
  }
}
// Función para dar feedback táctil y sonoro al capturar
function playCaptureFeedback() {
  // 1. Vibración (si está disponible)
  if ('vibrate' in navigator) {
    // Vibración corta de 50ms - similar al click de una cámara
    navigator.vibrate(50)
  }

  // 2. Sonido de captura (beep/click)
  try {
    // Crear o reutilizar el contexto de audio global (evita el límite de 6 contextos)
    if (!globalAudioContext) {
      globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    }

    // Reanudar el contexto si está suspendido (política de autoplay)
    if (globalAudioContext.state === 'suspended') {
      globalAudioContext.resume()
    }

    // Crear un oscilador para generar el tono
    const oscillator = globalAudioContext.createOscillator()
    const gainNode = globalAudioContext.createGain()

    // Configurar el sonido: frecuencia alta y corta (como un click)
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(1200, globalAudioContext.currentTime) // 1200 Hz - tono agudo

    // Volumen moderado
    gainNode.gain.setValueAtTime(0.3, globalAudioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, globalAudioContext.currentTime + 0.05) // Fade out rápido

    // Conectar y reproducir
    oscillator.connect(gainNode)
    gainNode.connect(globalAudioContext.destination)
    oscillator.start(globalAudioContext.currentTime)
    oscillator.stop(globalAudioContext.currentTime + 0.05) // Duración muy corta: 50ms

    // Limpiar el oscillator después de usarlo (libera recursos)
    oscillator.onended = () => {
      oscillator.disconnect()
      gainNode.disconnect()
    }
  } catch (error) {
    // Si falla el audio, no es crítico
    console.log('Audio feedback no disponible:', error)
  }
}

async function captureBatchImage() {
  if (!video.value || !cameraStream) return

  let imageBase64 = ''

  // 🎨 Método Canvas: Se utiliza como método principal porque ImageCapture y
  // applyQuickFocus añaden retrasos severos (1 a 10 segundos) en móviles
  // y causan memory leaks nativos en Chrome móvil.
  if (!imageBase64) {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', {
      alpha: false,
      desynchronized: false,
      willReadFrequently: false,
    })
    const videoElement = video.value

    // Capturar a la resolución completa del video (sin recortar tanto)
    // Esto maximiza la calidad de la captura
    const effectiveScale = 1
    const DISPLAY_CROP_WIDTH_PERCENT = Math.min(0.95 / effectiveScale, 1) // Aumentado de 0.9 a 0.95
    const DISPLAY_CROP_HEIGHT_PERCENT = Math.min(0.95 / effectiveScale, 1) // Aumentado de 0.8 a 0.95
    const displayedVideoWidth = videoElement.clientWidth
    const displayedVideoHeight = videoElement.clientHeight
    const displayedCropWidth = displayedVideoWidth * DISPLAY_CROP_WIDTH_PERCENT
    const displayedCropHeight = displayedVideoHeight * DISPLAY_CROP_HEIGHT_PERCENT
    const displayedCropX = (displayedVideoWidth - displayedCropWidth) / 2
    const displayedCropY = (displayedVideoHeight - displayedCropHeight) / 2

    // Usar la resolución completa del video (no limitar por el display)
    // Esto captura a la máxima resolución disponible del stream
    const videoWidth = videoElement.videoWidth
    const videoHeight = videoElement.videoHeight

    // Calcular el área de captura basada en la resolución real del video
    const scaleX = videoWidth / displayedVideoWidth
    const scaleY = videoHeight / displayedVideoHeight
    const cropWidth = Math.round(displayedCropWidth * scaleX)
    const cropHeight = Math.round(displayedCropHeight * scaleY)
    const cropX = Math.round(displayedCropX * scaleX)
    const cropY = Math.round(displayedCropY * scaleY)

    // Usar la resolución completa del video para máxima calidad
    canvas.width = videoWidth
    canvas.height = videoHeight

    if (context) {
      // Configurar máxima calidad de renderizado
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      // Dibujar el video completo primero
      context.drawImage(videoElement, 0, 0, videoWidth, videoHeight)

      // Si hay recorte, crear un nuevo canvas con el área recortada
      if (cropX > 0 || cropY > 0 || cropWidth < videoWidth || cropHeight < videoHeight) {
        const croppedCanvas = document.createElement('canvas')
        croppedCanvas.width = cropWidth
        croppedCanvas.height = cropHeight
        const croppedContext = croppedCanvas.getContext('2d')
        if (croppedContext) {
          croppedContext.imageSmoothingEnabled = true
          croppedContext.imageSmoothingQuality = 'high'
          croppedContext.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)
          // Usar el canvas recortado
          canvas.width = cropWidth
          canvas.height = cropHeight
          const finalContext = canvas.getContext('2d')
          if (finalContext) {
            finalContext.imageSmoothingEnabled = true
            finalContext.imageSmoothingQuality = 'high'
            finalContext.drawImage(croppedCanvas, 0, 0)
          }
        }
      }
    }

    // Optimizar imagen: Reducir a Full HD para velocidad
    let optimizedCanvas = canvas
    const MAX_WIDTH = 1920 // Reducido de 4K a 1920px para acelerar subida (suficiente para OCR)
    if (canvas.width > MAX_WIDTH) {
      const ratio = MAX_WIDTH / canvas.width
      const newHeight = Math.round(canvas.height * ratio)
      optimizedCanvas = document.createElement('canvas')
      optimizedCanvas.width = MAX_WIDTH
      optimizedCanvas.height = newHeight
      const optContext = optimizedCanvas.getContext('2d')
      if (optContext) {
        optContext.imageSmoothingEnabled = true
        optContext.imageSmoothingQuality = 'high'
        optContext.drawImage(canvas, 0, 0, MAX_WIDTH, newHeight)
      }
    }

    // Calidad 0.8 es buen balance entre nitidez y peso
    const imageQuality = 0.8
    imageBase64 = optimizedCanvas.toDataURL('image/jpeg', imageQuality)
    console.log('📸 Captura optimizada (Full HD, q=0.8)')
    console.log('📊 Resolución final:', optimizedCanvas.width, 'x', optimizedCanvas.height)
  }

  // Forzar reactividad creando un nuevo array
  batchImages.value = [...batchImages.value, imageBase64]

  // 🎯 Feedback inmediato: vibración + sonido
  playCaptureFeedback()

  // Notificación visual del conteo actualizado
  await nextTick()
  console.log(`📸 Foto capturada. Total: ${batchImagesCount.value} fotos`)
}
async function processBatchOcr() {
  // 🛡️ Protección contra doble-clic / doble procesamiento
  if (isBatchProcessing.value) {
    console.warn('⚠️ Ya hay un batch en procesamiento, ignorando solicitud duplicada')
    return
  }

  if (batchImages.value.length === 0) {
    batchError.value = 'No hay imágenes para procesar.'
    return
  }
  if (!props.pickupId) {
    batchError.value = 'No se ha seleccionado un pickup. Guarda el paquete primero.'
    notify({ message: 'Debes tener un pickup activo para procesar el batch', color: 'warning' })
    return
  }
  isBatchProcessing.value = true
  batchError.value = ''
  try {
    console.log('🚀 Enviando batch al Smart OCR System (modo chunked)...')
    console.log('📦 Pickup ID:', props.pickupId)
    console.log('📸 Imágenes:', batchImages.value.length)

    // Cargar precios antes de enviar el batch
    await Promise.all([
      loadClientPrice(props.clientId || client_id.value),
      loadPickupDriverCost(props.pickupId || pickup_id.value),
    ])

    const totalImages = batchImages.value.length
    const chunkSize = 3 // Reducido para evitar el bloqueo 413 o de Cloudflare
    const totalChunks = Math.ceil(totalImages / chunkSize)

    notify({
      message: `📤 Preparando envío de ${totalImages} imágenes en ${totalChunks} partes...`,
      color: 'info',
      duration: 3000,
    })

    const result = await uploadBatchChunked({
      pickupId: props.pickupId,
      images: [...batchImages.value], // we copy so loop inside useChunkedUpload isn't affected
      clientPrice: client_price.value,
      deliveryCost: delivery_cost.value,
      chunkSize,
      retries: 3,
      onProgress: (sent, total, currentChunkSize) => {
        notify({
          message: `📤 Enviando... ${sent}/${total} imágenes subidas`,
          color: 'info',
          duration: 2000,
        })
        if (currentChunkSize) {
          batchImages.value.splice(0, currentChunkSize)
        }
      },
    })

    console.log('✅ Batch subido exitosamente!')
    console.log('📦 Batch ID:', result.batch_id)

    notify({
      message: `✅ ¡${result.total_images} imágenes enviadas en ${totalChunks} parte(s)!\nBatch ID: ${result.batch_id}`,
      color: 'success',
      duration: 5000,
    })

    batchImages.value = []
    batchOcrResults.value = []
    stopCamera()
    isBatchMode.value = false

    setTimeout(() => {
      notify({
        message: '🚀 Batch enviado. Procesando en segundo plano...',
        color: 'info',
        duration: 3000,
      })
    }, 100)

    setTimeout(() => {
      console.log('🔀 Redirigiendo a /pickups...')
      router.push('/pickups')
    }, 500)
  } catch (error: any) {
    console.error('❌ Error al enviar batch:', error)
    const message = error?.response?.data?.error || error?.message || 'Error al enviar el batch al servidor.'
    batchError.value = message
    notify({ message: `❌ ${message}`, color: 'danger' })
  } finally {
    isBatchProcessing.value = false
  }
}
function rellenarDesdeBatch(idx: number) {
  const result = batchOcrResults.value[idx]
  if (result && result.status === 'success' && result.text) {
    rellenarFormulario(result.text)
  } else {
    notify({ message: 'No hay texto disponible para esta captura.', color: 'warning' })
  }
}
// --- ESTADO PARA CARGA DE DATOS ASÍNCRONOS ---
const pickups = ref<{ text: string; value: string }[]>([])
const clients = ref<{ text: string; value: string }[]>([])
const isLoading = ref(true)
const hasError = ref(false)
// --- CACHÉ PARA OPTIMIZAR LLAMADAS A LA API ---
const clientPricingCache = ref<Record<string, number>>({})
const pickupDriverCostCache = ref<Record<string, number>>({})
// --- PROPIEDADES COMPUTADAS ---
const isEditing = computed(() => !!props.pkg)
const isPickupContext = computed(() => props.prefillPickupData && props.pickupId && props.clientId)
// --- FUNCIONES DE LÓGICA DE NEGOCIO ---
const generateTrackingCode = () =>
  `PKG${Date.now().toString().slice(-6)}${Math.random().toString(36).substring(2, 5).toUpperCase()}`
const loadClientPrice = async (clientId: string) => {
  if (!clientId) {
    client_price.value = 0
    return
  }
  try {
    const cachedPrice = clientPricingCache.value[clientId]
    if (cachedPrice !== undefined) {
      client_price.value = cachedPrice
      return
    }
    const { data } = await api.getClientPricing(clientId)
    const price = parseFloat(data?.base_price) || 0
    client_price.value = price
    clientPricingCache.value[clientId] = price
  } catch (error) {
    console.error('Error loading client price:', error)
    client_price.value = 0
    notify({
      message: 'No se pudo cargar el precio del cliente. Usando valor por defecto (0).',
      color: 'warning',
    })
  }
}
const loadPickupDriverCost = async (pickupId: string) => {
  if (!pickupId) {
    delivery_cost.value = 0
    return
  }
  try {
    const cachedCost = pickupDriverCostCache.value[pickupId]
    if (cachedCost !== undefined) {
      delivery_cost.value = cachedCost
      return
    }
    const { data } = await api.getPickupById(pickupId)
    const cost = parseFloat(data?.user?.vehicles?.[0]?.vehicleType?.base_delivery_cost) || 0
    delivery_cost.value = cost
    pickupDriverCostCache.value[pickupId] = cost
    if (!cost) {
      notify({
        message: 'No se encontró costo de entrega. Usando valor por defecto (0).',
        color: 'warning',
      })
    }
  } catch (error) {
    console.error('Error loading delivery cost:', error)
    delivery_cost.value = 0
    notify({
      message: 'Error al cargar costo de entrega. Usando valor por defecto (0).',
      color: 'danger',
    })
  }
}
const resetFormForPickup = () => {
  reset()
  resetValidation()
  tracking_code.value = generateTrackingCode()
  external_tracking_code.value = ''
  pickup_id.value = props.pickupId
  client_id.value = props.clientId
  is_cod.value = false
  cod_amount.value = 0
  destination_address.value = ''
  recipient_name.value = ''
  recipient_phone.value = ''
  scanned_at_origin_datetime.value = new Date()
  loadPickupDriverCost(props.pickupId)
  loadClientPrice(props.clientId)
}
// --- LÓGICA DE CÁMARA ---
const checkCameraPermissions = async (): Promise<boolean> => {
  try {
    // Verificar si los permisos están disponibles
    if (navigator.permissions) {
      const permission = await navigator.permissions.query({ name: 'camera' as PermissionName })
      console.log('Estado del permiso de cámara:', permission.state)
      if (permission.state === 'denied') {
        notify({
          message: 'Los permisos de cámara están denegados. Por favor, habilítalos en la configuración del navegador.',
          color: 'danger',
        })
        return false
      }
    }
    // Verificar si getUserMedia está disponible
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      notify({
        message: 'Tu navegador no soporta acceso a la cámara.',
        color: 'danger',
      })
      return false
    }
    return true
  } catch (error) {
    console.log('No se pudieron verificar los permisos:', error)
    return true // Continuar de todos modos
  }
}
const initializeCamera = async () => {
  if (isCameraActive.value) return
  if (!navigator.mediaDevices) {
    notify({
      message:
        'navigator.mediaDevices no disponible en este navegador/contexto. En iOS Safari debes usar HTTPS o abrir la app desde el mismo dispositivo. Prueba desde la máquina host o configura HTTPS (ej. ngrok).',
      color: 'danger',
    })
    return
  }
  // Verificar permisos primero
  const hasPermissions = await checkCameraPermissions()
  if (!hasPermissions) {
    return
  }
  isCameraActive.value = true
  await nextTick()
  if (!video.value) {
    console.error('El elemento de video no se encontró en el DOM.')
    isCameraActive.value = false
    return
  }
  try {
    let stream: MediaStream | null = null
    // Obtener lista de dispositivos para seleccionar Iriun si está disponible
    let iriunDeviceId: string | undefined
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices.filter((device) => device.kind === 'videoinput')
      // Buscar Iriun Webcam por nombre
      const iriunDevice = videoDevices.find(
        (device) =>
          device.label?.toLowerCase().includes('iriun') ||
          device.label?.toLowerCase().includes('webcam') ||
          device.label?.toLowerCase().includes('virtual'),
      )
      if (iriunDevice) {
        iriunDeviceId = iriunDevice.deviceId
        console.log('🎥 Dispositivo Iriun encontrado:', iriunDevice.label)
      } else {
        console.log('📷 No se detectó Iriun, usando cámara por defecto')
      }
    } catch (enumError) {
      console.log('No se pudieron enumerar dispositivos:', enumError)
    }
    // Paso 1: Solicitar permisos de cámara con config básica
    try {
      await navigator.mediaDevices.getUserMedia({ video: true })
    } catch (permError) {
      notify({ message: 'No se pudo obtener permisos de cámara.', color: 'danger' })
      throw permError
    }
    // Paso 2: Enumerar dispositivos de video y buscar la cámara trasera
    let devices: MediaDeviceInfo[] = []
    try {
      devices = await navigator.mediaDevices.enumerateDevices()
    } catch (e) {
      console.log('No se pudieron enumerar dispositivos:', e)
    }
    const videoDevices = devices.filter((device) => device.kind === 'videoinput')
    const backCamera = videoDevices.find((device) => {
      const label = device.label.toLowerCase()
      return (
        label.includes('back') ||
        label.includes('rear') ||
        label.includes('environment') ||
        label.includes('principal') ||
        label.includes('trasera')
      )
    })
    // Paso 3: Mostrar selector visual si hay más de una cámara
    let selectedDeviceId = ''
    if (videoDevices.length > 1) {
      // Simple selector visual (prompt)
      const cameraOptions = videoDevices.map((d, i) => `${i + 1}: ${d.label || 'Cámara ' + (i + 1)}`).join('\n')
      const choice = prompt(`Selecciona la cámara a usar:
${cameraOptions}
Ingresa el número correspondiente:`)
      let idx = parseInt(choice || '1', 10) - 1
      if (isNaN(idx) || idx < 0 || idx >= videoDevices.length) idx = 0
      selectedDeviceId = videoDevices[idx].deviceId
      notify({ message: `Cámara seleccionada: ${videoDevices[idx].label || 'Cámara ' + (idx + 1)}`, color: 'info' })
    } else if (backCamera) {
      selectedDeviceId = backCamera.deviceId
      notify({ message: 'Cámara trasera detectada y seleccionada.', color: 'success' })
    } else if (videoDevices.length > 0) {
      selectedDeviceId = videoDevices[0].deviceId
      notify({ message: 'No se detectó cámara trasera. Usando la primera disponible.', color: 'warning' })
    } else {
      notify({ message: 'No se detectó ninguna cámara de video.', color: 'danger' })
      throw new Error('No se detectó ninguna cámara de video.')
    }
    // Paso 4: Conectar a la cámara seleccionada
    const config = {
      video: {
        deviceId: { exact: selectedDeviceId },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia(config)
      console.log('✅ Configuración de cámara exitosa')
    } catch (configError) {
      console.log('❌ Configuración falló:', configError)
      notify({ message: 'No se pudo acceder a la cámara seleccionada.', color: 'danger' })
      throw configError
    }
    cameraStream = stream
    video.value.srcObject = stream
    await video.value.play()
    // Intentar reducir zoom si está disponible (usando any para evitar errores de tipos)
    try {
      const videoTrack = stream.getVideoTracks()[0]
      if (videoTrack && videoTrack.getCapabilities) {
        const capabilities = videoTrack.getCapabilities() as any
        cameraCapabilities.value = capabilities
        console.log('Capacidades de la cámara:', capabilities)
        if (capabilities?.zoom && capabilities.zoom.min !== undefined) {
          hardwareZoomLevel.value = capabilities.zoom.min
          await videoTrack.applyConstraints({
            advanced: [{ zoom: capabilities.zoom.min } as any],
          })
          console.log('✅ Zoom ajustado al mínimo')
        }
        if (capabilities?.focusMode && capabilities.focusMode.includes('manual')) {
          hardwareFocusLevel.value = 0.5
          await videoTrack.applyConstraints({
            advanced: [{ focusMode: 'manual', focusDistance: 0.5 } as any],
          })
          console.log('✅ Focus ajustado a manual')
        }
      }
    } catch (zoomError) {
      console.log('No se pudo ajustar el zoom:', zoomError)
    }
  } catch (err: any) {
    console.error('Error al acceder a la cámara:', err)
    let errorMessage = 'No se pudo acceder a la cámara.'
    let showDiagnostic = false
    if (err.name === 'NotReadableError' || err.message.includes('Could not start video source')) {
      errorMessage =
        '🔒 La cámara está ocupada por otra aplicación. Cierra aplicaciones como Zoom, Teams, OBS, Iriun Webcam, etc. y usa "Reiniciar Cámara".'
      showDiagnostic = true
    } else if (err.name === 'NotAllowedError') {
      errorMessage = '❌ Permisos de cámara denegados. Permite el acceso en la barra de direcciones del navegador.'
    } else if (err.name === 'NotFoundError') {
      errorMessage = '📷 No se encontró ninguna cámara en el dispositivo.'
    } else if (err.name === 'OverconstrainedError') {
      errorMessage = '⚙️ Las configuraciones de cámara no son compatibles. Intenta con "Diagnóstico".'
      showDiagnostic = true
    } else if (err.message.includes('No se pudo obtener acceso a ninguna cámara')) {
      errorMessage = '🔍 Todas las configuraciones de cámara fallaron. Usa "Diagnóstico" para más información.'
      showDiagnostic = true
    }
    notify({
      message: errorMessage + (showDiagnostic ? ' Usa el botón "Diagnóstico" para más información.' : ''),
      color: 'danger',
    })
    isCameraActive.value = false
    cameraStream = null
  }
}
const stopCamera = () => {
  // Limpiar todos los intervalos de re-enfoque
  refocusIntervals.forEach((interval) => clearInterval(interval))
  refocusIntervals = []

  // Limpiar referencias globales de enfoque
  currentVideoTrack = null
  focusCapabilities = null

  // Remover event listener de tap-to-focus
  if (video.value) {
    video.value.removeEventListener('click', handleTapToFocus)
    video.value.removeEventListener('touchstart', handleTapToFocus)
  }

  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop())
    cameraStream = null
  }
  if (video.value) {
    video.value.srcObject = null
  }
  isCameraActive.value = false
}

// Función para manejar tap-to-focus (enfoque al tocar la imagen)
const handleTapToFocus = async (event: MouseEvent | TouchEvent) => {
  if (!video.value || !currentVideoTrack || !cameraStream) return

  event.preventDefault()
  event.stopPropagation()

  try {
    // Obtener coordenadas del toque/clic
    let clientX: number, clientY: number
    if (event instanceof TouchEvent) {
      if (event.touches.length === 0) return
      clientX = event.touches[0].clientX
      clientY = event.touches[0].clientY
    } else {
      clientX = event.clientX
      clientY = event.clientY
    }

    // Obtener posición del video en la pantalla
    const rect = video.value.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top

    // Normalizar coordenadas (0-1)
    const normalizedX = Math.max(0, Math.min(1, x / rect.width))
    const normalizedY = Math.max(0, Math.min(1, y / rect.height))

    console.log(`🎯 Tap-to-focus en: (${normalizedX.toFixed(2)}, ${normalizedY.toFixed(2)})`)

    // Obtener el track de video actual (no usar variables globales que pueden estar desactualizadas)
    const videoTrack = cameraStream.getVideoTracks()[0]
    if (!videoTrack) return

    // Obtener capacidades directamente del track actual
    const capabilities = videoTrack.getCapabilities() as any
    console.log('🔧 Capacidades de enfoque de la cámara actual:', capabilities.focusMode)

    // Detectar qué modos de enfoque están disponibles para esta cámara específica
    let currentHasSingleShot = false
    let currentHasContinuous = false

    if (capabilities.focusMode) {
      if (Array.isArray(capabilities.focusMode)) {
        currentHasSingleShot = capabilities.focusMode.includes('single-shot')
        currentHasContinuous = capabilities.focusMode.includes('continuous')
        console.log(`📷 Modos disponibles: single-shot=${currentHasSingleShot}, continuous=${currentHasContinuous}`)
      }
    }

    // Aplicar focus usando single-shot (forzará re-enfoque completo)
    // Nota: La API web no soporta pointOfInterest directamente, pero single-shot
    // forzará a la cámara a re-enfocar, y muchos dispositivos enfocan automáticamente
    // en el área central o donde detectan objetos
    if (currentHasSingleShot || currentHasContinuous) {
      try {
        // Priorizar single-shot si está disponible (más efectivo para tap-to-focus)
        const focusMode = currentHasSingleShot ? 'single-shot' : 'continuous'

        console.log(
          `🎯 Aplicando focus ${focusMode} en posición (${normalizedX.toFixed(2)}, ${normalizedY.toFixed(2)})`,
        )

        await videoTrack.applyConstraints({
          advanced: { focusMode: focusMode },
        })
        console.log(`✅ Focus aplicado usando ${focusMode}`)

        // Mostrar indicador visual de enfoque
        showFocusIndicator(normalizedX, normalizedY)
      } catch (e) {
        console.warn('⚠️ No se pudo aplicar focus:', e)
        // Mostrar indicador de todas formas
        showFocusIndicator(normalizedX, normalizedY)
      }
    } else {
      console.warn('⚠️ Esta cámara no tiene modos de enfoque disponibles')
      // Si no hay focusMode disponible, al menos mostrar el indicador
      showFocusIndicator(normalizedX, normalizedY)
    }
  } catch (error) {
    console.error('❌ Error en tap-to-focus:', error)
  }
}

// Función helper para agregar event listeners de tap-to-focus
const setupTapToFocus = () => {
  if (!video.value) return

  // Remover listeners anteriores si existen
  video.value.removeEventListener('click', handleTapToFocus)
  video.value.removeEventListener('touchstart', handleTapToFocus)

  // Agregar listeners para click (desktop) y touchstart (móvil)
  video.value.addEventListener('click', handleTapToFocus)
  video.value.addEventListener('touchstart', handleTapToFocus)

  // Hacer el video clickeable
  video.value.style.cursor = 'pointer'

  console.log('✅ Tap-to-focus activado')
}

// Función para mostrar indicador visual de enfoque
const showFocusIndicator = (x: number, y: number) => {
  // Crear o actualizar indicador visual
  let indicator = document.getElementById('focus-indicator')
  if (!indicator) {
    indicator = document.createElement('div')
    indicator.id = 'focus-indicator'
    indicator.style.cssText = `
      position: absolute;
      width: 60px;
      height: 60px;
      border: 2px solid #00ff00;
      border-radius: 50%;
      pointer-events: none;
      z-index: 1000;
      transition: all 0.3s ease;
      box-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
    `
    if (video.value) {
      const videoWrapper = video.value.parentElement
      if (videoWrapper) {
        videoWrapper.style.position = 'relative'
        videoWrapper.appendChild(indicator)
      }
    }
  }

  // Posicionar el indicador (x e y son coordenadas normalizadas 0-1)
  if (video.value && indicator.parentElement) {
    const rect = video.value.getBoundingClientRect()
    const parentRect = indicator.parentElement.getBoundingClientRect()
    // Calcular posición absoluta dentro del contenedor
    const absoluteX = rect.left - parentRect.left + x * rect.width
    const absoluteY = rect.top - parentRect.top + y * rect.height
    indicator.style.left = `${absoluteX - 30}px`
    indicator.style.top = `${absoluteY - 30}px`
    indicator.style.opacity = '1'

    // Animar el indicador
    indicator.style.transform = 'scale(1.2)'
    setTimeout(() => {
      if (indicator) {
        indicator.style.transform = 'scale(1)'
      }
    }, 200)

    // Ocultar después de 1 segundo
    setTimeout(() => {
      if (indicator) {
        indicator.style.opacity = '0'
        setTimeout(() => {
          if (indicator && indicator.parentElement) {
            indicator.parentElement.removeChild(indicator)
          }
        }, 300)
      }
    }, 1000)
  }
}
const applyHardwareZoom = async (level: number) => {
  if (!cameraStream || !cameraCapabilities.value?.zoom) return
  try {
    const videoTrack = cameraStream.getVideoTracks()[0]
    if (videoTrack) {
      const min = cameraCapabilities.value.zoom.min || 1
      const max = cameraCapabilities.value.zoom.max || 1
      const clampedLevel = Math.max(min, Math.min(max, level))
      await videoTrack.applyConstraints({
        advanced: [{ zoom: clampedLevel } as any],
      })
      hardwareZoomLevel.value = clampedLevel
      console.log('✅ Zoom hardware aplicado:', clampedLevel)
    }
  } catch (error) {
    console.log('No se pudo aplicar zoom hardware:', error)
  }
}
const applyHardwareFocus = async (level: number) => {
  if (!cameraStream || !cameraCapabilities.value?.focusMode?.includes('manual')) return
  try {
    const videoTrack = cameraStream.getVideoTracks()[0]
    if (videoTrack) {
      await videoTrack.applyConstraints({
        advanced: [{ focusMode: 'manual', focusDistance: level } as any],
      })
      hardwareFocusLevel.value = level
      console.log('✅ Focus hardware aplicado:', level)
    }
  } catch (error) {
    console.log('No se pudo aplicar focus hardware:', error)
  }
}
const quickFixCamera = async () => {
  notify({ message: '🔄 Intentando solución rápida...', color: 'info' })
  // Parar cualquier stream activo
  stopCamera()
  // Pausa más larga
  await new Promise((resolve) => setTimeout(resolve, 2000))
  // Intentar con configuración más simple
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      notify({
        message:
          'Tu navegador no soporta acceso a la cámara desde esta página. En móviles requiere HTTPS o usar la app desde el mismo dispositivo. Prueba desde un navegador en la máquina host o configura HTTPS (ngrok).',
        color: 'danger',
      })
      return
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: 320,
        height: 240,
      },
    })
    if (video.value) {
      cameraStream = stream
      video.value.srcObject = stream
      await video.value.play()
      isCameraActive.value = true
      notify({ message: '✅ Solución rápida exitosa con resolución baja', color: 'success' })
    }
  } catch (error) {
    console.error('Solución rápida falló:', error)
    notify({ message: '❌ Solución rápida falló. Verifica que no hay otras apps usando la cámara.', color: 'danger' })
  }
}

// Fallback: subir imagenes desde archivo cuando no hay soporte de cámara
const handleFileSelected = async (e: Event) => {
  const input = e.target as HTMLInputElement
  if (!input || !input.files || input.files.length === 0) return

  // Convertir y comprimir la(s) imagen(es) a base64 y agregarlas al batch
  let processed = 0
  const totalFiles = input.files.length

  for (let i = 0; i < totalFiles; i++) {
    const file = input.files[i]

    // Efecto de flash visual
    const flash = document.createElement('div')
    flash.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: white;
      opacity: 0.8;
      z-index: 9999;
      pointer-events: none;
    `
    document.body.appendChild(flash)
    setTimeout(() => flash.remove(), 100)

    // Promesa para comprimir sin bloquear la UI
    await new Promise<void>((resolve) => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const img = new Image()
        img.onload = () => {
          const MAX_WIDTH = 1920
          let width = img.width
          let height = img.height

          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width)
            width = MAX_WIDTH
          }

          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height

          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.imageSmoothingEnabled = true
            ctx.imageSmoothingQuality = 'high'
            ctx.drawImage(img, 0, 0, width, height)
          }

          const resultBase64 = canvas.toDataURL('image/jpeg', 0.8)

          // Forzar reactividad agregando la imagen encogida
          batchImages.value = [...batchImages.value, resultBase64]
          processed++

          // Feedback visual
          nextTick().then(() => {
            notify({
              message: `✅ Foto ${batchImagesCount.value} guardada (FHD)`,
              color: 'success',
              duration: 1500,
            })
          })

          // Cuando termina de procesar todas las fotos
          if (processed === totalFiles) {
            nextTick().then(() => {
              console.log(`✅ ${processed} foto(s) agregada(s) al batch (Total: ${batchImagesCount.value})`)
            })
            // Si multi-captura está habilitada, reabrir la cámara automáticamente
            if (multiCaptureEnabled.value && fileCaptureInput.value) {
              notify({
                message: '📸 Preparando siguiente captura...',
                color: 'info',
                duration: 800,
              })
              setTimeout(() => {
                try {
                  fileCaptureInput.value!.value = ''
                  fileCaptureInput.value!.click()
                  console.log('📱 Reabriendo cámara nativa automáticamente...')
                } catch (e) {
                  console.log('No se pudo reabrir la cámara automáticamente:', e)
                  notify({
                    message: '📸 Toca "Capturar más fotos" para continuar',
                    color: 'warning',
                    duration: 3000,
                  })
                }
              }, 800)
            } else {
              notify({
                message: `✅ ${processed} foto(s) lista(s). ${
                  multiCaptureEnabled.value ? '' : 'Activa "Captura Continua" para modo rápido.'
                }`,
                color: 'success',
                duration: 3000,
              })
            }
          }
          resolve()
        }
        img.src = ev.target?.result as string
      }
      reader.readAsDataURL(file)
    })
  }
  // Asegurar que el modo batch está activo
  if (!isBatchMode.value) {
    isBatchMode.value = true
  }
}
const selectIriunCamera = async () => {
  // Activar modo batch automáticamente
  isBatchMode.value = true
  batchImages.value = []
  batchOcrResults.value = []
  notify({ message: '🎥 Iniciando modo Batch con Iriun...', color: 'info' })
  try {
    stopCamera()
    await new Promise((resolve) => setTimeout(resolve, 1000))
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      notify({
        message:
          'No se puede acceder a la lista de dispositivos desde este navegador/contexto. En iOS es necesario usar HTTPS o abrir la app desde el mismo dispositivo. Prueba desde la máquina host o configura un túnel HTTPS (ej. ngrok).',
        color: 'danger',
      })
      return
    }
    const devices = await navigator.mediaDevices.enumerateDevices()
    const videoDevices = devices.filter((device) => device.kind === 'videoinput')
    // Buscar Iriun específicamente
    const iriunDevice = videoDevices.find(
      (device) =>
        device.label?.toLowerCase().includes('iriun') ||
        device.label?.toLowerCase().includes('webcam') ||
        device.label?.toLowerCase().includes('virtual'),
    )
    if (!iriunDevice) {
      notify({ message: '❌ No se encontró cámara Iriun. Verifica que esté conectada y funcionando.', color: 'danger' })
      return
    }
    console.log('🎥 Usando dispositivo Iriun:', iriunDevice.label)
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: iriunDevice.deviceId },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    })
    if (video.value) {
      cameraStream = stream
      video.value.srcObject = stream
      await video.value.play()
      isCameraActive.value = true
      notify({ message: `✅ Modo Batch activo - Captura todas las etiquetas`, color: 'success' })
    }
  } catch (error: any) {
    console.error('Error al conectar Iriun:', error)
    notify({ message: '❌ Error al conectar con Iriun. Usa "Diagnóstico" para más información.', color: 'danger' })
  }
}

// Variables globales para enfoque rápido
let currentVideoTrack: MediaStreamTrack | null = null
let focusCapabilities: any = null
let hasSingleShot = false
let hasContinuous = false

// Función MEJORADA para aplicar enfoque justo antes de capturar (optimizada para distancia media)
const applyQuickFocus = async () => {
  if (!currentVideoTrack || !focusCapabilities) return

  try {
    // ESTRATEGIA MEJORADA PARA DISTANCIA MEDIA: Forzar re-enfoque completo antes de capturar
    // Esto asegura que la etiqueta completa esté enfocada, no solo cuando está muy cerca

    if (hasSingleShot && hasContinuous) {
      // Estrategia óptima: usar single-shot para forzar re-enfoque completo a distancia media
      // Luego cambiar a continuous para mantener el enfoque
      await currentVideoTrack.applyConstraints({ advanced: { focusMode: 'single-shot' } })
      // Esperar tiempo suficiente para que el single-shot complete el enfoque a distancia media (400ms)
      await new Promise((resolve) => setTimeout(resolve, 400))

      // Cambiar a continuous para mantener el enfoque estable
      await currentVideoTrack.applyConstraints({ advanced: { focusMode: 'continuous' } })
      // Esperar un momento para que se estabilice
      await new Promise((resolve) => setTimeout(resolve, 100))
    } else if (hasSingleShot) {
      // Solo single-shot disponible: usarlo y esperar más tiempo
      await currentVideoTrack.applyConstraints({ advanced: { focusMode: 'single-shot' } })
      // Esperar tiempo suficiente para enfoque a distancia media (500ms)
      await new Promise((resolve) => setTimeout(resolve, 500))
    } else if (hasContinuous) {
      // Solo continuous: reforzar y esperar un poco más
      await currentVideoTrack.applyConstraints({ advanced: { focusMode: 'continuous' } })
      // Esperar más tiempo para que continuous se ajuste a distancia media (200ms)
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  } catch (e) {
    // Silenciar errores para no interrumpir el flujo de captura
  }
}

// Función optimizada para aplicar enfoque inicial (más rápida)
const applyImprovedFocus = async (videoTrack: MediaStreamTrack, capabilities: any) => {
  if (!videoTrack || !capabilities) {
    console.warn('⚠️ No se pueden aplicar configuraciones de enfoque: videoTrack o capabilities no disponibles')
    return
  }

  // Guardar referencias globales para uso rápido en capturas
  currentVideoTrack = videoTrack
  focusCapabilities = capabilities

  const advancedConstraints: any = {}

  // ESTRATEGIA OPTIMIZADA PARA DISTANCIA MEDIA: Priorizar single-shot (mejor para etiquetas completas)
  // Usar continuous como respaldo para mantener enfoque
  if (capabilities.focusMode) {
    if (Array.isArray(capabilities.focusMode)) {
      hasSingleShot = capabilities.focusMode.includes('single-shot')
      hasContinuous = capabilities.focusMode.includes('continuous')

      // Priorizar single-shot para mejor enfoque a distancia media (donde cabe toda la etiqueta)
      if (hasSingleShot) {
        advancedConstraints.focusMode = 'single-shot'
        console.log('🎯 Usando focusMode: single-shot (optimizado para distancia media)')
      } else if (hasContinuous) {
        advancedConstraints.focusMode = 'continuous'
        console.log('🎯 Usando focusMode: continuous (optimizado para velocidad)')
      } else if (capabilities.focusMode.includes('auto')) {
        advancedConstraints.focusMode = 'auto'
        console.log('🎯 Usando focusMode: auto')
      }
    }
  } else {
    // FALLBACK: Si la cámara no reporta focusMode, intentar aplicarlo de todas formas
    // Algunas cámaras soportan enfoque pero no lo reportan en las capacidades
    console.warn('⚠️ Cámara no reporta focusMode en capacidades, intentando aplicar de todas formas...')
    hasSingleShot = false
    hasContinuous = false

    // Intentar aplicar continuous primero (más común)
    try {
      await videoTrack.applyConstraints({ advanced: { focusMode: 'continuous' } })
      hasContinuous = true
      advancedConstraints.focusMode = 'continuous'
      console.log('✅ Focus continuous aplicado exitosamente (sin reportar en capacidades)')
    } catch (e1) {
      // Si continuous falla, intentar single-shot
      try {
        await videoTrack.applyConstraints({ advanced: { focusMode: 'single-shot' } })
        hasSingleShot = true
        advancedConstraints.focusMode = 'single-shot'
        console.log('✅ Focus single-shot aplicado exitosamente (sin reportar en capacidades)')
      } catch (e2) {
        console.warn('⚠️ No se pudo aplicar ningún modo de enfoque:', e2)
      }
    }
  }

  // Zoom ajustado para ver etiqueta completa (no mínimo, sino un valor medio-bajo)
  if (capabilities.zoom) {
    const minZoom = capabilities.zoom.min || 1
    const maxZoom = capabilities.zoom.max || 1
    // Usar zoom medio-bajo para permitir ver toda la etiqueta sin perder demasiado enfoque
    // Si el rango es pequeño, usar el mínimo. Si es grande, usar un valor intermedio
    if (maxZoom > minZoom * 2) {
      // Hay suficiente rango: usar un valor medio-bajo (25% del rango desde el mínimo)
      const zoomRange = maxZoom - minZoom
      advancedConstraints.zoom = minZoom + zoomRange * 0.25
      hardwareZoomLevel.value = advancedConstraints.zoom
      console.log('🔍 Aplicando zoom medio-bajo para ver etiqueta completa:', advancedConstraints.zoom)
    } else {
      // Rango pequeño: usar mínimo
      advancedConstraints.zoom = minZoom
      hardwareZoomLevel.value = minZoom
      console.log('🔍 Aplicando zoom mínimo:', advancedConstraints.zoom)
    }
  }

  // Exposición automática continua
  if (capabilities.exposureMode) {
    if (Array.isArray(capabilities.exposureMode) && capabilities.exposureMode.includes('continuous')) {
      advancedConstraints.exposureMode = 'continuous'
      console.log('💡 Aplicando exposureMode: continuous')
    }
  }

  // Estabilización de imagen (si está disponible para reducir borrosidad/mareo)
  if (capabilities.imageStabilizationMode) {
    if (Array.isArray(capabilities.imageStabilizationMode) && capabilities.imageStabilizationMode.includes('on')) {
      advancedConstraints.imageStabilizationMode = 'on'
      console.log('✅ Aplicando imageStabilizationMode: on')
    }
  }

  // Balance de blancos automático
  if (capabilities.whiteBalanceMode) {
    if (Array.isArray(capabilities.whiteBalanceMode) && capabilities.whiteBalanceMode.includes('continuous')) {
      advancedConstraints.whiteBalanceMode = 'continuous'
      console.log('⚪ Aplicando whiteBalanceMode: continuous')
    }
  }

  // Aplicar configuraciones con estrategia MEJORADA
  if (Object.keys(advancedConstraints).length > 0) {
    // Aplicar focus INMEDIATAMENTE (no esperar)
    if (advancedConstraints.focusMode) {
      try {
        await videoTrack.applyConstraints({ advanced: { focusMode: advancedConstraints.focusMode } })
        console.log('🎯 Focus aplicado INMEDIATAMENTE:', advancedConstraints.focusMode)
      } catch (e) {
        console.warn('⚠️ Error aplicando focus inmediato:', e)
      }
    }

    // Esperar tiempo suficiente para que el enfoque se ajuste a distancia media (aumentado a 600ms)
    await new Promise((resolve) => setTimeout(resolve, 600))

    try {
      // Intentar aplicar todas las configuraciones juntas
      await videoTrack.applyConstraints({ advanced: advancedConstraints })
      console.log('✅ Configuraciones avanzadas aplicadas:', advancedConstraints)
    } catch (err) {
      console.warn('⚠️ Error aplicando configuraciones juntas, intentando individualmente...', err)
      // Aplicar el resto individualmente
      for (const [key, value] of Object.entries(advancedConstraints)) {
        if (key === 'focusMode') continue // Ya se aplicó
        try {
          await videoTrack.applyConstraints({ advanced: { [key]: value } })
          console.log(`✅ ${key} aplicado correctamente:`, value)
        } catch (e: any) {
          console.warn(`⚠️ No se pudo aplicar ${key}:`, e.message)
        }
      }
    }

    // REFUERZO MEJORADO: Aplicar focus múltiples veces al inicio para distancia media
    if (advancedConstraints.focusMode) {
      const aggressiveRefocus = async (attempt: number, useSingleShot: boolean = false) => {
        try {
          // Si tenemos single-shot disponible, usarlo en los primeros intentos para forzar re-enfoque
          const focusModeToUse = useSingleShot && hasSingleShot ? 'single-shot' : advancedConstraints.focusMode
          await videoTrack.applyConstraints({ advanced: { focusMode: focusModeToUse } })
          console.log(`🎯 Focus reforzado (intento ${attempt}, modo: ${focusModeToUse})`)
        } catch (e) {
          console.warn(`⚠️ No se pudo reforzar focus (intento ${attempt}):`, e)
        }
      }

      // Estrategia mejorada: usar single-shot en los primeros intentos para forzar re-enfoque a distancia media
      // Luego cambiar a continuous para mantener
      if (hasSingleShot && hasContinuous) {
        // Intentos 1-2: usar single-shot para forzar re-enfoque a distancia media
        setTimeout(() => aggressiveRefocus(1, true), 500)
        setTimeout(() => aggressiveRefocus(2, true), 1000)
        // Intentos 3-4: usar continuous para mantener
        setTimeout(() => aggressiveRefocus(3, false), 1500)
        setTimeout(() => aggressiveRefocus(4, false), 2000)
      } else {
        // Solo un modo disponible: reforzar con ese modo
        setTimeout(() => aggressiveRefocus(1, false), 500)
        setTimeout(() => aggressiveRefocus(2, false), 1000)
        setTimeout(() => aggressiveRefocus(3, false), 1500)
      }
    }
  } else {
    console.warn('⚠️ No se encontraron capacidades de focusMode disponibles')
  }

  // Función para forzar re-enfoque periódico (optimizado para distancia media)
  const forceRefocus = async () => {
    if (!videoTrack || !capabilities.focusMode) return
    try {
      // Estrategia mejorada: usar single-shot periódicamente si está disponible para mantener enfoque a distancia media
      if (hasSingleShot && hasContinuous) {
        // Alternar entre single-shot y continuous para mantener enfoque preciso a distancia media
        await videoTrack.applyConstraints({ advanced: { focusMode: 'single-shot' } })
        // Después de un momento, volver a continuous
        setTimeout(async () => {
          try {
            await videoTrack.applyConstraints({ advanced: { focusMode: 'continuous' } })
          } catch (e) {
            // Silenciar errores
          }
        }, 300)
      } else if (hasContinuous) {
        await videoTrack.applyConstraints({ advanced: { focusMode: 'continuous' } })
      } else if (hasSingleShot) {
        await videoTrack.applyConstraints({ advanced: { focusMode: 'single-shot' } })
      }
    } catch (e) {
      // Silenciar errores de re-enfoque
    }
  }

  // Re-enfoque periódico: cada 3 segundos (para mantener enfoque a distancia media sin interferir demasiado)
  setTimeout(forceRefocus, 2000)
  const refocusInterval = setInterval(forceRefocus, 3000)
  refocusIntervals.push(refocusInterval)
}

const startBatchMode = async () => {
  // Activar modo batch
  isBatchMode.value = true
  batchImages.value = []
  batchOcrResults.value = []
  try {
    stopCamera()
    await new Promise((resolve) => setTimeout(resolve, 500))
    console.log('🎥 Iniciando modo batch optimizado...')
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      notify({
        message: 'Tu navegador no soporta acceso a cámara en este contexto. Usa HTTPS o localhost.',
        color: 'danger',
      })
      return
    }

    // Detectar dispositivo
    const isAndroid = /Android/i.test(navigator.userAgent)
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    console.log('📱 Dispositivo detectado:', isAndroid ? 'Android' : isIOS ? 'iOS' : 'Otro')

    // iOS: Usar flujo simplificado (como antes) - NO solicitar permisos primero
    if (isIOS) {
      console.log('📸 iOS detectado: usando flujo simplificado con facingMode...')
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { exact: 'environment' },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          aspectRatio: { ideal: 16 / 9 },
          focusMode: { ideal: 'continuous' },
        } as MediaTrackConstraints,
      }

      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        console.log('✅ Stream obtenido en iOS')
      } catch (exactError: any) {
        console.warn('⚠️ Configuración inicial falló, usando fallback básico...')
        constraints.video = {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          focusMode: { ideal: 'continuous' },
        }
        stream = await navigator.mediaDevices.getUserMedia(constraints)
      }

      // Continuar con el flujo estándar de iOS
      console.log('🎬 Activando UI de cámara en iOS...')
      isCameraActive.value = true
      await nextTick()
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 150))

      const maxAttempts = 60
      let attempts = 0
      while (attempts < maxAttempts) {
        if (!video.value) {
          const videoElements = document.querySelectorAll('video')
          if (videoElements.length > 0) {
            video.value = videoElements[0] as HTMLVideoElement
          }
        }
        if (video.value) {
          console.log('✅ Video element listo en iOS')
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 100))
        attempts++
      }

      if (!video.value) {
        console.error('❌ Video element no disponible en iOS')
        isCameraActive.value = false
        stream.getTracks().forEach((track) => track.stop())
        notify({ message: '❌ Error: No se pudo inicializar la cámara', color: 'danger' })
        return
      }

      cameraStream = stream
      video.value.srcObject = stream
      await video.value.play()

      const videoTrack = stream.getVideoTracks()[0]
      const settings = videoTrack.getSettings()
      const capabilities = videoTrack.getCapabilities() as any

      console.log('✅ Cámara activa en iOS:', videoTrack.label)
      console.log('📐 Resolución:', settings.width + 'x' + settings.height)

      cameraCapabilities.value = capabilities

      // Aplicar enfoque mejorado para iOS
      await applyImprovedFocus(videoTrack, capabilities)

      // Activar tap-to-focus
      await nextTick()
      setupTapToFocus()

      notify({
        message: `✅ Cámara activa - ${settings.width}x${settings.height}`,
        color: 'success',
        duration: 3000,
      })
      return
    }

    // Android: Estrategia mejorada - Solicitar permisos primero para obtener etiquetas
    if (isAndroid) {
      try {
        // Paso 1: Solicitar permisos de cámara primero (necesario para obtener etiquetas)
        console.log('🔐 Solicitando permisos de cámara...')
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true })
        // Detener el stream temporal inmediatamente
        tempStream.getTracks().forEach((track) => track.stop())
        console.log('✅ Permisos obtenidos')

        // Paso 2: Ahora enumerar dispositivos (ahora tendrán etiquetas)
        console.log('🔍 Enumerando cámaras disponibles...')
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = devices.filter((device) => device.kind === 'videoinput')

        console.log(`📹 Total de cámaras encontradas: ${videoDevices.length}`)
        videoDevices.forEach((device, index) => {
          console.log(
            `  ${index + 1}. ${device.label || 'Cámara sin nombre'} (ID: ${device.deviceId.substring(0, 20)}...)`,
          )
        })

        // Paso 3: Filtrar cámaras traseras usando múltiples métodos
        const backCameras: MediaDeviceInfo[] = []

        for (const device of videoDevices) {
          const label = (device.label || '').toLowerCase()

          // Método 1: Verificar por etiqueta
          const isBackByLabel =
            label.includes('back') ||
            label.includes('rear') ||
            label.includes('trasera') ||
            label.includes('environment') ||
            label.includes('principal') ||
            // Excluir cámaras frontales explícitamente
            (!label.includes('front') &&
              !label.includes('user') &&
              !label.includes('selfie') &&
              !label.includes('facing'))

          // Método 2: Verificar usando facingMode (si está disponible)
          let isBackByFacingMode = false
          try {
            const testStream = await navigator.mediaDevices.getUserMedia({
              video: { deviceId: { exact: device.deviceId } },
            })
            const track = testStream.getVideoTracks()[0]
            const settings = track.getSettings()
            if (settings.facingMode === 'environment') {
              isBackByFacingMode = true
            }
            testStream.getTracks().forEach((t) => t.stop())
          } catch (e) {
            // Si no se puede verificar, confiar en la etiqueta
          }

          if (isBackByLabel || isBackByFacingMode) {
            backCameras.push(device)
          }
        }

        console.log(`📷 Cámaras traseras encontradas: ${backCameras.length}`)
        backCameras.forEach((device, index) => {
          console.log(`  ${index + 1}. ${device.label || 'Cámara Trasera ' + (index + 1)}`)
        })

        // Mostrar selector si hay múltiples cámaras traseras
        if (backCameras.length > 1) {
          // Múltiples cámaras traseras - mostrar selector
          videoDevicesList.value = backCameras.map((d, idx) => ({
            label: d.label || `Cámara Trasera ${idx + 1}`,
            deviceId: d.deviceId,
          }))
          showCameraModal.value = true
          notify({
            message: `Se detectaron ${backCameras.length} cámaras traseras. Selecciona la mejor.`,
            color: 'info',
          })
          return
        } else if (backCameras.length === 1) {
          // Solo una cámara trasera, conectarla directamente pero actualizar la lista para el botón de cambio
          videoDevicesList.value = [
            {
              label: backCameras[0].label || 'Cámara Trasera',
              deviceId: backCameras[0].deviceId,
            },
          ]
          console.log('📷 Usando única cámara trasera detectada:', backCameras[0].label)
          await connectToBatchCamera(backCameras[0].deviceId, backCameras[0].label)
          return
        }
      } catch (permError) {
        console.warn('⚠️ Error al obtener permisos o enumerar dispositivos en Android:', permError)
        // Continuar con el método estándar
      }
    }

    // Configuración optimizada para Android: detectar y usar la mejor resolución disponible
    console.log('📸 Solicitando cámara trasera con facingMode: environment...')

    let stream: MediaStream
    let constraints: MediaStreamConstraints

    if (isAndroid) {
      // ESTRATEGIA OPTIMIZADA PARA ANDROID: Intentar resoluciones de mayor a menor
      const androidResolutions = [
        // Intentar primero resoluciones muy altas (si el dispositivo lo soporta)
        { width: 3840, height: 2160, label: '4K' },
        { width: 2560, height: 1440, label: '1440p' },
        // Resolución Full HD (ideal para la mayoría de dispositivos)
        { width: 1920, height: 1080, label: '1080p' },
        // HD como fallback
        { width: 1280, height: 720, label: '720p' },
      ]

      let lastError: any = null
      for (const res of androidResolutions) {
        try {
          console.log(`🎯 Intentando resolución ${res.label} (${res.width}x${res.height})...`)
          constraints = {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: res.width, min: 1280 },
              height: { ideal: res.height, min: 720 },
              aspectRatio: { ideal: 16 / 9 },
              focusMode: { ideal: 'continuous' },
              // Frame rate óptimo para Android
              frameRate: { ideal: 30, min: 15 },
            } as MediaTrackConstraints,
          }

          stream = await navigator.mediaDevices.getUserMedia(constraints)
          console.log(`✅ Stream obtenido con resolución ${res.label} (${res.width}x${res.height})`)
          break
        } catch (error: any) {
          console.warn(`⚠️ Resolución ${res.label} no disponible:`, error.message)
          lastError = error
          // Continuar con la siguiente resolución
        }
      }

      // Si todas las resoluciones fallaron, usar configuración mínima
      if (!stream) {
        console.warn('⚠️ Todas las resoluciones fallaron, usando configuración mínima...')
        constraints = {
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            focusMode: { ideal: 'continuous' },
          },
        }
        stream = await navigator.mediaDevices.getUserMedia(constraints)
      }
    } else {
      // iOS y otros dispositivos: configuración estándar
      constraints = {
        video: {
          facingMode: { exact: 'environment' },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          aspectRatio: { ideal: 16 / 9 },
          focusMode: { ideal: 'continuous' },
        } as MediaTrackConstraints,
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        console.log('✅ Stream obtenido con configuración optimizada')
      } catch (exactError: any) {
        console.warn('⚠️ Configuración inicial falló, usando fallback básico...')
        constraints.video = {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          focusMode: { ideal: 'continuous' },
        }
        stream = await navigator.mediaDevices.getUserMedia(constraints)
      }
    }
    console.log('🎬 Activando UI de cámara...')
    isCameraActive.value = true
    // Esperar a que el DOM esté listo
    await nextTick()
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 150))
    // Buscar elemento video
    const maxAttempts = 60
    let attempts = 0
    while (attempts < maxAttempts) {
      if (!video.value) {
        const videoElements = document.querySelectorAll('video')
        if (videoElements.length > 0) {
          video.value = videoElements[0] as HTMLVideoElement
        }
      }
      if (video.value) {
        console.log('✅ Video element listo')
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
      attempts++
    }
    if (!video.value) {
      console.error('❌ Video element no disponible')
      isCameraActive.value = false
      stream.getTracks().forEach((track) => track.stop())
      notify({ message: '❌ Error: No se pudo inicializar la cámara', color: 'danger' })
      return
    }
    // Asignar stream y reproducir
    cameraStream = stream
    video.value.srcObject = stream
    await video.value.play()
    // Obtener info del track
    const videoTrack = stream.getVideoTracks()[0]
    const settings = videoTrack.getSettings()
    const capabilities = videoTrack.getCapabilities() as any
    console.log('✅ Cámara activa:', videoTrack.label)
    console.log('📐 Resolución:', settings.width + 'x' + settings.height)
    console.log('📷 Facing mode:', settings.facingMode)
    console.log('🔧 Capacidades disponibles:', capabilities)

    // Guardar capacidades y deviceId actual
    cameraCapabilities.value = capabilities
    currentDeviceId.value = videoTrack.getSettings().deviceId || ''

    // Activar tap-to-focus
    await nextTick()
    setupTapToFocus()

    // Actualizar lista de cámaras traseras disponibles
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices.filter((device) => device.kind === 'videoinput')

      const backCameras: MediaDeviceInfo[] = []
      for (const device of videoDevices) {
        const label = (device.label || '').toLowerCase()
        const isBackByLabel =
          label.includes('back') ||
          label.includes('rear') ||
          label.includes('trasera') ||
          label.includes('environment') ||
          label.includes('principal') ||
          (!label.includes('front') &&
            !label.includes('user') &&
            !label.includes('selfie') &&
            !label.includes('facing'))

        let isBackByFacingMode = false
        try {
          const testStream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: device.deviceId } },
          })
          const track = testStream.getVideoTracks()[0]
          const settings = track.getSettings()
          if (settings.facingMode === 'environment') {
            isBackByFacingMode = true
          }
          testStream.getTracks().forEach((t) => t.stop())
        } catch (e) {
          // Si no se puede verificar, confiar en la etiqueta
        }

        if (isBackByLabel || isBackByFacingMode) {
          backCameras.push(device)
        }
      }

      if (backCameras.length > 0) {
        videoDevicesList.value = backCameras.map((d) => ({
          label: d.label || 'Cámara Trasera',
          deviceId: d.deviceId,
        }))
        console.log(`📷 Lista de cámaras traseras actualizada: ${backCameras.length} disponible(s)`)
      }
    } catch (e) {
      console.warn('No se pudieron actualizar las cámaras disponibles:', e)
    }

    // Aplicar enfoque mejorado
    await applyImprovedFocus(videoTrack, capabilities)

    notify({
      message: `✅ Cámara trasera lista - ${settings.width}x${settings.height}`,
      color: 'success',
      duration: 2000,
    })
  } catch (error: any) {
    console.error('❌ Error al iniciar cámara:', error)
    isCameraActive.value = false
    let errorMsg = '❌ No se pudo acceder a la cámara'
    if (error.name === 'NotAllowedError') {
      errorMsg = '❌ Permiso denegado. Permite el acceso a la cámara en la configuración del navegador'
    } else if (error.name === 'NotFoundError') {
      errorMsg = '❌ No se encontró cámara trasera'
    } else if (error.name === 'OverconstrainedError') {
      errorMsg = '❌ Tu dispositivo no soporta la configuración solicitada'
    }
    notify({ message: errorMsg, color: 'danger' })
  }
}
// Conectar con una cámara específica en modo batch
const connectToBatchCamera = async (deviceId: string, deviceLabel: string) => {
  try {
    console.log(`🎥 Conectando con: ${deviceLabel}`)
    showCameraModal.value = false

    stopCamera()
    await new Promise((resolve) => setTimeout(resolve, 500))

    const isAndroid = /Android/i.test(navigator.userAgent)

    let stream: MediaStream
    let constraints: MediaStreamConstraints

    if (isAndroid) {
      // ESTRATEGIA OPTIMIZADA PARA ANDROID: Intentar resoluciones de mayor a menor
      const androidResolutions = [
        { width: 3840, height: 2160, label: '4K' },
        { width: 2560, height: 1440, label: '1440p' },
        { width: 1920, height: 1080, label: '1080p' },
        { width: 1280, height: 720, label: '720p' },
      ]

      for (const res of androidResolutions) {
        try {
          console.log(`🎯 Intentando resolución ${res.label} (${res.width}x${res.height}) con deviceId específico...`)
          constraints = {
            video: {
              deviceId: { exact: deviceId },
              width: { ideal: res.width, min: 1280 },
              height: { ideal: res.height, min: 720 },
              aspectRatio: { ideal: 16 / 9 },
              focusMode: { ideal: 'continuous' },
              frameRate: { ideal: 30, min: 15 },
            } as MediaTrackConstraints,
          }

          stream = await navigator.mediaDevices.getUserMedia(constraints)
          console.log(`✅ Stream obtenido con deviceId específico y resolución ${res.label}`)
          break
        } catch (error: any) {
          console.warn(`⚠️ Resolución ${res.label} no disponible con deviceId específico:`, error.message)
          // Continuar con la siguiente resolución
        }
      }

      // Si todas las resoluciones fallaron, intentar sin deviceId exacto
      if (!stream) {
        console.warn('⚠️ Intentando sin deviceId exacto...')
        try {
          constraints = {
            video: {
              deviceId: { ideal: deviceId },
              width: { ideal: 1920, min: 1280 },
              height: { ideal: 1080, min: 720 },
              focusMode: { ideal: 'continuous' },
            },
          }
          stream = await navigator.mediaDevices.getUserMedia(constraints)
        } catch (error: any) {
          console.warn('⚠️ Fallback final...')
          constraints = {
            video: {
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 },
              focusMode: { ideal: 'continuous' },
            },
          }
          stream = await navigator.mediaDevices.getUserMedia(constraints)
        }
      }
    } else {
      // iOS y otros: configuración estándar
      constraints = {
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          aspectRatio: { ideal: 16 / 9 },
          focusMode: { ideal: 'continuous' },
        } as MediaTrackConstraints,
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        console.log('✅ Stream obtenido con deviceId específico y resolución alta')
      } catch (error: any) {
        console.warn('⚠️ Error con deviceId específico, usando fallback...')
        constraints.video = {
          deviceId: { ideal: deviceId },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          focusMode: { ideal: 'continuous' },
        }
        stream = await navigator.mediaDevices.getUserMedia(constraints)
      }
    }

    console.log('🎬 Activando UI de cámara...')
    isCameraActive.value = true

    await nextTick()
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 150))

    const maxAttempts = 60
    let attempts = 0
    while (attempts < maxAttempts) {
      if (!video.value) {
        const videoElements = document.querySelectorAll('video')
        if (videoElements.length > 0) {
          video.value = videoElements[0] as HTMLVideoElement
        }
      }
      if (video.value) {
        console.log('✅ Video element listo')
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
      attempts++
    }

    if (!video.value) {
      console.error('❌ Video element no disponible')
      isCameraActive.value = false
      stream.getTracks().forEach((track) => track.stop())
      notify({ message: '❌ Error: No se pudo inicializar la cámara', color: 'danger' })
      return
    }

    cameraStream = stream
    video.value.srcObject = stream
    await video.value.play()

    const videoTrack = stream.getVideoTracks()[0]
    const settings = videoTrack.getSettings()
    const capabilities = videoTrack.getCapabilities() as any

    console.log('✅ Cámara activa:', videoTrack.label)
    console.log('📐 Resolución:', settings.width + 'x' + settings.height)
    console.log('📷 Facing mode:', settings.facingMode)
    console.log('🔧 Capacidades completas:', JSON.stringify(capabilities, null, 2))
    console.log('🔧 FocusMode disponible:', capabilities.focusMode)

    // Actualizar variables globales ANTES de aplicar enfoque
    cameraCapabilities.value = capabilities
    currentVideoTrack = videoTrack
    focusCapabilities = capabilities
    currentDeviceId.value = deviceId

    // Actualizar variables de enfoque para esta cámara específica
    if (capabilities.focusMode) {
      if (Array.isArray(capabilities.focusMode)) {
        hasSingleShot = capabilities.focusMode.includes('single-shot')
        hasContinuous = capabilities.focusMode.includes('continuous')
        console.log(`📷 Modos de enfoque detectados: single-shot=${hasSingleShot}, continuous=${hasContinuous}`)
      }
    } else {
      console.warn('⚠️ Esta cámara no reporta capacidades de focusMode')
      hasSingleShot = false
      hasContinuous = false
    }

    // Actualizar lista de cámaras traseras disponibles para el botón de cambio
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices.filter((device) => device.kind === 'videoinput')

      // Filtrar cámaras traseras
      const backCameras: MediaDeviceInfo[] = []
      for (const device of videoDevices) {
        const label = (device.label || '').toLowerCase()
        const isBackByLabel =
          label.includes('back') ||
          label.includes('rear') ||
          label.includes('trasera') ||
          label.includes('environment') ||
          label.includes('principal') ||
          (!label.includes('front') &&
            !label.includes('user') &&
            !label.includes('selfie') &&
            !label.includes('facing'))

        // Verificar facingMode si está disponible
        let isBackByFacingMode = false
        try {
          const testStream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: device.deviceId } },
          })
          const track = testStream.getVideoTracks()[0]
          const settings = track.getSettings()
          if (settings.facingMode === 'environment') {
            isBackByFacingMode = true
          }
          testStream.getTracks().forEach((t) => t.stop())
        } catch (e) {
          // Si no se puede verificar, confiar en la etiqueta
        }

        if (isBackByLabel || isBackByFacingMode) {
          backCameras.push(device)
        }
      }

      // Actualizar la lista de cámaras disponibles
      if (backCameras.length > 0) {
        videoDevicesList.value = backCameras.map((d) => ({
          label: d.label || 'Cámara Trasera',
          deviceId: d.deviceId,
        }))
        console.log(`📷 Lista de cámaras traseras actualizada: ${backCameras.length} disponible(s)`)
      }
    } catch (e) {
      console.warn('No se pudieron actualizar las cámaras disponibles:', e)
    }

    // Aplicar enfoque mejorado
    await applyImprovedFocus(videoTrack, capabilities)

    // Activar tap-to-focus
    await nextTick()
    setupTapToFocus()

    notify({
      message: `✅ ${deviceLabel} - ${settings.width}x${settings.height}`,
      color: 'success',
      duration: 3000,
    })
  } catch (error: any) {
    console.error('❌ Error al conectar cámara:', error)
    isCameraActive.value = false
    notify({
      message: `❌ Error al conectar con ${deviceLabel}: ${error.message}`,
      color: 'danger',
    })
  }
}

const showCameraSelector = async (cameras: { label: string; deviceId: string }[]): Promise<string> => {
  return new Promise((resolve) => {
    // Crear un diálogo simple con las opciones
    const cameraList = cameras.map((cam, idx) => `${idx + 1}. ${cam.label}`).join('\n')
    const message = `Selecciona una cámara:
${cameraList}
(Presiona Enter para usar la primera)`
    // Por ahora, usar la primera automáticamente
    // TODO: Implementar selector visual con VaModal
    console.log('📹 Usando cámara:', cameras[0].label)
    notify({ message: `📹 Usando: ${cameras[0].label}`, color: 'info' })
    resolve(cameras[0].deviceId)
  })
}
const connectToCamera = async (deviceId: string) => {
  try {
    console.log('🎥 Intentando conectar con deviceId:', deviceId)
    // Intentar primero con deviceId exacto
    let stream
    try {
      console.log('📡 Solicitando permiso de cámara...')
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia no disponible en este contexto')
      }
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      console.log('✅ Stream obtenido con deviceId exacto')
    } catch (exactError: any) {
      console.warn('⚠️ Fallo con deviceId exacto:', exactError.name, exactError.message)
      console.log('🔄 Intentando sin restricción de deviceId...')
      // Si falla, intentar sin especificar deviceId exacto
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      console.log('✅ Stream obtenido sin restricción')
    }
    console.log('📹 Stream recibido, tracks:', stream.getVideoTracks().length)
    // Esperar a que el elemento video esté disponible en el DOM (doble verificación)
    if (!video.value) {
      console.log('⚠️ Elemento video no disponible inicialmente, esperando...')
      const maxAttempts = 10
      let attempts = 0
      while (attempts < maxAttempts && !video.value) {
        await new Promise((resolve) => setTimeout(resolve, 50)) // 50ms entre intentos
        attempts++
      }
    }
    if (!video.value) {
      console.error('❌ Elemento video no disponible en el DOM después de esperar')
      throw new Error('Elemento video no encontrado')
    }
    console.log('✅ Elemento video disponible, asignando stream...')
    cameraStream = stream
    video.value.srcObject = stream
    console.log('▶️ Iniciando reproducción...')
    await video.value.play()
    // Ya no necesitamos activar isCameraActive aquí, se hace antes
    // Obtener el track activo para mostrar info
    const videoTrack = stream.getVideoTracks()[0]
    const settings = videoTrack.getSettings()
    console.log('✅ Cámara conectada:', videoTrack.label)
    console.log('📐 Resolución:', settings.width + 'x' + settings.height)
    notify({ message: `✅ ${videoTrack.label} activa`, color: 'success' })
  } catch (error: any) {
    console.error('❌ Error al conectar cámara:', error)
    console.error('Error name:', error.name)
    console.error('Error message:', error.message)
    let errorMsg = '❌ No se pudo conectar a la cámara'
    if (error.name === 'NotAllowedError') {
      errorMsg = '❌ Permiso denegado. Permite el acceso a la cámara'
    } else if (error.name === 'NotFoundError') {
      errorMsg = '❌ No se encontró ninguna cámara'
    } else if (error.name === 'NotReadableError') {
      errorMsg = '❌ Cámara en uso por otra aplicación'
    }
    notify({ message: errorMsg, color: 'danger' })
  }
}
const diagnosticCamera = async () => {
  console.log('=== DIAGNÓSTICO DE CÁMARA ===')
  try {
    // Verificar soporte del navegador
    console.log('Navigator.mediaDevices disponible:', !!navigator.mediaDevices)
    console.log('getUserMedia disponible:', !!navigator.mediaDevices?.getUserMedia)
    // Listar dispositivos de media
    if (navigator.mediaDevices?.enumerateDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices.filter((device) => device.kind === 'videoinput')
      console.log('Dispositivos de video encontrados:', videoDevices.length)
      videoDevices.forEach((device, index) => {
        console.log(`📷 Cámara ${index + 1}:`, device.label || 'Sin etiqueta')
        console.log(`   Device ID: ${device.deviceId}`)
        console.log(
          `   Iriun?: ${
            device.label?.toLowerCase().includes('iriun') || device.label?.toLowerCase().includes('webcam')
              ? '✅ Posible'
              : '❓ No detectado'
          }`,
        )
        console.log('---')
      })
    }
    // Verificar permisos
    if (navigator.permissions) {
      const permission = await navigator.permissions.query({ name: 'camera' as PermissionName })
      console.log('Estado de permisos:', permission.state)
    }
    // Intentar acceso simple para detectar conflictos
    console.log('Probando acceso básico a cámara...')
    try {
      const testStream = await navigator.mediaDevices.getUserMedia({ video: true })
      console.log('✅ Acceso básico exitoso')
      testStream.getTracks().forEach((track) => track.stop())
    } catch (testError: any) {
      console.log('❌ Error en acceso básico:', testError.name, testError.message)
      if (testError.name === 'NotReadableError') {
        console.log('🔍 POSIBLE CAUSA: Otra aplicación está usando la cámara')
        console.log('💡 SOLUCIÓN: Cierra otras apps como Zoom, Teams, OBS, etc.')
      }
    }
    notify({
      message: 'Información de diagnóstico enviada a la consola. Abre las herramientas de desarrollador (F12).',
      color: 'info',
    })
  } catch (error) {
    console.error('Error en diagnóstico:', error)
    notify({ message: 'Error al ejecutar diagnóstico. Ver consola.', color: 'danger' })
  }
}
// --- LÓGICA DE CAPTURA AUTOMÁTICA ---
const captureAndProcess = async () => {
  if (!video.value) return
  isProcessing.value = true
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  const videoElement = video.value
  // Use displayed dimensions to compute crop so CSS scaling behaves correctly
  const CROP_WIDTH_PERCENT = 0.9
  const CROP_HEIGHT_PERCENT = 0.8
  const displayedVideoWidth = videoElement.clientWidth
  const displayedVideoHeight = videoElement.clientHeight
  const displayedCropWidth = displayedVideoWidth * CROP_WIDTH_PERCENT
  const displayedCropHeight = displayedVideoHeight * CROP_HEIGHT_PERCENT
  const displayedCropX = (displayedVideoWidth - displayedCropWidth) / 2
  const displayedCropY = (displayedVideoHeight - displayedCropHeight) / 2
  const scaleX = videoElement.videoWidth / displayedVideoWidth
  const scaleY = videoElement.videoHeight / displayedVideoHeight
  const cropWidth = Math.round(displayedCropWidth * scaleX)
  const cropHeight = Math.round(displayedCropHeight * scaleY)
  const cropX = Math.round(displayedCropX * scaleX)
  const cropY = Math.round(displayedCropY * scaleY)
  canvas.width = cropWidth
  canvas.height = cropHeight
  if (context) {
    context.drawImage(videoElement, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)
  }
  const imageBase64 = canvas.toDataURL('image/jpeg', 0.95)
  stopCamera() // Cierra la cámara inmediatamente después de tomar la foto
  try {
    const response = await api.postOcr(imageBase64)
    if (response.data.status === 'success' && response.data.text) {
      rellenarFormulario(response.data.text)
    } else {
      notify({ message: response.data.message || 'No se pudo extraer texto.', color: 'warning' })
    }
  } catch (error: any) {
    console.error('Error en OCR:', error)
    const errorMessage = error.response?.data?.error || 'Error en el servidor OCR'
    notify({ message: `Error en OCR: ${errorMessage}`, color: 'danger' })
  } finally {
    isProcessing.value = false
  }
}
// --- SISTEMA DE ANÁLISIS DE ETIQUETAS SINCRONIZADO CON BACKEND ---
const parsers = {
  // Parser para etiquetas de Jumpseller (optimizado para campos esenciales)
  jumpseller: {
    recipient_name: /DESTINATARIO\s*:\s*([^\n]+)/i,
    destination_address: /DIRECCION\s*:\s*([^\n]+(?:\n[^\n]+)?)/i,
    recipient_phone: /FONO\s*:\s*(\+?56\s*\d[\d\s]+?)(?=\d{8,}|\s*$)/i,
    external_tracking_code: /(?:REF|ORDEN)\s*:\s*(\d+)/i,
  },

  // Parser para etiquetas de Acuerdo/Cambio (Leon Import) - optimizado
  leonImport: {
    recipient_name: /NOMBRE\s*:\s*([^\n]+)/i,
    recipient_phone: /TEL[ÉE]FONO\s*:\s*(\+?56\s*\d[\d\s]+)/i,
    destination_address: /DIRECCION\s*:\s*([^\n]+(?:\n[^\n]+)?)\s*COMUNA/i,
    external_tracking_code: /(?:CAMBIO|ACUERDO)\s*#?([A-Z]?\d+)/i,
  },

  // Parser para etiquetas de Mercado Libre - optimizado
  mercadoLibre: {
    recipient_name: /Destinatario\s*:\s*([^\n(]+)/i,
    destination_address: /Direccion\s*:\s*([^\n]+)/i,
    recipient_phone: /\(([A-Z]+\d+)\)/i, // Usuario de ML
    alt_phone: /(\+?56\s*\d[\d\s]+)/i, // Teléfono alternativo
    // Priorizar código de Envío (solo números) sobre "Entrega" y "Venta ID"
    external_tracking_code: /Env[ií]o\s*:\s*(\d+)/i,
    alt_tracking_code: /(?:Venta\s+ID|Codigo)\s*:\s*(\d+)/i, // Fallback
  },

  // Parser para etiquetas ENVIAME - optimizado
  enviame: {
    recipient_name: /(?:Destinatario|Katherine\s+Salazar)\s*[:\s]*([^\n/]+?)(?:\s*\/\s*Tel|$)/i,
    alt_recipient_name: /Ketherine\s+Salazar\s+montenegro/i,
    recipient_phone: /Tel\.?\s*:\s*(\d[\d\s]+)/i,
    alt_phone: /FONO\s*[:\s]*(\d[\d\s]+)/i,
    destination_address: /(?:CRECCON|Sen\s+pablo|DIRECCION)\s*[:\s]*([^\n]+(?:\n[^\n]+)?)/i,
    external_tracking_code: /(?:COSTOO SEGUMIENTO|N-J de orden)\s*[:\s]*(\d+)/i,
  },

  // Parser para etiquetas Envío Flex - optimizado
  envioFlex: {
    recipient_name: /Destinatario\s*:\s*([^\(]+)/i,
    destination_address: /Direccion\s*:\s*([^\n]+)/i,
    // Priorizar código de Envío (solo números) sobre "Entrega" que puede contener fechas
    external_tracking_code: /Env[ií]o\s*:\s*(\d+)/i,
    alt_tracking_code: /(?:Venta\s+ID|Codigo)\s*:\s*(\d+)/i, // Fallback
  },

  // Parser genérico (fallback) - optimizado
  generic: {
    recipient_name: /(?:Nombre|Destinatario|Señor\(a\))[:\s]*([A-ZÁÉÍÓÚÑ\s]+?)(?=\s*Fono|\s*Tel|\s*Direcci[oó]n|$)/i,
    recipient_phone: /(?:Fono|Tel[eé]fono|Numero)[:\s]*(\+?56\s*\d[\d\s-]{7,})/i,
    destination_address:
      /(?:Direcci[oó]n|Direccion|Destino)[:\s]*([\s\S]*?)(?=\n\s*(?:Fono|Tel[eé]fono|Observaci[oó]n|Comuna)|$)/i,
    external_tracking_code: /(?:C[oó]digo|Venta|Despacho|Orden|REF)[:\s]*([^\n]+)/i,
  },
}
// --- FUNCIÓN DE DETECCIÓN SINCRONIZADA CON BACKEND ---
function getLabelParser(texto: string) {
  const textoUpper = texto.toUpperCase()

  // Detectar Jumpseller (incluye "FUMPSELLER" por errores OCR)
  if (textoUpper.includes('JUMPSELLER') || textoUpper.includes('FUMPSELLER')) {
    console.log('🎯 Detectado: Jumpseller')
    return parsers.jumpseller
  }

  // Detectar Leon Import Acuerdo
  if (textoUpper.includes('CAMBIO #') || textoUpper.includes('ACUERDO')) {
    console.log('🎯 Detectado: Leon Import Acuerdo')
    return parsers.leonImport
  }

  // Detectar Mercado Libre
  if (
    textoUpper.includes('VENTA ID') ||
    textoUpper.includes('MERCADOLIBRE') ||
    textoUpper.includes('MERCADO LIBRE') ||
    textoUpper.includes('ENVIO TURBO') ||
    textoUpper.includes('ENVÍO TURBO')
  ) {
    console.log('🎯 Detectado: Mercado Libre')
    return parsers.mercadoLibre
  }

  // Detectar ENVIAME
  if (textoUpper.includes('ENVIAME')) {
    console.log('🎯 Detectado: ENVIAME')
    return parsers.enviame
  }

  // Detectar Envío Flex
  if (textoUpper.includes('ENVIO FLEX') || textoUpper.includes('ENVÍO FLEX') || textoUpper.includes('FLEX')) {
    console.log('🎯 Detectado: Envío Flex')
    return parsers.envioFlex
  }

  // Fallback a generic
  console.log('🎯 Usando parser genérico')
  return parsers.generic
}
// --- FUNCIÓN DE RELLENADO MEJORADA ---
function rellenarFormulario(textoCompleto: string) {
  const texto = textoCompleto
    .replace(/(\r\n|\r|\n)/gm, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  console.log('Texto OCR procesado:', texto)
  const parser = getLabelParser(texto)
  const parserName =
    (Object.keys(parsers) as Array<keyof typeof parsers>).find((key) => parsers[key] === parser) || 'unknown'
  console.log('Parser seleccionado:', parserName)
  const formatearTelefono = (n: string) => {
    const d = n.replace(/\D/g, '')
    if (d.length === 9 && d.startsWith('9')) return `+56 9 ${d.substring(1, 5)} ${d.substring(5)}`
    return `+ ${d}`
  }
  let fieldsFilled = 0
  recipient_name.value = ''
  destination_address.value = ''
  recipient_phone.value = ''
  external_tracking_code.value = ''
  Object.entries(parser).forEach(([campoId, regex]) => {
    const match = texto.match(regex as RegExp)
    if (match && match[1]) {
      fieldsFilled++
      const valorLimpio = match[1].trim()
      switch (campoId) {
        case 'recipient_name':
          recipient_name.value = valorLimpio
          break
        case 'destination_address':
          destination_address.value = valorLimpio.replace(/OBSERVACION/gi, '').trim()
          break
        case 'recipient_phone':
          recipient_phone.value = formatearTelefono(valorLimpio)
          break
        case 'alt_phone':
          if (!recipient_phone.value) {
            recipient_phone.value = formatearTelefono(valorLimpio)
          }
          break
        case 'alt_recipient_name':
          if (!recipient_name.value) {
            recipient_name.value = valorLimpio
          }
          break
        case 'external_tracking_code':
          external_tracking_code.value = valorLimpio.replace(/\D/g, '')
          break
        case 'alt_tracking_code':
          // Solo usar como fallback si no se encontró external_tracking_code
          if (!external_tracking_code.value) {
            external_tracking_code.value = valorLimpio.replace(/\D/g, '')
          }
          break
        case 'comuna':
          // Agregar comuna a la dirección
          if (valorLimpio) {
            destination_address.value += `, ${valorLimpio}`
          }
          break
        case 'cod_amount':
          is_cod.value = true
          cod_amount.value = parseFloat(valorLimpio.replace(/[.,]/g, '')) || 0
          break
      }
    }
  })
  nextTick(() => {
    validate()
    if (fieldsFilled < 2) {
      notify({
        message: 'No se pudieron extraer suficientes datos. Por favor, verifica la imagen o ingresa manualmente.',
        color: 'warning',
      })
    } else {
      notify({ message: `Formulario rellenado con ${fieldsFilled} campos. Revisa los datos.`, color: 'success' })
    }
  })
}
// --- HOOKS DE CICLO DE VIDA ---
onMounted(async () => {
  isLoading.value = true
  // Detectar soporte de getUserMedia en este contexto (https/localhost requerido en algunos navegadores)
  supportsMediaDevices.value = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
  try {
    if (!isPickupContext.value) {
      const [pickupsRes, clientsRes] = await Promise.all([
        api.getPickups({ perPage: 1000 }),
        api.getClients({ perPage: 1000 }),
      ])
      pickups.value = pickupsRes.data.pickups.map((p: any) => ({
        text: `${p.client?.client_name} - ${new Date(p.pickup_scheduled_date).toLocaleDateString()}`,
        value: p.pickup_id,
      }))
      clients.value = clientsRes.data.clients.map((c: any) => ({
        text: c.client_name,
        value: c.client_id,
      }))
    }
  } catch (err) {
    hasError.value = true
    notify({ message: 'Error al cargar datos para el formulario', color: 'danger' })
  } finally {
    isLoading.value = false
  }
})
onBeforeUnmount(() => {
  stopCamera()
})
// --- WATCHERS ---
watch(
  () => [props.pkg, props.pickupId, props.clientId],
  ([packageData]) => {
    if (packageData && typeof packageData === 'object' && 'tracking_code' in packageData) {
      const pkgData = packageData as Package
      tracking_code.value = pkgData.tracking_code
      external_tracking_code.value = pkgData.external_tracking_code || ''
      pickup_id.value = pkgData.pickup_id
      client_id.value = pkgData.client_id
      loadClientPrice(pkgData.client_id)
      loadPickupDriverCost(pkgData.pickup_id)
      is_cod.value = pkgData.is_cod
      cod_amount.value = pkgData.cod_amount || 0
      client_price.value = pkgData.client_price
      delivery_cost.value = pkgData.delivery_cost
      destination_address.value = pkgData.destination_address
      recipient_name.value = pkgData.recipient_name
      recipient_phone.value = pkgData.recipient_phone || ''
      scanned_at_origin_datetime.value = new Date(pkgData.scanned_at_origin_datetime)
    } else if (isPickupContext.value) {
      resetFormForPickup()
    } else {
      reset()
      tracking_code.value = generateTrackingCode()
    }
  },
  { immediate: true, deep: true },
)
watch(is_cod, (newValue) => {
  if (!newValue) {
    cod_amount.value = 0
  }
})
// --- MANEJO DEL ENVÍO DEL FORMULARIO ---
const handleSubmit = async () => {
  console.log('Before loading:', {
    clientPrice: client_price.value,
    deliveryCost: delivery_cost.value,
  })
  await Promise.all([
    loadClientPrice(props.clientId || client_id.value),
    loadPickupDriverCost(props.pickupId || pickup_id.value),
  ])
  const payload: PackageFormData = {
    tracking_code: tracking_code.value,
    external_tracking_code: external_tracking_code.value || null,
    pickup_id: props.pickupId || pickup_id.value,
    client_id: props.clientId || client_id.value,
    is_cod: false, // Siempre false en esta etapa
    cod_amount: 0,
    client_price: client_price.value,
    delivery_cost: delivery_cost.value,
    destination_address: destination_address.value,
    recipient_name: recipient_name.value,
    recipient_phone: recipient_phone.value,
    scanned_at_origin_datetime: scanned_at_origin_datetime.value.toISOString(),
  }
  emit('save', payload)
  if (isPickupContext.value && !props.pkg) {
    setTimeout(resetFormForPickup, 100)
  }
}
</script>
<template>
  <!-- El resto del template se mantiene exactamente igual -->
  <div v-if="isLoading" class="flex justify-center items-center h-64">
    <VaProgressCircle indeterminate />
  </div>
  <div v-else-if="hasError" class="p-4 text-red-600 bg-red-50 rounded-lg">
    Se produjo un error. Revisa la consola para más detalles e inténtalo de nuevo.
  </div>
  <VaForm v-else ref="package-form" v-slot="{ isValid }" class="flex flex-col gap-4">
    <VaInput v-if="isPickupContext" :model-value="clientName" label="Cliente" readonly class="bg-gray-50" />
    <VaSelect
      v-else
      v-model="client_id"
      label="Cliente"
      :options="clients"
      :rules="[validators.required]"
      text-by="text"
      value-by="value"
      :readonly="isEditing"
    />
    <VaInput
      v-if="isPickupContext"
      :model-value="`Recolección: ${pickupId.slice(0, 8)}...`"
      label="Recolección"
      readonly
      class="bg-gray-50"
    />
    <VaSelect
      v-else
      v-model="pickup_id"
      label="Recolección"
      :options="pickups"
      :rules="[validators.required]"
      text-by="text"
      value-by="value"
      :readonly="isEditing"
    />
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <VaInput v-model="tracking_code" label="Código Seguimiento (Interno)" readonly class="bg-gray-50" />
      <VaInput v-model="external_tracking_code" label="Código Seguimiento (Externo)" placeholder="Opcional" />
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <VaInput v-model="recipient_name" label="Nombre del destinatario" :rules="[validators.required]" />
      <VaInput v-model="recipient_phone" label="Teléfono del destinatario" placeholder="+56 9 1234 5678" />
    </div>
    <div class="relative">
      <VaInput
        v-model="destination_address"
        label="Dirección de Destino *"
        placeholder="Ej: El Pedernal 3793, Puente Alto"
        :loading="isLoadingSearch && !mapboxError"
        @update:modelValue="debouncedSearch"
      />
      <!-- Mensaje de error de Mapbox -->
      <div v-if="mapboxError" class="text-xs text-amber-600 mt-1 flex items-center gap-1">
        <VaIcon name="warning" size="14px" />
        Búsqueda de direcciones no disponible. Ingresa la dirección manualmente.
      </div>
      <!-- Modal simple para seleccionar cámara cuando hay varias disponibles -->
      <VaModal v-model:show="showCameraModal" title="Selecciona cámara" size="small">
        <div class="p-4">
          <div v-if="videoDevicesList.length === 0">No hay cámaras disponibles.</div>
          <ul v-else class="space-y-2">
            <li v-for="(d, i) in videoDevicesList" :key="d.deviceId" class="flex items-center justify-between">
              <div class="text-sm">{{ d.label || `Cámara ${i + 1}` }}</div>
              <div>
                <VaButton
                  size="small"
                  @click="
                    () => {
                      showCameraModal = false
                      isCameraActive = true
                      connectToCamera(d.deviceId)
                    }
                  "
                  >Usar</VaButton
                >
              </div>
            </li>
          </ul>
        </div>
      </VaModal>
      <ul
        v-if="searchResults.length > 0 && !mapboxError"
        class="absolute z-50 w-full bg-white border border-gray-300 rounded-lg shadow-lg mt-1"
      >
        <li
          v-for="result in searchResults"
          :key="result.id"
          class="p-2 hover:bg-gray-100 cursor-pointer"
          @click="selectAddress(result)"
        >
          {{ result.place_name }}
        </li>
      </ul>
    </div>
    <!-- <div class="flex flex-col gap-3">
      <VaCheckbox v-model="is_cod" label="Pago contra entrega (COD)" />
      <VaInput v-if="is_cod" v-model.number="cod_amount" label="Monto a cobrar ($)" type="number" step="0.01"
        :rules="[validators.required, (v) => (v && v > 0) || 'El monto COD debe ser mayor a 0']" class="ml-6" />
    </div> -->
    <VaDateInput v-model="scanned_at_origin_datetime" label="Fecha de Escaneo" with-time />
    <div class="camera-container mt-4 border-t pt-4">
      <div v-if="isCameraActive" class="video-wrapper">
        <video ref="video" autoplay playsinline></video>
        <div class="camera-overlay">
          <div class="viewfinder"></div>
        </div>

        <!-- Leyenda de orientación vertical -->
        <div class="camera-orientation-hint">
          <div class="bg-blue-600 bg-opacity-90 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2">
            <VaIcon name="mobile-alt" size="14px" />
            <span>📱 Toma la foto en <strong>vertical</strong></span>
          </div>
        </div>

        <!-- Botones de control en la parte superior -->
        <div class="camera-top-controls">
          <!-- Botón para cambiar cámara (solo Android con múltiples cámaras) -->
          <VaButton
            v-if="videoDevicesList.length > 0"
            preset="secondary"
            size="medium"
            round
            icon="fa4-sync-alt"
            class="control-button"
            aria-label="Cambiar cámara"
            @click="showCameraModal = true"
          />

          <!-- Botón de cerrar -->
          <VaButton
            preset="secondary"
            size="medium"
            round
            icon="fa4-times"
            class="control-button"
            aria-label="Cerrar cámara"
            @click="stopCamera"
          />
        </div>

        <!-- Botón de captura en la parte inferior -->
        <div class="camera-bottom-controls">
          <VaButton
            v-if="isBatchMode"
            :loading="isBatchProcessing"
            :disabled="isBatchProcessing"
            round
            icon="fa4-camera"
            color="success"
            class="capture-button"
            @click="captureBatchImage"
          />
        </div>
      </div>
      <div v-else-if="!supportsMediaDevices" class="p-4 bg-yellow-50 rounded border border-yellow-200">
        <div class="text-sm text-yellow-800 mb-2">
          No se detectó soporte de cámara en este navegador/contexto. Puedes subir imágenes manualmente:
        </div>
        <input type="file" accept="image/*" multiple @change="handleFileSelected" />
        <!-- Hidden native capture input (rear camera) -->
        <input
          ref="fileCaptureInput"
          type="file"
          accept="image/*"
          capture="environment"
          style="display: none"
          @change="handleFileSelected"
        />
      </div>
      <div v-else class="flex flex-col gap-2">
        <!-- Botón principal: Escanear Batch -->
        <VaButton icon="fa4-camera" color="primary" class="w-full" size="large" @click="startBatchMode">
          Escanear Paquetes (Batch)
        </VaButton>
        <VaButton icon="fa4-mobile-alt" color="secondary" class="w-full mt-2" size="small" @click="openDeviceCamera">
          Abrir cámara del teléfono (trasera)
        </VaButton>
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
          <p class="text-xs text-blue-800 text-center flex items-center justify-center gap-2">
            <VaIcon name="info" size="16px" />
            <strong>Importante:</strong> Las fotos siempre deben tomarse en <strong>vertical</strong> (modo retrato)
          </p>
        </div>
        <p class="text-xs text-gray-500 text-center">
          Captura todas las etiquetas y el sistema procesará automáticamente
        </p>
      </div>

      <!-- Modal de selección de cámara -->
      <VaModal v-model="showCameraModal" title="Selecciona la Cámara Trasera" size="medium" :close-button="true">
        <div class="camera-selector-modal">
          <p class="mb-4 text-gray-600">
            Se detectaron múltiples cámaras traseras. Selecciona la que tenga mejor enfoque:
          </p>
          <div class="flex flex-col gap-3">
            <VaButton
              v-for="(device, index) in videoDevicesList"
              :key="device.deviceId"
              size="large"
              color="primary"
              icon="fa4-camera"
              class="w-full text-left justify-start"
              @click="connectToBatchCamera(device.deviceId, device.label)"
            >
              <div class="flex flex-col ml-2">
                <span class="font-semibold">{{ device.label }}</span>
                <span class="text-xs opacity-75">Cámara trasera {{ index + 1 }}</span>
              </div>
            </VaButton>
          </div>
          <div class="mt-4 p-3 bg-blue-50 rounded text-sm text-blue-800">
            <VaIcon name="fa4-info-circle" class="mr-2" />
            <strong>Consejo:</strong> Si una cámara se ve borrosa, prueba con otra. Puedes cambiar en cualquier momento
            usando el botón de cambio de cámara en la parte superior.
          </div>
        </div>
      </VaModal>

      <!-- UI para batch Smart OCR -->
      <div v-if="isBatchMode" class="w-full mt-4 bg-blue-50 p-4 rounded-lg border border-blue-200">
        <div class="flex items-center justify-between mb-3">
          <div class="text-sm font-semibold text-blue-900">📦 Batch OCR Inteligente</div>
          <VaBadge :text="`${batchImagesCount} fotos`" color="primary" />
        </div>
        <div class="flex gap-2 mb-3">
          <VaButton
            :disabled="batchImagesCount === 0 || isBatchProcessing"
            :loading="isBatchProcessing"
            color="success"
            class="flex-1"
            @click="processBatchOcr"
          >
            {{ isBatchProcessing ? 'Procesando...' : '🚀 Procesar Todo' }}
          </VaButton>
          <VaButton :disabled="batchImagesCount === 0" color="danger" icon="fa4-trash" @click="clearBatch" />
        </div>
        <div v-if="isBatchProcessing" class="text-blue-700 text-sm text-center mb-2">
          ⏳ El sistema está analizando las etiquetas...
        </div>
        <div v-if="batchError" class="bg-red-100 text-red-700 p-2 rounded text-sm mb-2">❌ {{ batchError }}</div>
        <!-- Resultados simplificados -->
        <div v-if="batchImagesCount > 0" class="mt-3">
          <div class="flex items-center gap-2 mb-2">
            <!-- Captura continua oculta según requerimiento -->
            <!-- <label class="text-sm">Captura continua</label>
            <input v-model="multiCaptureEnabled" type="checkbox" /> -->
            <VaButton size="small" color="primary" @click="openDeviceCamera">Tomar otra foto</VaButton>
          </div>
          <!-- <div class="flex gap-2 mb-3 items-center">
            <VaButton 
              :disabled="batchImages.length === 0 || isBatchProcessing" 
              :loading="isBatchProcessing"
              color="success" 
              class="flex-1"
              @click="processBatchOcr"
            >
              {{ isBatchProcessing ? 'Procesando...' : '🚀 Procesar Fotos' }}
            </VaButton>
            <VaButton 
              :disabled="batchImages.length === 0" 
              color="danger" 
              icon="fa4-trash"
              @click="clearBatch"
            />
          </div> -->
          <div class="grid grid-cols-3 gap-2 mb-3">
            <div v-for="(img, idx) in batchImages" :key="idx" class="border rounded overflow-hidden relative group">
              <img :src="img" alt="preview" class="w-full h-28 object-cover" />
              <!-- Botón de eliminar - visible siempre pero más opaco al hover -->
              <button
                type="button"
                class="absolute top-1 right-1 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-full w-7 h-7 flex items-center justify-center opacity-80 hover:opacity-100 transition-opacity duration-200 shadow-lg z-10 cursor-pointer"
                :disabled="isBatchProcessing"
                aria-label="Eliminar imagen"
                title="Eliminar esta imagen"
                @click.stop="removeBatchImage(idx)"
              >
                <span class="text-sm font-bold leading-none">×</span>
              </button>
              <!-- Número de foto -->
              <div class="absolute bottom-1 left-1 bg-black bg-opacity-60 text-white text-xs px-1.5 py-0.5 rounded">
                #{{ idx + 1 }}
              </div>
            </div>
          </div>
        </div>
        <div v-if="batchOcrResults.length > 0" class="mt-3 space-y-2">
          <div class="text-xs font-semibold text-gray-600 mb-2">
            Resultados: {{ batchOcrResults.filter((r) => r.status === 'success').length }}/{{ batchOcrResults.length }}
            exitosos
          </div>
          <div v-for="(result, idx) in batchOcrResults" :key="idx" class="bg-white border rounded p-2 text-sm">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-mono text-gray-500">Foto #{{ idx + 1 }}</span>
              <VaBadge
                :text="result.status === 'success' ? '✓ Detectado' : '⚠ Error'"
                :color="result.status === 'success' ? 'success' : 'danger'"
                size="small"
              />
            </div>
            <div v-if="result.text" class="text-xs text-gray-700 truncate mb-2">
              {{ result.text.substring(0, 80) }}...
            </div>
            <VaButton
              v-if="result.status === 'success' && result.text"
              size="small"
              color="primary"
              @click="rellenarDesdeBatch(idx)"
            >
              📝 Usar estos datos
            </VaButton>
          </div>
        </div>
      </div>
    </div>
    <div class="flex justify-end gap-2 mt-4">
      <VaButton v-if="!isPickupContext" preset="secondary" @click="$emit('close')"> Cancelar </VaButton>
      <VaButton :disabled="!isValid" @click="handleSubmit">
        {{ isEditing ? 'Guardar Cambios' : isPickupContext ? 'Añadir Paquete' : 'Crear Paquete' }}
      </VaButton>
    </div>
    <!-- Hidden capture input always available to open native rear camera on mobile -->
    <input
      ref="fileCaptureInput"
      type="file"
      accept="image/*"
      capture="environment"
      style="display: none"
      @change="handleFileSelected"
    />
    <div v-if="isPickupContext && !isEditing" class="text-sm text-gray-600 mt-2">
      <IonIcon name="information-circle-outline" style="font-size: 1.2em"></IonIcon>
      Añadiendo paquete para la recolección actual. El formulario se limpiará después de guardar.
    </div>
  </VaForm>

  <!-- Modal de Carga Batch OCR -->
  <VaModal
    v-model="isBatchProcessing"
    :hide-default-actions="true"
    no-outside-click
    no-dismiss
    no-esc
    mobile-fullscreen
    max-width="400px"
    class="ocr-loading-modal"
    style="z-index: 999999 !important"
    :z-index="999999"
  >
    <div class="flex flex-col items-center justify-center py-8">
      <VaProgressCircle indeterminate size="large" color="primary" class="mb-6" />
      <h3 class="text-xl font-bold text-center text-blue-900 mb-2">Recibiendo paquetes...</h3>
      <p class="text-gray-600 text-center px-4 italic">
        "Nuestro motor OCR está analizando tus etiquetas para automatizar la carga. Por favor, no cierres esta ventana."
      </p>
    </div>
  </VaModal>
</template>
<style scoped>
.bg-gray-50 {
  background-color: #f9fafb;
}
.camera-container {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.video-wrapper {
  position: relative;
  width: 100%;
  max-width: 450px; /* Punto medio */
  overflow: hidden;
  border-radius: 12px;
  background-color: #000;
  aspect-ratio: 2 / 3; /* Más alto para etiquetas verticales */
}
.video-wrapper video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  /* Mejorar renderizado en Android */
  -webkit-transform: translateZ(0);
  transform: translateZ(0);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  will-change: transform;
}
.video-wrapper video {
  transition: transform 180ms ease;
}
/* Forzar aceleración de hardware en Android */
@supports (-webkit-overflow-scrolling: touch) {
  .video-wrapper video {
    -webkit-transform: translate3d(0, 0, 0);
    transform: translate3d(0, 0, 0);
  }
}
/* zoom-controls eliminados - ya no se usan */
.camera-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.viewfinder {
  /* Default size, overridden by :style */
  width: 90%;
  height: 80%;
  border: 3px dashed rgba(0, 255, 0, 0.9); /* Verde brillante */
  border-radius: 8px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.6);
  /* Guía visual para centrar */
  background: linear-gradient(
      to bottom,
      transparent calc(50% - 1px),
      rgba(0, 255, 0, 0.3) calc(50% - 1px),
      rgba(0, 255, 0, 0.3) calc(50% + 1px),
      transparent calc(50% + 1px)
    ),
    linear-gradient(
      to right,
      transparent calc(50% - 1px),
      rgba(0, 255, 0, 0.3) calc(50% - 1px),
      rgba(0, 255, 0, 0.3) calc(50% + 1px),
      transparent calc(50% + 1px)
    );
}
/* Leyenda de orientación vertical */
.camera-orientation-hint {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  pointer-events: none;
}

.camera-orientation-hint div {
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

/* Controles superiores (cambiar cámara y cerrar) */
.camera-top-controls {
  position: absolute;
  top: 1rem;
  right: 1rem;
  display: flex;
  gap: 0.75rem;
  z-index: 110;
}
.control-button {
  background-color: rgba(0, 0, 0, 0.7) !important;
  backdrop-filter: blur(10px);
  color: white !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4) !important;
  border: 2px solid rgba(255, 255, 255, 0.2) !important;
  min-height: 48px !important;
  min-width: 48px !important;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.control-button:active {
  transform: scale(0.95);
  transition: transform 0.1s;
}

/* Controles inferiores (botón de captura) */
.camera-bottom-controls {
  position: absolute;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  justify-content: center;
  z-index: 100;
}
.capture-button {
  width: 64px !important;
  height: 64px !important;
  min-width: 64px !important;
  min-height: 64px !important;
  padding: 0 !important;
  font-size: 28px !important;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4) !important;
  border: 3px solid rgba(255, 255, 255, 0.3) !important;
  backdrop-filter: blur(10px);
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
}
.capture-button:active {
  transform: scale(0.95);
  transition: transform 0.1s;
}
.camera-selector-modal {
  padding: 0.5rem;
}
.camera-selector-modal .va-button {
  transition: all 0.2s ease;
}
.camera-selector-modal .va-button:hover {
  transform: translateX(4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
.relative {
  position: relative;
}
.absolute {
  position: absolute;
}
/* z-50 en Tailwind asegura que la lista se muestre por encima de otros elementos */
.z-50 {
  z-index: 50;
}
</style>
