<script setup lang="ts">
import { ref, onBeforeUnmount, computed, watch } from 'vue'
import { useToast } from 'vuestic-ui'
import api from '../../../services/api'
import { Package } from '../../packages/types'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import jsQR from 'jsqr'

const props = withDefaults(
  defineProps<{
    routeId?: string
    emitOnly?: boolean
    onPackageScanned?: (pkg: Package) => void
    hideControls?: boolean
  }>(),
  {
    routeId: '',
    emitOnly: false,
    onPackageScanned: undefined,
    hideControls: false,
  },
)

const emit = defineEmits<{
  (event: 'package-scanned', pkg: Package): void
  (event: 'scan-error', error: string): void
  (event: 'raw-scan', code: string): void
  (event: 'raw-qr-data', data: string): void
  (event: 'camera-status', active: boolean): void
}>()

const { init: notify } = useToast()

// Estado
const isScanning = ref(false)
const isProcessing = ref(false)
const showCamera = ref(false)
const scannedPackages = ref<Package[]>([])
const lastScanResult = ref<{ success: boolean; message: string; package?: Package } | null>(null)
const manualTrackingCode = ref('')
const showManualInput = ref(false)
const isSearchingManual = ref(false)
const detectedQRCode = ref<string | null>(null)
const isTransitioning = ref(false)

watch(showCamera, (newVal) => {
  emit('camera-status', newVal)
})

// Debug logs para Android
const debugLogs = ref<string[]>([])
const showDebugPanel = ref(false)

const addDebugLog = (message: string) => {
  const timestamp = new Date().toLocaleTimeString()
  debugLogs.value.unshift(`[${timestamp}] ${message}`)
  if (debugLogs.value.length > 20) {
    debugLogs.value = debugLogs.value.slice(0, 20)
  }
  console.log(message)
}

const scannerId = 'html5-qrcode-reader'
let html5QrCode: Html5Qrcode | null = null

// Para escaneo manual con jsQR (fallback Android)
const useJsQRMode = ref(false)
const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let jsQRInterval: number | null = null
let mediaStream: MediaStream | null = null

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// html5-qrcode requiere exactamente 1 key en el objeto de configuración de cámara
const buildCameraConfig = (cameraIdToUse: string | null) => {
  if (cameraIdToUse) {
    return { deviceId: { exact: cameraIdToUse } }
  }
  return { facingMode: 'environment' }
}

// Escaneo manual con jsQR (más robusto para Android)
const startJsQRScanning = async () => {
  try {
    addDebugLog('🔧 Iniciando modo jsQR (manual)...')

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    })

    mediaStream = stream

    // Crear video element si no existe
    if (!videoRef.value) {
      const video = document.createElement('video')
      video.setAttribute('playsinline', 'true')
      video.setAttribute('autoplay', 'true')
      video.style.width = '100%'
      video.style.height = 'auto'
      video.style.maxHeight = '400px'
      video.style.objectFit = 'cover'
      video.style.borderRadius = '8px'

      const container = document.getElementById(scannerId)
      if (container) {
        container.innerHTML = ''
        container.appendChild(video)
      }
      videoRef.value = video
    }

    videoRef.value.srcObject = stream
    await videoRef.value.play()

    // Crear canvas oculto para procesar frames
    const canvas = document.createElement('canvas')
    canvasRef.value = canvas

    addDebugLog('✅ Video iniciado, comenzando escaneo jsQR')

    let scanAttempts = 0
    let lastLogTime = Date.now()

    // Escanear frames con jsQR
    jsQRInterval = window.setInterval(() => {
      if (!videoRef.value || !canvasRef.value || isProcessing.value) return

      const video = videoRef.value
      const canvas = canvasRef.value
      const ctx = canvas.getContext('2d')

      if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) return

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      })

      scanAttempts++

      if (code && code.data) {
        addDebugLog(`✅ jsQR detectó: ${code.data.substring(0, 50)}...`)
        handleQRDetected(code.data)
      } else {
        const now = Date.now()
        if (now - lastLogTime > 5000) {
          addDebugLog(`🔍 jsQR: ${scanAttempts} frames sin detección`)
          lastLogTime = now
          scanAttempts = 0
        }
      }
    }, 100) // 10 FPS

    showCamera.value = true
    isScanning.value = true
    useJsQRMode.value = true
    isTransitioning.value = false
  } catch (error: any) {
    addDebugLog(`❌ Error jsQR: ${error.message}`)
    handleCameraError(error)
  }
}

