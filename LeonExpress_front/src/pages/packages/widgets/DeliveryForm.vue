<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { useForm, useToast } from 'vuestic-ui'
import { validators } from '../../../services/utils'
import { Package } from '../types'

const props = defineProps<{
  pkg: Package
  loading?: boolean
}>()

const emit = defineEmits<{
  (event: 'save', payload: FormData): void
  (event: 'close'): void
}>()

const { validate } = useForm('delivery-form')
const { init: notify } = useToast()

// --- Estado del Formulario ---
const deliveryStatuses = [
  'ENTREGADO',
  'NO_HAY_NADIE',
  'DIRECCION_INCORRECTA',
  'RECHAZADO_POR_CLIENTE',
  'REPROGRAMADO_POR_CLIENTE',
  'OTRA_INCIDENCIA',
]
const paymentTypes = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']
const status_at_delivery = ref('')
const receiver_name = ref('')
const receiver_rut = ref('')
const observation = ref('')
const payment_type = ref('EFECTIVO')
const collected_amount = ref<number | undefined>(props.pkg.cod_amount || 0)

// --- Estado de la Cámara y Fotos ---
const isCameraOpen = ref(false)
const capturedImages = ref<string[]>([])
const photoFiles = ref<File[]>([])
const videoPlayer = ref<HTMLVideoElement | null>(null)
let stream: MediaStream | null = null

const isFlashOn = ref(false)
const hasFlash = ref(false)

// --- Validación de RUT (Módulo 11 Chileno) ---
const receiver_rut_computed = computed({
  get: () => receiver_rut.value,
  set: (value: string) => {
    let clean = value.toUpperCase()
    // Permitir solo números y K
    clean = clean.replace(/[^0-9K]/g, '')
    // K solo al final
    clean = clean.replace(/K(?!$)/g, '')
    // Si hay más de una K al final, dejar solo una
    clean = clean.replace(/K+$/, 'K')
    // Limitar longitud estricta (por si max-length falla)
    if (clean.length > 9) clean = clean.slice(0, 9)

    receiver_rut.value = clean
  },
})

const onRutKeyDown = (event: KeyboardEvent) => {
  const allowedKeys = ['Backspace', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'Delete', 'Home', 'End']

  if (allowedKeys.includes(event.key) || event.ctrlKey || event.metaKey) return

  // Permitir números
  if (/[0-9]/.test(event.key)) return

  // Permitir K
  if (event.key === 'k' || event.key === 'K') return

  // Bloquear todo lo demás
  event.preventDefault()
}

// --- Validación de RUT Logic ---

// --- Validación de RUT Logic ---
const validateRut = (value: string) => {
  if (!value) return { errorMessage: 'El RUT es requerido' }

  // Limpiar y estandarizar
  const clean = value.replace(/[^0-9kK]/g, '').toUpperCase()

  // Validar longitud mínima (ej: 12.345.678-9 o 1.234.567-8)
  // Con DV son entre 8 y 9 caracteres
  if (clean.length < 8) {
    return { errorMessage: 'El RUT es demasiado corto (mínimo 8 dígitos con DV)' }
  }

  const body = clean.slice(0, -1)
  const dv = clean.slice(-1)

  // Validar cuerpo numérico
  if (!/^\d+$/.test(body)) {
    return { errorMessage: 'Formato incorrecto' }
  }

  // Calcular DV
  let sum = 0
  let multiplier = 2
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * multiplier
    multiplier = multiplier === 7 ? 2 : multiplier + 1
  }

  const rest = 11 - (sum % 11)
  let computedDv = '0'
  if (rest === 11) computedDv = '0'
  else if (rest === 10) computedDv = 'K'
  else computedDv = rest.toString()

  if (dv !== computedDv) {
    return { errorMessage: 'RUT inválido (Dígito verificador incorrecto)' }
  }

  return true
}

// --- Lógica Computada para Reglas y Visibilidad ---
const isSuccess = computed(() => status_at_delivery.value === 'ENTREGADO')
const requiresPayment = computed(() => props.pkg.is_cod && isSuccess.value)
const receiverNameRules = computed(() => (isSuccess.value ? [validators.required] : []))
const receiverRutRules = computed(() => (isSuccess.value ? [validators.required, validateRut] : []))
const paymentTypeRules = computed(() => (requiresPayment.value ? [validators.required] : []))
const collectedAmountRules = computed(() =>
  requiresPayment.value ? [validators.required, (v: any) => /^\d+$/.test(v) || 'Debe ser un número'] : [],
)
const photoIsRequired = computed(() => isSuccess.value) // Para mostrar el asterisco de requerido