const stopJsQRScanning = () => {
  if (jsQRInterval) {
    clearInterval(jsQRInterval)
    jsQRInterval = null
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop())
    mediaStream = null
  }
  if (videoRef.value) {
    videoRef.value.srcObject = null
  }
  useJsQRMode.value = false
}

// Modo híbrido para Android: jsQR para QR + detección de barcodes con BarcodeDetector
const startJsQRWithBarcodes = async () => {
  try {
    addDebugLog('🔧 Iniciando modo híbrido Android (jsQR + Barcodes)...')

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    })

    mediaStream = stream

    // Crear video element
    const video = document.createElement('video')
    video.setAttribute('playsinline', 'true')
    video.setAttribute('autoplay', 'true')
    video.style.width = '100%'
    video.style.height = 'auto'
    video.style.maxHeight = '400px'
    video.style.objectFit = 'cover'
    video.style.borderRadius = '8px'

    const container = document.getElementById(scannerId)
    if (container) {
      container.innerHTML = ''
      container.appendChild(video)
    }
    videoRef.value = video

    video.srcObject = stream
    await video.play()

    // Crear canvas para procesar frames
    const canvas = document.createElement('canvas')
    canvasRef.value = canvas

    // Verificar si tenemos BarcodeDetector para barcodes
    const hasBarcodeDetector = 'BarcodeDetector' in window
    let barcodeDetector: any = null

    if (hasBarcodeDetector) {
      try {
        // @ts-ignore - BarcodeDetector es una API experimental
        barcodeDetector = new window.BarcodeDetector({
          formats: ['code_128', 'code_39', 'ean_13', 'upc_a', 'upc_e'],
        })
        addDebugLog('✅ BarcodeDetector activado para códigos de barras')
      } catch (e) {
        addDebugLog('⚠️ BarcodeDetector no disponible para barcodes')
      }
    }

    addDebugLog('✅ Video iniciado, escaneando QR + Barcodes')

    let scanAttempts = 0
    let lastLogTime = Date.now()

    // Escanear frames
    jsQRInterval = window.setInterval(async () => {
      if (!videoRef.value || !canvasRef.value || isProcessing.value) return

      const v = videoRef.value
      const c = canvasRef.value
      const ctx = c.getContext('2d')

      if (!ctx || v.readyState !== v.HAVE_ENOUGH_DATA) return

      c.width = v.videoWidth
      c.height = v.videoHeight
      ctx.drawImage(v, 0, 0, c.width, c.height)

      scanAttempts++

      // 1. Intentar con jsQR (para QR codes)
      const imageData = ctx.getImageData(0, 0, c.width, c.height)
      const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      })

      if (qrCode && qrCode.data) {
        addDebugLog(`✅ QR detectado: ${qrCode.data.substring(0, 50)}...`)
        handleQRDetected(qrCode.data)
        return
      }

      // 2. Intentar con BarcodeDetector (para barcodes)
      if (barcodeDetector) {
        try {
          const barcodes = await barcodeDetector.detect(c)
          if (barcodes && barcodes.length > 0) {
            const barcode = barcodes[0]
            addDebugLog(`✅ Barcode detectado: ${barcode.rawValue}`)
            handleQRDetected(barcode.rawValue)
            return
          }
        } catch (e) {
          // Ignorar errores de detección
        }
      }

      // Log periódico
      const now = Date.now()
      if (now - lastLogTime > 5000) {
        addDebugLog(`🔍 ${scanAttempts} frames escaneados (QR+Barcode)`)
        lastLogTime = now
        scanAttempts = 0
      }
    }, 100) // 10 FPS

    showCamera.value = true
    isScanning.value = true
    useJsQRMode.value = true
    isTransitioning.value = false
  } catch (error: any) {
    addDebugLog(`❌ Error: ${error.message}`)
    handleCameraError(error)
  }
}

// Iniciar cámara
const startCamera = async () => {
  if (isScanning.value || isTransitioning.value) return

  isTransitioning.value = true

  try {
    if (!window.isSecureContext) {
      handleCameraError(new Error('INSECURE_CONTEXT'))
      return
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      handleCameraError(new Error('MEDIA_DEVICES_UNSUPPORTED'))
      return
    }

    showCamera.value = true
    isScanning.value = true
  } catch (error: any) {
    handleCameraError(error)
    return
  }

  // Detectar si es Android
  const isAndroid = /android/i.test(navigator.userAgent)

  // En Android: usar jsQR que funciona mejor
  if (isAndroid) {
    addDebugLog('📱 Android detectado - usando modo jsQR')
    isTransitioning.value = false
    await startJsQRWithBarcodes()
    return
  }

  // En iOS/Desktop: usar html5-qrcode normal
  try {
    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode(scannerId)
    }

    addDebugLog('🎬 iOS/Desktop - usando html5-qrcode')

    // Verificar si BarcodeDetector está disponible
    const hasBarcodeDetector = 'BarcodeDetector' in window
    addDebugLog(`🔍 BarcodeDetector API: ${hasBarcodeDetector ? 'DISPONIBLE' : 'NO disponible (usando ZXing)'}`)

    // Configuración para iOS/Desktop (html5-qrcode funciona bien aquí)
    const config: any = {
      fps: 15,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true,
      },
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.UPC_A,
      ],
      qrbox: { width: 280, height: 280 },
    }

    addDebugLog(` FPS: ${config.fps}, QRBox: 280x280`)
    addDebugLog(`🔧 BarcodeDetector nativo: Sí`)

    const cameraConfig = { facingMode: 'environment' }

    let scanAttempts = 0
    let lastLogTime = Date.now()

    await html5QrCode.start(
      cameraConfig,
      config,
      (decodedText) => {
        addDebugLog(`✅ QR/Barcode detectado: ${decodedText}`)
        handleQRDetected(decodedText)
      },
      (errorMessage) => {
        // Log solo cada 5 segundos para no saturar
        scanAttempts++
        const now = Date.now()
        if (now - lastLogTime > 5000) {
          addDebugLog(`🔍 ${scanAttempts} intentos sin detectar código`)
          lastLogTime = now
          scanAttempts = 0
        }
      },
    )

    addDebugLog('✅ Cámara iniciada correctamente')

    // Intentar aplicar configuraciones avanzadas post-inicio (crítico para Android/Samsung)
    try {
      const track = (html5QrCode as any).getRunningTrack()
      if (track) {
        const capabilities = track.getCapabilities() as any
        console.log('📷 Capacidades de cámara:', JSON.stringify(capabilities, null, 2))

        const constraints: MediaTrackConstraints = {}

        // Enfoque continuo - crítico para evitar imágenes borrosas en Android
        if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
          ;(constraints as any).focusMode = 'continuous'
        }

        // IMPORTANTE: Android = BAJA resolución para ZXing // iOS = ALTA resolución
        const isAndroid = /android/i.test(navigator.userAgent)
        if (isAndroid) {
          // Android: 640x480 = ZXing procesa más rápido
          if (capabilities.width && capabilities.width.max >= 640) {
            constraints.width = { ideal: 640, max: 800 }
          }
          if (capabilities.height && capabilities.height.max >= 480) {
            constraints.height = { ideal: 480, max: 600 }
          }
          addDebugLog('📱 Usando 640x480 para Android')
        } else {
          // iOS: Alta resolución
          if (capabilities.width && capabilities.width.max >= 1280) {
            constraints.width = { ideal: 1280 }
          }
          if (capabilities.height && capabilities.height.max >= 720) {
            constraints.height = { ideal: 720 }
          }
        }

        if (Object.keys(constraints).length > 0) {
          // Primer intento: aplicar constraints directamente
          try {
            await track.applyConstraints(constraints)
            console.log('🎯 Configuraciones aplicadas (método 1):', constraints)
          } catch (e1) {
            console.warn('⚠️ Método 1 falló, intentando método alternativo...')
            // Segundo intento: usar advanced constraints
            try {
              await track.applyConstraints({ advanced: [constraints] })
              console.log('🎯 Configuraciones aplicadas (método 2 - advanced):', constraints)
            } catch (e2) {
              console.warn('⚠️ Métodos de constraints fallaron:', e2)
            }
          }
        }

        // Para Samsung/Android: intentar forzar el enfoque después de un pequeño delay
        if (isAndroid && capabilities.focusMode) {
          setTimeout(async () => {
            try {
              await track.applyConstraints({ focusMode: 'continuous' } as any)
              console.log('📱 Focus continuo re-aplicado para Android')
            } catch (e) {
              console.warn('⚠️ No se pudo re-aplicar focus en Android')
            }
          }, 500)
        }
      }
    } catch (e) {
      console.warn('⚠️ No se pudieron aplicar configuraciones avanzadas post-inicio:', e)
    }

    isTransitioning.value = false
  } catch (innerError: any) {
    console.error('❌ Error al iniciar cámara, intentando fallback...', innerError)

    try {
      if (html5QrCode) {
        try {
          await html5QrCode.stop()
        } catch (e) {}
        try {
          html5QrCode.clear()
        } catch (e) {}
      }
      html5QrCode = new Html5Qrcode(scannerId)
      await wait(250)
    } catch (e) {}

    // Fallback absoluto
    try {
      if (html5QrCode) {
        // Configuración BÁSICA - html5-qrcode requiere exactamente 1 key en el objeto
        // En el fallback usamos solo facingMode ya que no tenemos acceso a cameraIdToUse aquí
        const fallbackCameraConfig = { facingMode: 'environment' }

        await html5QrCode.start(
          fallbackCameraConfig,
          { fps: 10 },
          (decodedText) => handleQRDetected(decodedText),
          () => {},
        )
        console.log('✅ Cámara iniciada con FALLBACK')

        // Intentar aplicar configuraciones avanzadas post-inicio (opcional y seguro)
        try {
          const track = (html5QrCode as any).getRunningTrack()
          if (track) {
            const capabilities = track.getCapabilities() as any
            const advancedConstraints: any = {}

            if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
              advancedConstraints.focusMode = 'continuous'
            }
            if (capabilities.width && capabilities.width.ideal) {
              advancedConstraints.width = { ideal: 1280 }
            }
            if (capabilities.height && capabilities.height.ideal) {
              advancedConstraints.height = { ideal: 720 }
            }

            if (Object.keys(advancedConstraints).length > 0) {
              await track.applyConstraints({ advanced: [advancedConstraints] })
              console.log('🎯 Configuraciones avanzadas aplicadas en FALLBACK:', advancedConstraints)
            }
          }
        } catch (e) {
          console.warn('⚠️ No se pudieron aplicar configuraciones avanzadas post-inicio en FALLBACK:', e)
        }

        isTransitioning.value = false
        return
      }
    } catch (fallbackError) {
      handleCameraError(fallbackError)
    }
  }
}