// --- ✅ CORRECCIÓN: Añadidas las funciones que faltaban para la cámara ---
const openCamera = async () => {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      // Intentar configuración robusta para móviles
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints)
      } catch (e) {
        console.warn('Fallo primer intento de cámara, intentando básico...', e)
        stream = await navigator.mediaDevices.getUserMedia({ video: true })
      }

      isCameraOpen.value = true
      await nextTick()
      if (videoPlayer.value) {
        videoPlayer.value.srcObject = stream
        // Asegurar que se reproduzca en iOS
        videoPlayer.value.setAttribute('playsinline', 'true')
        await videoPlayer.value.play()
      }

      // Comprobar si el dispositivo soporta linterna (flash)
      try {
        const track = stream.getVideoTracks()[0]
        const capabilities = track.getCapabilities()
        hasFlash.value = !!capabilities.torch
        isFlashOn.value = false
      } catch (e) {
        hasFlash.value = false
        console.warn('No se pudo comprobar soporte de flash', e)
      }
    } catch (err: any) {
      console.error('Error de cámara:', err)
      notify({ message: `No se pudo acceder a la cámara: ${err.name || 'Error'}`, color: 'danger' })
    }
  } else {
    notify({ message: 'Tu navegador no soporta el acceso a la cámara.', color: 'danger' })
  }
}

const takePhoto = () => {
  if (!videoPlayer.value) return

  const canvas = document.createElement('canvas')
  // --- OPTIMIZACIÓN: Redimensionar si es muy grande ---
  const MAX_WIDTH = 1024
  const MAX_HEIGHT = 1024
  let width = videoPlayer.value.videoWidth
  let height = videoPlayer.value.videoHeight

  if (width > height) {
    if (width > MAX_WIDTH) {
      height *= MAX_WIDTH / width
      width = MAX_WIDTH
    }
  } else {
    if (height > MAX_HEIGHT) {
      width *= MAX_HEIGHT / height
      height = MAX_HEIGHT
    }
  }

  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')?.drawImage(videoPlayer.value, 0, 0, canvas.width, canvas.height)

  // Calidad 0.7 para reducir peso significativamente
  const imageData = canvas.toDataURL('image/jpeg', 0.7)
  capturedImages.value.push(imageData)

  canvas.toBlob(
    (blob) => {
      if (blob) {
        const photoFile = new File([blob], `entrega-${Date.now()}.jpg`, { type: 'image/jpeg' })
        photoFiles.value.push(photoFile)
      }
    },
    'image/jpeg',
    0.7,
  )

  closeCamera()
}

const closeCamera = () => {
  stream?.getTracks().forEach((track) => track.stop())
  isCameraOpen.value = false
  isFlashOn.value = false
  hasFlash.value = false
}

const toggleFlash = async () => {
  if (!stream) return
  try {
    const track = stream.getVideoTracks()[0]
    const newFlashState = !isFlashOn.value
    await track.applyConstraints({
      advanced: [{ torch: newFlashState }],
    })
    isFlashOn.value = newFlashState
  } catch (err) {
    console.error('Error al cambiar flash:', err)
    notify({ message: 'No se pudo activar el flash en este dispositivo.', color: 'warning' })
  }
}

const resetPhoto = () => {
  capturedImages.value = []
  photoFiles.value = []
  openCamera()
}

const removePhoto = (index: number) => {
  capturedImages.value.splice(index, 1)
  photoFiles.value.splice(index, 1)
}

// Función para comprimir archivos subidos (no capturados por cámara)
const compressUploadedFile = (file: File) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const MAX_WIDTH = 1024
      const MAX_HEIGHT = 1024
      let width = img.width
      let height = img.height

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width
          width = MAX_WIDTH
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height
          height = MAX_HEIGHT
        }
      }

      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx?.drawImage(img, 0, 0, width, height)

      const compressedData = canvas.toDataURL('image/jpeg', 0.7)
      capturedImages.value.push(compressedData)

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name || `subido-${Date.now()}.jpg`, { type: 'image/jpeg' })
            photoFiles.value.push(compressedFile)
          }
        },
        'image/jpeg',
        0.7,
      )
    }
    img.src = e.target?.result as string
  }
  reader.readAsDataURL(file)
}

const handleFileUpload = (files: File[] | File) => {
  const fileList = Array.isArray(files) ? files : [files]
  fileList.forEach((file) => {
    if (file) {
      compressUploadedFile(file)
    }
  })
}

// Si se cambia el resultado, solo cerramos la cámara pero conservamos las fotos ya tomadas
watch(status_at_delivery, () => {
  closeCamera()
})

const onSave = async () => {
  if (!validate()) {
    notify({ message: 'Por favor, revisa los campos del formulario.', color: 'warning' })
    return
  }

  if (isSuccess.value && photoFiles.value.length === 0) {
    notify({ message: 'Se requiere al menos una foto de evidencia para una entrega exitosa.', color: 'warning' })
    return
  }

  const formData = new FormData()
  formData.append('status_at_delivery', status_at_delivery.value)
  if (isSuccess.value) {
    formData.append('receiver_name', receiver_name.value)
    // Guardar RUT limpio y normalizado
    formData.append('receiver_rut', receiver_rut.value.replace(/[^0-9kK]/g, '').toUpperCase())
  }
  if (observation.value) {
    formData.append('observation', observation.value)
  }
  if (requiresPayment.value) {
    formData.append('payment_type', payment_type.value)
    formData.append('collected_amount', collected_amount.value?.toString() || '0')
  }
  // Agregar fotos al FormData
  photoFiles.value.forEach((file, index) => {
    formData.append('photos', file)
  })

  emit('save', formData)
}