const handleCameraError = (error: any) => {
  console.error('Error de cámara:', error)
  const errName = (error && (error.name || error?.error?.name)) || ''
  let errMsg = (error && (error.message || error?.error?.message)) || (typeof error === 'string' ? error : '')

  if (!errMsg) {
    try {
      errMsg = typeof error?.toString === 'function' ? String(error.toString()) : ''
    } catch (e) {}
  }
  if (!errMsg) {
    try {
      errMsg = JSON.stringify(error)
    } catch (e) {}
  }

  let msg = `Error al acceder a la cámara: ${errName || errMsg || 'Error desconocido'}`

  if (errMsg === 'INSECURE_CONTEXT') {
    msg = 'La cámara requiere HTTPS (o localhost). Abre la app en https:// y vuelve a intentar.'
  } else if (errMsg === 'MEDIA_DEVICES_UNSUPPORTED') {
    msg = 'Tu navegador no soporta acceso a la cámara (mediaDevices/getUserMedia).'
  } else if (errName === 'NotAllowedError' || /permission|denied/i.test(errMsg)) {
    msg = 'Permiso de cámara denegado. Habilítalo en el navegador y vuelve a intentar.'
  } else if (errName === 'NotFoundError') {
    msg = 'No se detectó ninguna cámara.'
  } else if (errName === 'NotReadableError' || /could not start|not readable|track/i.test(errMsg)) {
    msg = 'La cámara está en uso por otra app o el navegador no pudo iniciarla. Cierra otras apps y reintenta.'
  } else if (errName === 'OverconstrainedError') {
    msg = 'La cámara no soporta los requerimientos solicitados. Se intentó un modo compatible sin éxito.'
  }

  notify({ message: msg, color: 'warning', duration: 5000 })
  showManualInput.value = true
  isScanning.value = false
  showCamera.value = false
  isTransitioning.value = false

  try {
    if (html5QrCode) {
      html5QrCode
        .stop()
        .catch(() => {})
        .finally(() => {
          try {
            html5QrCode?.clear()
          } catch (e) {}
        })
    }
  } catch (e) {}
}

// Detener cámara
const stopCamera = async () => {
  if (isTransitioning.value) return
  isTransitioning.value = true

  try {
    // Detener jsQR si está activo
    if (useJsQRMode.value) {
      stopJsQRScanning()
    }

    // Detener html5-qrcode si está activo
    if (html5QrCode && isScanning.value && !useJsQRMode.value) {
      await html5QrCode.stop()
      html5QrCode.clear()
      console.log('✅ Cámara detenida')
    }
  } catch (err) {
    console.error('Error al detener cámara', err)
  } finally {
    showCamera.value = false
    isScanning.value = false
    isTransitioning.value = false
  }
}

// Extraer código de tracking
const extractTrackingCode = (qrData: string): string => {
  try {
    const jsonData = JSON.parse(qrData)
    if (jsonData.id) return jsonData.id
  } catch (e) {}

  // Normalizar Unicode (resolver caracteres raros como ¸)
  let cleaned = qrData.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // Limpiar caracteres de control y espacios
  cleaned = cleaned.replace(/[\x00-\x1F\x7F-\x9F]/g, '')

  // Solo permitir alfanuméricos, guiones y barras
  cleaned = cleaned.replace(/[^a-zA-Z0-9\-\/]/g, '')

  return cleaned.trim()
}

// Manejar QR/Barra detectado
const handleQRDetected = async (qrData: string) => {
  if (isProcessing.value) return

  console.log(
    '📦 Código RAW detectado:',
    qrData,
    'Bytes:',
    [...qrData].map((c) => c.charCodeAt(0)),
  )
  isProcessing.value = true

  if (html5QrCode) {
    html5QrCode.pause(true)
    detectedQRCode.value = qrData
  }

  const trackingCode = extractTrackingCode(qrData)
  console.log('📍 Código LIMPIO:', trackingCode)

  if (props.emitOnly) {
    emit('raw-qr-data', qrData) // ← PRIMERO: guardar la data cruda
    emit('raw-scan', trackingCode) // ← DESPUÉS: disparar la confirmación
    if ('vibrate' in navigator) navigator.vibrate(100)

    // Mostramos un pequeño delay visual y notificamos
    notify({ message: `Leído: ${trackingCode}`, color: 'info', duration: 1000 })
    setTimeout(() => {
      detectedQRCode.value = null
      isProcessing.value = false
      if (html5QrCode && isScanning.value) {
        html5QrCode.resume()
      }
    }, 500)
    return
  }

  try {
    const response = await api.scanPackageToRoute(props.routeId!, null, trackingCode)

    if (response.data && response.data.package) {
      const scannedPackage = response.data.package
      scannedPackages.value.push(scannedPackage)

      lastScanResult.value = {
        success: true,
        message: response.data.message || `Paquete escaneado: ${scannedPackage.tracking_code}`,
        package: scannedPackage,
      }

      emit('package-scanned', scannedPackage)
      if (props.onPackageScanned) {
        props.onPackageScanned(scannedPackage)
      }
      notify({
        message: `✅ Paquete: ${scannedPackage.tracking_code}`,
        color: 'success',
        duration: 2000,
      })

      if ('vibrate' in navigator) navigator.vibrate(200)

      // Reducido de 1500ms a 500ms para mayor velocidad de flujo
      await new Promise((resolve) => setTimeout(resolve, 500))
    } else {
      throw new Error(response.data?.error || 'Respuesta inválida')
    }
  } catch (error: any) {
    const errorMessage = error.response?.data?.error || error.message || 'Error desconocido'

    lastScanResult.value = {
      success: false,
      message: errorMessage,
    }

    emit('scan-error', errorMessage)
    notify({
      message: errorMessage,
      color: 'warning',
      duration: 3000,
    })

    if ('vibrate' in navigator) navigator.vibrate([100, 50, 100])

    await new Promise((resolve) => setTimeout(resolve, 2000))
  } finally {
    detectedQRCode.value = null
    isProcessing.value = false
    if (html5QrCode && isScanning.value) {
      html5QrCode.resume()
    }
  }
}

// Búsqueda manual
const searchByManualCode = async () => {
  if (!manualTrackingCode.value.trim()) return

  isSearchingManual.value = true
  lastScanResult.value = null

  if (props.emitOnly) {
    emit('raw-scan', manualTrackingCode.value.trim())
    notify({ message: `Código manual enviado: ${manualTrackingCode.value.trim()}`, color: 'info' })
    manualTrackingCode.value = ''
    isSearchingManual.value = false
    return
  }

  try {
    const response = await api.scanPackageToRoute(props.routeId!, null, manualTrackingCode.value.trim())

    if (response.data && response.data.package) {
      const scannedPackage = response.data.package
      scannedPackages.value.push(scannedPackage)

      lastScanResult.value = {
        success: true,
        message: `Paquete agregado: ${scannedPackage.tracking_code}`,
        package: scannedPackage,
      }
      emit('package-scanned', scannedPackage)
      notify({
        message: `Paquete ${scannedPackage.tracking_code} agregado`,
        color: 'success',
      })

      manualTrackingCode.value = ''
      if ('vibrate' in navigator) navigator.vibrate(100)
    } else {
      throw new Error(response.data?.error || 'No se pudo encontrar')
    }
  } catch (error: any) {
    const errorMessage = error.response?.data?.error || 'Error al buscar'
    lastScanResult.value = {
      success: false,
      message: errorMessage,
    }
    notify({
      message: errorMessage,
      color: 'warning',
    })
  } finally {
    isSearchingManual.value = false
  }
}