onUnmounted(closeCamera)
</script>

<template>
  <VaForm ref="delivery-form" class="flex flex-col gap-4">
    <VaSelect
      v-model="status_at_delivery"
      label="Resultado de la Entrega *"
      :options="deliveryStatuses"
      :rules="[validators.required]"
    />

    <template v-if="isSuccess">
      <VaInput v-model="receiver_name" label="Nombre del receptor *" :rules="receiverNameRules" />
      <VaInput
        v-model="receiver_rut_computed"
        label="RUT del receptor (8-9 dígitos con DV) *"
        :rules="receiverRutRules"
        placeholder="12345678K"
        :max-length="10"
        @keydown="onRutKeyDown"
      >
        <template #appendInner>
          <VaIcon name="fa4-id-card" color="secondary" size="small" />
        </template>
      </VaInput>
      <template v-if="pkg.is_cod"> </template>
    </template>

    <VaInput v-model="observation" label="Observaciones (opcional)" type="textarea" autosize :max-length="500" />

    <div class="camera-section mt-2 p-3 border rounded-lg">
      <h3 class="va-h6 mb-3">Evidencia Fotográfica <span v-if="photoIsRequired" class="text-red-500">*</span></h3>

      <!-- Leyenda de orientación vertical -->
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-3">
        <p class="text-xs text-blue-800 text-center flex items-center justify-center gap-2">
          <i class="fa fa-mobile-alt"></i>
          <strong>Importante:</strong> Las fotos siempre deben tomarse en <strong>vertical</strong> (modo retrato)
        </p>
      </div>

      <!-- Galería de fotos tomadas -->
      <div v-if="capturedImages.length > 0" class="mb-4">
        <h4 class="text-sm font-medium mb-2">Fotos tomadas ({{ capturedImages.length }}/7):</h4>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
          <div v-for="(image, index) in capturedImages" :key="index" class="relative">
            <img :src="image" alt="Foto de entrega" class="rounded-lg w-full h-24 object-cover" />
            <VaButton preset="secondary" size="small" class="absolute top-1 right-1" @click="removePhoto(index)">
              <i class="fa fa-times"></i>
            </VaButton>
          </div>
        </div>
      </div>

      <!-- Controles de cámara -->
      <div v-if="isCameraOpen" class="flex flex-col items-center gap-2">
        <div class="relative w-full">
          <video ref="videoPlayer" autoplay playsinline class="rounded-lg w-full mb-2 bg-gray-900"></video>
          <!-- Leyenda flotante sobre el video -->
          <div class="absolute top-2 left-1/2 transform -translate-x-1/2 z-10">
            <div
              class="bg-blue-600 bg-opacity-90 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2 shadow-md"
            >
              <i class="fa fa-mobile-alt"></i>
              <span>📱 Toma la foto en <strong>vertical</strong></span>
            </div>
          </div>

          <!-- Botón de Flash flotante -->
          <div v-if="hasFlash" class="absolute bottom-2 right-2 z-10">
            <VaButton
              round
              :color="isFlashOn ? 'warning' : 'secondary'"
              class="shadow-lg backdrop-blur bg-opacity-70"
              @click="toggleFlash"
            >
              <VaIcon :name="isFlashOn ? 'bolt' : 'flash_off'" />
            </VaButton>
          </div>
        </div>
        <div class="flex gap-2 w-full justify-center mt-2">
          <VaButton icon="fa4-camera" size="large" :disabled="capturedImages.length >= 7" @click="takePhoto">
            Tomar Foto
          </VaButton>
          <VaButton preset="secondary" @click="closeCamera">Cerrar Cámara</VaButton>
        </div>
      </div>

      <!-- Botones de acción cuando no hay cámara abierta -->
      <div v-else class="flex flex-col md:flex-row gap-2">
        <VaButton class="flex-grow" icon="fa4-video" :disabled="capturedImages.length >= 7" @click="openCamera">
          Abrir Cámara
        </VaButton>
        <VaFileUpload
          class="flex-grow"
          file-types="image/*"
          :disabled="capturedImages.length >= 7"
          @update:modelValue="handleFileUpload"
        >
          <VaButton preset="secondary" class="w-full">Subir Archivo</VaButton>
        </VaFileUpload>
      </div>

      <!-- Mensaje cuando se alcanza el límite -->
      <div v-if="capturedImages.length >= 7" class="text-sm text-amber-600 mt-2">
        <i class="fa fa-info-circle"></i> Has alcanzado el límite máximo de 7 fotos.
      </div>
    </div>

    <div class="flex justify-end gap-2 mt-4">
      <VaButton preset="secondary" @click="$emit('close')">Cancelar</VaButton>
      <VaButton :disabled="!status_at_delivery || loading" :loading="loading" @click="onSave">
        Guardar Registro
      </VaButton>
    </div>
  </VaForm>
</template>