onBeforeUnmount(() => {
  stopCamera().catch(console.error)
})

const scannedCount = computed(() => scannedPackages.value.length)

defineExpose({ startCamera, stopCamera, scannedPackages })
</script>

<template>
  <div class="route-package-scanner">
    <div v-if="!hideControls" class="flex gap-3 mb-4 flex-wrap w-full">
      <VaButton
        v-if="!showCamera"
        icon="photo_camera"
        color="primary"
        class="flex-1 min-w-[140px]"
        @click="startCamera"
      >
        Iniciar Cámara
      </VaButton>
      <VaButton v-else icon="videocam_off" color="danger" class="flex-1 min-w-[140px]" @click="stopCamera">
        Detener Cámara
      </VaButton>
      <VaButton
        icon="keyboard"
        color="secondary"
        class="flex-1 min-w-[140px]"
        @click="showManualInput = !showManualInput"
      >
        {{ showManualInput ? 'Ocultar' : 'Ingreso Manual' }}
      </VaButton>
    </div>

    <VaCard v-if="showManualInput" class="mb-4">
      <VaCardTitle>Ingreso Manual</VaCardTitle>
      <VaCardContent>
        <div class="flex gap-4 items-end">
          <VaInput
            v-model="manualTrackingCode"
            label="Código de Tracking"
            placeholder="Ej: 3014..."
            class="flex-1"
            @keyup.enter="searchByManualCode"
          />
          <VaButton
            icon="fa4-search"
            :loading="isSearchingManual"
            :disabled="!manualTrackingCode.trim()"
            @click="searchByManualCode"
          >
            Buscar
          </VaButton>
        </div>
      </VaCardContent>
    </VaCard>

    <div v-show="showCamera" class="camera-container mb-4">
      <div id="html5-qrcode-reader" class="rounded-lg overflow-hidden bg-black"></div>

      <div v-if="detectedQRCode" class="scan-overlay">
        <div class="qr-detected-indicator">✓ Código Detectado</div>
      </div>

      <div class="text-center text-xs text-gray-500 mt-2">Apunta a un código QR o Código de Barras</div>
    </div>

    <VaAlert v-if="lastScanResult" :color="lastScanResult.success ? 'success' : 'warning'" class="mb-4">
      {{ lastScanResult.message }}
    </VaAlert>

    <div v-if="scannedPackages.length > 0" class="scanned-packages mt-4">
      <h3 class="text-lg font-semibold mb-2">Escaneados ({{ scannedCount }})</h3>
      <div class="flex flex-wrap gap-2">
        <VaBadge v-for="pkg in scannedPackages" :key="pkg.package_id" color="success">
          {{ pkg.tracking_code }}
        </VaBadge>
      </div>
    </div>
  </div>
</template>

<style scoped>
.camera-container {
  position: relative;
  min-height: 300px;
}
.scan-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.3);
  z-index: 10;
}
.qr-detected-indicator {
  background: #4caf50;
  color: white;
  padding: 1rem 2rem;
  border-radius: 8px;
  font-weight: bold;
  font-size: 1.2rem;
  animation: pulse 0.5s ease-in-out;
}
@keyframes pulse {
  0% {
    transform: scale(0.9);
    opacity: 0.7;
  }
  50% {
    transform: scale(1.1);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.debug-panel {
  border-left: 4px solid var(--va-info);
}

.debug-logs {
  max-height: 300px;
  overflow-y: auto;
  font-family: 'Courier New', monospace;
  font-size: 0.75rem;
  background-color: #1e1e1e;
  color: #d4d4d4;
  padding: 0.75rem;
  border-radius: 4px;
}

.log-entry {
  padding: 0.25rem 0;
  border-bottom: 1px solid #333;
  word-wrap: break-word;
}

.log-entry:last-child {
  border-bottom: none;
}
</style>
