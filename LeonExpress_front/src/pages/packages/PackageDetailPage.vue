<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../../services/api'
import { Package, Delivery, DeliveryPhoto } from './types' // ✅ Asegúrate de importar DeliveryPhoto
import { useToast } from 'vuestic-ui'
import { useUserStore } from '../../stores/user-store'
import DeliveryForm from './widgets/DeliveryForm.vue'
import { uploadBatchChunked } from '../../composables/useChunkedUpload'

import VueEasyLightbox from 'vue-easy-lightbox' // ✅ NUEVO: Importar la librería Lightbox

const route = useRoute()
const router = useRouter()
const { init: notify } = useToast()
const userStore = useUserStore()

// --- Estado para edición de código externo ---
const isEditingTracking = ref(false)
const editTrackingCode = ref('')
const isSavingTracking = ref(false)

const canEditTracking = computed(() => {
  if (!pkg.value || !userStore.isAdmin) return false
  const blockedStatuses = ['ASIGNADO_A_RUTA', 'EN_RUTA_ENTREGA', 'ENTREGADO']
  return !blockedStatuses.includes(pkg.value.status)
})

const startEditTracking = () => {
  editTrackingCode.value = pkg.value?.external_tracking_code || ''
  isEditingTracking.value = true
}

const cancelEditTracking = () => {
  isEditingTracking.value = false
  editTrackingCode.value = ''
}

const saveTrackingCode = async () => {
  if (!pkg.value) return
  isSavingTracking.value = true
  try {
    await api.updatePackageTracking(pkg.value.package_id, editTrackingCode.value)
    notify({ message: 'Código externo actualizado exitosamente', color: 'success' })
    isEditingTracking.value = false
    await fetchData() // Recargar datos
  } catch (error: any) {
    const msg = error.response?.data?.message || error.response?.data?.error || error.message
    notify({ message: `Error: ${msg}`, color: 'danger', duration: 6000 })
  } finally {
    isSavingTracking.value = false
  }
}

// Construir la URL base del backend
// En producción: https://leonexpress.themarvals.com/api → https://leonexpress.themarvals.com
// En desarrollo: http://localhost:4100/api → http://localhost:4100
const getBackendBaseUrl = () => {
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  if (apiUrl) {
    // Si hay variable de entorno, remover /api si existe
    return apiUrl.replace(/\/api\/?$/, '')
  }

  // Fallback: detectar automáticamente basado en window.location
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:4100'
  }

  // En producción sin variable de entorno, usar el mismo dominio
  return `${window.location.protocol}//${window.location.hostname}`
}

const bkurl = getBackendBaseUrl()
console.log('🌐 Backend URL configurada:', bkurl)

const pkg = ref<Package | null>(null)
const isLoading = ref(true)
const doShowDeliveryModal = ref(false)
const isSavingDelivery = ref(false)
const showCloseDeliveryConfirm = ref(false)

const handleCloseDeliveryConfirm = () => {
  showCloseDeliveryConfirm.value = false
  doShowDeliveryModal.value = false
}

const doShowMapModal = ref(false)
const selectedMapUrl = ref('')

// ✅ NUEVO: Estado para el Lightbox
const visibleLightbox = ref(false) // Controla si el lightbox está visible
const currentImageIndex = ref(0) // Índice de la imagen actual en el lightbox
const doShowPhotosModal = ref(false)
const selectedDeliveryPhotos = ref<DeliveryPhoto[]>([])

const lightboxImages = ref<string[]>([]) // Array de URLs de las imágenes para el lightbox

const fetchData = async () => {
  isLoading.value = true
  const packageId = route.params.id as string
  try {
    const { data } = await api.getPackageById(packageId)
    pkg.value = data
    console.log('📦 Paquete con entregas cargado:', data)
  } catch (error) {
    console.error('Error al cargar paquete:', error)
    notify({ message: 'Error al cargar los detalles del paquete', color: 'danger' })
  } finally {
    isLoading.value = false
  }
}

onMounted(fetchData)

const openMapModal = (delivery: Delivery) => {
  if (delivery.gps_latitude && delivery.gps_longitude) {
    const lat = delivery.gps_latitude
    const lon = delivery.gps_longitude
    // Formato de Google Maps que muestra el pin automáticamente
    // Usamos @ para centrar en coordenadas y q= para asegurar que muestre el marcador
    selectedMapUrl.value = `https://www.google.com/maps?q=${lat},${lon}&ll=${lat},${lon}&z=17&hl=es&output=embed`
    doShowMapModal.value = true
  }
}

// ✅ NUEVO: Función para abrir el modal de fotos
const openPhotosModal = (photos: DeliveryPhoto[]) => {
  if (!photos || photos.length === 0) {
    console.warn('⚠️ No hay fotos para mostrar')
    return
  }

  console.log('📸 Fotos recibidas:', photos)
  selectedDeliveryPhotos.value = photos
  doShowPhotosModal.value = true
}

// ✅ NUEVO: Función para construir la URL de la imagen de etiqueta OCR
const getLabelImageUrl = (imagePath: string) => {
  if (!imagePath) return ''

  // Normalizar la ruta
  let serverPath = imagePath

  // Si viene con prefijo absoluto del repo local, lo eliminamos
  serverPath = serverPath.replace('/home/marval/Proyects/Leon_Express/LeonExpress_back', '')

  // Si viene con el prefijo /app/uploads (ruta dentro del contenedor), convertir a /uploads
  serverPath = serverPath.replace(/^\/app\/uploads/, '/uploads')

  // Asegurar que la ruta comience con '/uploads'
  if (!serverPath.startsWith('/uploads')) {
    if (!serverPath.startsWith('/')) serverPath = '/' + serverPath
    if (!serverPath.startsWith('/uploads')) serverPath = '/uploads' + serverPath
  }

  // Usar ruta relativa para que nginx la sirva directamente
  // Esto evita problemas con puertos y dominios
  console.log('🖼️ Construyendo URL de imagen:', { original: imagePath, normalized: serverPath })
  return serverPath
}

// ✅ NUEVO: Estado para el modal de etiqueta OCR
const doShowLabelModal = ref(false)

// ✅ NUEVO: Función para abrir el modal con la imagen de la etiqueta
const openLabelImage = () => {
  if (!pkg.value?.label_image) return
  doShowLabelModal.value = true
}

// ✅ NUEVO: Función para manejar errores de carga de imágenes
const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  console.error('❌ Error al cargar imagen:', img.src)
  img.style.display = 'none'
  const errorMsg = document.createElement('p')
  errorMsg.textContent = 'Error al cargar la imagen'
  errorMsg.className = 'text-red-500 text-sm'
  img.parentNode?.appendChild(errorMsg)
}

// ✅ NUEVO: Función para abrir imagen en nueva pestaña
const openImageInNewTab = (imageUrl: string) => {
  window.open(imageUrl, '_blank')
}

// ✅ NUEVO: Función para descargar imagen
const downloadImage = async (imageUrl: string, filename: string) => {
  try {
    // Obtener la imagen como blob
    const response = await fetch(imageUrl)
    const blob = await response.blob()

    // Crear URL del objeto blob
    const blobUrl = URL.createObjectURL(blob)

    // Crear elemento de enlace y descargar
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()

    // Limpiar
    document.body.removeChild(link)
    URL.revokeObjectURL(blobUrl)
  } catch (error) {
    console.error('Error al descargar la imagen:', error)
    // Fallback: abrir en nueva pestaña
    window.open(imageUrl, '_blank')
  }
}

// ✅ NUEVO: Función para abrir imagen en lightbox
const openImageInLightbox = (photoIndex: number) => {
  if (!selectedDeliveryPhotos.value || selectedDeliveryPhotos.value.length === 0) return

  // Preparar las URLs completas para el lightbox
  lightboxImages.value = selectedDeliveryPhotos.value.map((photo: DeliveryPhoto) => `${bkurl}/${photo.photo_url}`)
  currentImageIndex.value = photoIndex
  visibleLightbox.value = true
}

const handleDeliverySave = async (formData: FormData) => {
  if (!pkg.value) return

  isSavingDelivery.value = true

  const getCurrentPosition = (): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalización no es soportada por este navegador.'))
      } else {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false, // False para que sea rápido cuando no hay WiFi
          timeout: 4000, // 4 segundos en vez de 10
          maximumAge: 300000, // 5 minutos
        })
      }
    })
  }

  const checkGeolocationPermission = async (): Promise<boolean> => {
    // Verificar si el navegador soporta geolocalización
    if (!navigator.geolocation) {
      console.warn('⚠️ Geolocalización no soportada por el navegador')
      return false
    }

    // Intentar verificar permisos si la API está disponible
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
        console.log('📍 Estado del permiso de geolocalización:', result.state)
        return result.state === 'granted' || result.state === 'prompt'
      } catch (error) {
        console.warn('⚠️ No se pudo verificar permisos de geolocalización:', error)
        // Continuar e intentar obtener posición de todos modos
      }
    }

    // Si no podemos verificar permisos, intentamos obtener la posición directamente
    return true
  }

  try {
    console.log('📍 Iniciando proceso de obtención de coordenadas GPS...')

    // Siempre intentar obtener coordenadas, independientemente de la verificación de permisos
    // porque getCurrentPosition() mostrará el prompt si es necesario
    try {
      console.log('📍 Solicitando coordenadas GPS...')
      const position = await getCurrentPosition()
      const { latitude, longitude } = position.coords
      const accuracy = position.coords.accuracy

      console.log(`✅ Coordenadas obtenidas exitosamente:`)
      console.log(`   - Latitud: ${latitude}`)
      console.log(`   - Longitud: ${longitude}`)
      console.log(`   - Precisión: ${accuracy ? accuracy.toFixed(2) + ' metros' : 'N/A'}`)

      // Agregar coordenadas al FormData como strings
      formData.append('gps_latitude', latitude.toString())
      formData.append('gps_longitude', longitude.toString())

      console.log('✅ Coordenadas agregadas al FormData')
    } catch (geoError: any) {
      console.error('❌ Error al obtener coordenadas GPS:', geoError)

      // Manejar diferentes tipos de errores de geolocalización
      if (geoError.code === 1) {
        // PERMISSION_DENIED
        console.warn('⚠️ Permiso de geolocalización denegado')
        notify({
          message: 'No se pudo obtener la ubicación. Verifique los permisos de geolocalización en su navegador.',
          color: 'warning',
          duration: 5000,
        })
      } else if (geoError.code === 2) {
        // POSITION_UNAVAILABLE
        console.warn('⚠️ Información de ubicación no disponible')
        notify({
          message: 'No se pudo determinar la ubicación. Continúe sin coordenadas GPS.',
          color: 'warning',
          duration: 4000,
        })
      } else if (geoError.code === 3) {
        // TIMEOUT
        console.warn('⚠️ Tiempo de espera agotado para obtener ubicación')
        notify({
          message: 'Tiempo de espera agotado para obtener la ubicación. Continúe sin coordenadas GPS.',
          color: 'warning',
          duration: 4000,
        })
      }

      // Continuar sin coordenadas GPS - no bloqueamos el registro de entrega
      console.log('⚠️ Continuando con el registro de entrega sin coordenadas GPS')
    }

    console.log('📤 Contenido del FormData antes de enviar:')
    const formDataEntries: string[] = []
    ;(formData as any).forEach((value: any, key: string) => {
      if (value instanceof File) {
        formDataEntries.push(`  - ${key}: [Archivo] ${value.name} (${value.size} bytes)`)
      } else {
        formDataEntries.push(`  - ${key}: ${value}`)
      }
    })
    console.log(formDataEntries.join('\n'))

    // Verificar especialmente las coordenadas GPS
    const hasLat = formData.has('gps_latitude')
    const hasLon = formData.has('gps_longitude')
    console.log(
      `📍 Coordenadas GPS en FormData: ${hasLat ? '✅ Latitud presente' : '❌ Latitud faltante'}, ${
        hasLon ? '✅ Longitud presente' : '❌ Longitud faltante'
      }`,
    )

    const response = await api.createDelivery(pkg.value.package_id, formData)
    const deliveryId: string | undefined = response.data?.delivery_id

    console.log('✅ Registro de entrega guardado:', response.data)

    // Extraer fotos del FormData para subida incremental
    const photosFromForm: File[] = []
    ;(formData as any).forEach((val: any, key: string) => {
      if (key === 'photos' && val instanceof File) photosFromForm.push(val)
    })

    if (deliveryId && photosFromForm.length > 1) {
      // La primera foto ya se incluyó en el request original, subir el resto
      const remainingPhotos = photosFromForm.slice(1)
      notify({
        message: `📤 Subiendo ${remainingPhotos.length} foto(s) adicionales...`,
        color: 'info',
        duration: 2500,
      })
      let uploadedCount = 0
      for (const photo of remainingPhotos) {
        let lastErr: any
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await api.uploadDeliveryPhoto(deliveryId, photo)
            uploadedCount++
            break
          } catch (err: any) {
            lastErr = err
            if (attempt < 3) {
              await new Promise((r) => setTimeout(r, 2000 * attempt))
            }
          }
        }
        if (lastErr && uploadedCount < remainingPhotos.length) {
          console.warn('⚠️ No se pudo subir una foto de evidencia:', lastErr)
          notify({
            message: '⚠️ Algunas fotos no pudieron subirse. El registro se guardó igualmente.',
            color: 'warning',
            duration: 5000,
          })
        }
      }
    }

    notify({ message: 'Registro de entrega guardado con éxito.', color: 'success' })

    showCloseDeliveryConfirm.value = false
    doShowDeliveryModal.value = false

    // Redirigir a la gestión de paquetes de la ruta actual
    if (response.data.route_id) {
      console.log(`🚀 Redirigiendo a la ruta: ${response.data.route_id}`)
      router.push({ name: 'route-details', params: { id: response.data.route_id } })
    } else {
      // Si no hay route_id en la respuesta, recargar los datos del paquete
      fetchData()
    }
  } catch (e: any) {
    console.error('❌ Error al guardar la entrega:', e)

    let errorMessage = 'Error al guardar el registro.'
    if (e.message === 'PERMISSION_DENIED' || (e.code && typeof e.code === 'number' && e.code === 1)) {
      errorMessage =
        'Se necesita permiso de ubicación para registrar la entrega. Por favor, habilite la geolocalización en la configuración de su navegador y recargue la página.'
    } else if (e.code && typeof e.code === 'number') {
      switch (e.code) {
        case 2: // POSITION_UNAVAILABLE
          errorMessage = 'La información de ubicación no está disponible.'
          break
        case 3: // TIMEOUT
          errorMessage = 'Se agotó el tiempo de espera para obtener la ubicación.'
          break
        default:
          errorMessage = 'Ocurrió un error al obtener la ubicación.'
      }
    } else if (e.response?.data?.message) {
      errorMessage = e.response.data.message
    }

    notify({ message: errorMessage, color: 'danger' })
  } finally {
    isSavingDelivery.value = false
  }
}

const formatDate = (dateString: string) => {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleString('es-CL')
}

const formatCurrency = (value: number | string | undefined) => {
  if (value === undefined || value === null) return '$0'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '$0'
  return `$${num.toLocaleString('es-CL')}`
}
</script>

<template>
  <div v-if="isLoading" class="flex justify-center p-8">
    <VaProgressCircle indeterminate />
  </div>

  <div v-else-if="pkg">
    <h1 class="page-title">Detalles del Paquete</h1>

    <VaCard class="mb-6">
      <VaCardContent class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <p class="va-text-secondary">Código de Seguimiento</p>
          <p class="va-h6">{{ pkg.tracking_code }}</p>
        </div>
        <div>
          <p class="va-text-secondary">Código Externo</p>
          <div v-if="isEditingTracking" class="flex items-center gap-2 mt-1">
            <VaInput v-model="editTrackingCode" placeholder="Código externo" class="flex-1" style="max-width: 280px" />
            <VaButton
              preset="primary"
              size="small"
              icon="check"
              :loading="isSavingTracking"
              @click="saveTrackingCode"
            />
            <VaButton
              preset="secondary"
              size="small"
              icon="close"
              :disabled="isSavingTracking"
              @click="cancelEditTracking"
            />
          </div>
          <div v-else class="flex items-center gap-2">
            <p class="va-h6">{{ pkg.external_tracking_code || 'No asignado' }}</p>
            <VaButton
              v-if="canEditTracking"
              preset="plain"
              size="small"
              icon="edit"
              title="Editar código externo"
              @click="startEditTracking"
            />
          </div>
        </div>
        <div>
          <p class="va-text-secondary">Estado Actual</p>
          <VaBadge :text="pkg.status.replace(/_/g, ' ')" size="large" />
        </div>
      </VaCardContent>
    </VaCard>

    <VaCard class="mb-6">
      <VaCardTitle>Detalles del Envío</VaCardTitle>
      <VaCardContent class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p class="va-text-secondary">Cliente</p>
          <p>{{ pkg.client?.client_name }}</p>
        </div>
        <div>
          <p class="va-text-secondary">Destinatario</p>
          <p>{{ pkg.recipient_name }}</p>
        </div>
        <div>
          <p class="va-text-secondary">Teléfono del Destinatario</p>
          <p>{{ pkg.recipient_phone || 'No proporcionado' }}</p>
        </div>
        <div>
          <p class="va-text-secondary">Dirección de Entrega</p>
          <p>{{ pkg.destination_address }}</p>
        </div>
        <div>
          <p class="va-text-secondary">Fecha de Escaneo en Origen</p>
          <p>{{ formatDate(pkg.scanned_at_origin_datetime) }}</p>
        </div>
        <div v-if="pkg.has_multiple_labels && pkg.sales_codes">
          <p class="va-text-secondary">Códigos de Venta</p>
          <p>
            <VaBadge
              v-for="code in pkg.sales_codes.split(',')"
              :key="code.trim()"
              :text="code.trim()"
              color="info"
              class="mr-1 mb-1"
            />
          </p>
        </div>
      </VaCardContent>
    </VaCard>

    <!-- Imagen de la etiqueta OCR -->
    <VaCard v-if="pkg.label_image" class="mb-6">
      <VaCardTitle>
        <div class="flex items-center gap-2">
          <VaIcon name="fa4-image" />
          Etiqueta Escaneada
        </div>
      </VaCardTitle>
      <VaCardContent>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="flex justify-center md:justify-start">
            <div
              class="photo-card group relative overflow-hidden rounded-xl bg-white shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer"
              style="max-width: 280px; max-height: 350px"
              @click="openLabelImage"
            >
              <img
                :src="getLabelImageUrl(pkg.label_image.image_path)"
                :alt="pkg.label_image.filename"
                class="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                @error="handleImageError"
              />
              <!-- Overlay con icono de zoom -->
              <div
                class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-300 flex items-center justify-center"
              >
                <i
                  class="fa fa-search-plus text-white text-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                ></i>
              </div>
            </div>
          </div>
          <div class="space-y-3">
            <div>
              <p class="va-text-secondary text-sm">Parser Utilizado</p>
              <VaBadge :text="pkg.label_image.parser_used || 'Generic'" color="info" />
            </div>
            <div v-if="pkg.label_image.confidence">
              <p class="va-text-secondary text-sm">Confianza OCR</p>
              <VaBadge
                :text="`${pkg.label_image.confidence}%`"
                :color="
                  pkg.label_image.confidence >= 80 ? 'success' : pkg.label_image.confidence >= 60 ? 'warning' : 'danger'
                "
              />
            </div>
            <div>
              <p class="va-text-secondary text-sm">Fecha de Escaneo</p>
              <p class="text-sm">{{ formatDate(pkg.label_image.scanned_at) }}</p>
            </div>
            <div>
              <p class="va-text-secondary text-sm">Archivo</p>
              <p class="text-xs text-gray-600 break-all">{{ pkg.label_image.filename }}</p>
            </div>
          </div>
        </div>
      </VaCardContent>
    </VaCard>

    <VaCard class="mb-6">
      <VaCardContent class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p class="va-text-secondary">Costo de Entrega</p>
          <p class="font-bold text-lg">{{ formatCurrency(pkg.delivery_cost) }}</p>
        </div>
        <div v-if="pkg.is_cod">
          <p class="va-text-secondary">Monto a Cobrar (COD)</p>
          <p class="font-bold text-lg text-blue-600">{{ formatCurrency(pkg.cod_amount) }}</p>
        </div>
      </VaCardContent>
    </VaCard>

    <VaCard class="mb-6">
      <VaCardTitle class="flex justify-between items-center">
        <span>Gestión de Entregas</span>
        <VaButton
          :disabled="!['EN_RUTA_ENTREGA', 'REPROGRAMADO', 'INCIDENCIA_ENTREGA'].includes(pkg.status)"
          :title="
            !['EN_RUTA_ENTREGA', 'REPROGRAMADO', 'INCIDENCIA_ENTREGA'].includes(pkg.status)
              ? `No se puede registrar entrega. Estado actual: ${pkg.status}.`
              : 'Registrar intento de entrega'
          "
          icon="fa4-truck"
          @click="doShowDeliveryModal = true"
        >
          Registrar Intento de Entrega
        </VaButton>
      </VaCardTitle>

      <VaCardContent>
        <div v-if="!pkg.deliveries || pkg.deliveries.length === 0" class="text-gray-500 italic">
          Aún no se han registrado intentos de entrega para este paquete.
        </div>

        <div v-else class="space-y-3">
          <div v-for="delivery in pkg.deliveries" :key="delivery.delivery_id" class="p-3 border rounded-lg bg-gray-50">
            <div class="flex justify-between items-start">
              <div>
                <strong class="capitalize">
                  {{ delivery.status_at_delivery?.toLowerCase().replace(/_/g, ' ') || 'Sin estado' }}
                </strong>
                <p class="text-sm text-gray-600">
                  {{ formatDate(delivery.attempted_at) }}
                </p>

                <!-- Nombre del conductor -->
                <p v-if="delivery.user" class="text-sm text-gray-700 mt-1">
                  <i class="fa fa-user text-gray-500 mr-1"></i>
                  <strong>Conductor:</strong> {{ delivery.user.full_name }}
                </p>

                <!-- Nombre de quien recibió el paquete -->
                <p v-if="delivery.receiver_name" class="text-sm text-gray-700 mt-1">
                  <i class="fa fa-check-circle text-green-500 mr-1"></i>
                  <strong>Recibido por:</strong> {{ delivery.receiver_name }}
                </p>

                <!-- RUT de quien recibió el paquete -->
                <p v-if="delivery.receiver_rut" class="text-sm text-gray-700 mt-1">
                  <i class="fa fa-id-card text-blue-500 mr-1"></i>
                  <strong>RUT:</strong> {{ delivery.receiver_rut }}
                </p>

                <div v-if="delivery.deliveryPhotos && delivery.deliveryPhotos.length > 0" class="mt-2">
                  <p class="text-sm font-bold mb-1">Evidencia:</p>
                  <VaButton
                    preset="secondary"
                    size="small"
                    icon="fa4-camera"
                    class="mr-2"
                    @click="openPhotosModal(delivery.deliveryPhotos)"
                  >
                    Ver Fotos ({{ delivery.deliveryPhotos.length }})
                  </VaButton>
                </div>
              </div>

              <div class="flex items-center space-x-2">
                <VaButton
                  v-if="delivery.gps_latitude && delivery.gps_longitude"
                  preset="secondary"
                  size="small"
                  icon="location_on"
                  aria-label="Ver mapa"
                  @click="openMapModal(delivery)"
                />
                <VaBadge
                  :text="delivery.status_at_delivery || 'SIN ESTADO'"
                  :color="delivery.status_at_delivery?.includes('ENTREGADO') ? 'success' : 'warning'"
                />
              </div>
            </div>
          </div>
        </div>
      </VaCardContent>
    </VaCard>
  </div>

  <div v-else>
    <h1 class="page-title">Paquete no encontrado</h1>
  </div>

  <VaModal
    v-model="doShowDeliveryModal"
    size="medium"
    hide-default-actions
    :max-width="'600px'"
    :no-outside-dismiss="true"
    :no-esc-dismiss="true"
    :before-close="
      () => {
        showCloseDeliveryConfirm = true
        return false
      }
    "
  >
    <template #header>
      <div class="flex items-center justify-between w-full">
        <h1 class="va-h5">Registrar Entrega para {{ pkg?.tracking_code }}</h1>
        <VaButton preset="plain" icon="close" size="small" @click="showCloseDeliveryConfirm = true" />
      </div>
    </template>
    <DeliveryForm
      v-if="pkg"
      :pkg="pkg"
      :loading="isSavingDelivery"
      @close="showCloseDeliveryConfirm = true"
      @save="handleDeliverySave"
    />
  </VaModal>

  <!-- Modal de confirmación para cerrar el formulario de entrega -->
  <VaModal v-model="showCloseDeliveryConfirm" size="small" :max-width="420" hide-default-actions close-button>
    <template #header>
      <div class="flex items-center gap-2">
        <VaIcon name="warning" color="warning" size="24px" />
        <h2 class="va-h6" style="margin: 0">¿Cerrar sin guardar?</h2>
      </div>
    </template>
    <p class="text-gray-700 mb-4">
      Si cierras este formulario, se perderá todo el contenido que hayas completado.
      <strong>Esta acción no se puede deshacer.</strong>
    </p>
    <div class="flex justify-end gap-2">
      <VaButton preset="secondary" @click="showCloseDeliveryConfirm = false"> Volver al formulario </VaButton>
      <VaButton color="danger" @click="handleCloseDeliveryConfirm"> Cerrar sin guardar </VaButton>
    </div>
  </VaModal>

  <VaModal v-model="doShowMapModal" size="large" close-button hide-default-actions :max-width="800">
    <template #header>
      <h1 class="va-h5">📍 Ubicación de la Entrega</h1>
    </template>

    <div v-if="selectedMapUrl" style="width: 100%; height: 500px">
      <iframe
        :src="selectedMapUrl"
        width="100%"
        height="100%"
        style="border: 0"
        allowfullscreen=""
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
      ></iframe>
    </div>
  </VaModal>

  <VaModal
    v-model="doShowPhotosModal"
    size="large"
    close-button
    hide-default-actions
    max-width="900px"
    class="photos-modal"
  >
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
            <i class="fa fa-camera text-gray-600 text-lg"></i>
          </div>
          <div>
            <h1 class="text-xl font-bold text-gray-900">Evidencia Fotográfica</h1>
            <p class="text-sm text-gray-600">{{ selectedDeliveryPhotos?.length || 0 }} fotos tomadas</p>
          </div>
        </div>
      </div>
    </template>

    <div v-if="selectedDeliveryPhotos && selectedDeliveryPhotos.length > 0" class="photos-gallery">
      <!-- Grid responsive para las fotos -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="(photo, index) in selectedDeliveryPhotos"
          :key="photo.photo_id"
          class="photo-card group relative overflow-hidden rounded-xl bg-white shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
        >
          <!-- Número de foto -->
          <div
            class="absolute top-3 left-3 z-10 bg-black bg-opacity-70 text-white text-xs font-bold px-2 py-1 rounded-full"
          >
            {{ index + 1 }}
          </div>

          <!-- Imagen -->
          <div class="aspect-square overflow-hidden">
            <img
              :src="`${bkurl}/${photo.photo_url}`"
              :alt="`Foto ${index + 1} de la entrega`"
              class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 cursor-pointer"
              loading="lazy"
              @error="handleImageError"
              @click="openImageInLightbox(index)"
            />
          </div>

          <!-- Overlay con acciones -->
          <div
            class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-300 flex items-center justify-center"
          >
            <div class="opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex space-x-2">
              <button
                class="bg-white bg-opacity-90 hover:bg-opacity-100 text-gray-800 p-2 rounded-full shadow-lg transition-all duration-200 hover:scale-110"
                title="Ver imagen completa"
                @click.stop="openImageInNewTab(`${bkurl}/${photo.photo_url}`)"
              >
                <i class="fa fa-expand text-sm"></i>
              </button>
              <button
                class="bg-white bg-opacity-90 hover:bg-opacity-100 text-gray-800 p-2 rounded-full shadow-lg transition-all duration-200 hover:scale-110"
                title="Descargar imagen"
                @click.stop="downloadImage(`${bkurl}/${photo.photo_url}`, `foto-entrega-${index + 1}.jpg`)"
              >
                <i class="fa fa-download text-sm"></i>
              </button>
            </div>
          </div>

          <!-- Información de la foto -->
          <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-3">
            <div class="text-white text-xs opacity-90">
              <i class="fa fa-clock-o mr-1"></i>
              Foto {{ index + 1 }}
            </div>
          </div>
        </div>
      </div>

      <!-- Información adicional -->
      <div class="mt-6 p-4 bg-gray-50 rounded-lg">
        <div class="flex items-center space-x-2 text-sm text-gray-600">
          <i class="fa fa-info-circle text-blue-500"></i>
          <span>Estas fotos sirven como evidencia oficial de la entrega del paquete</span>
        </div>
      </div>
    </div>

    <div v-else class="text-center py-12">
      <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <i class="fa fa-camera text-gray-400 text-2xl"></i>
      </div>
      <h3 class="text-lg font-medium text-gray-900 mb-2">No hay fotos disponibles</h3>
      <p class="text-gray-600">Esta entrega no tiene fotos asociadas.</p>
    </div>
  </VaModal>

  <!-- Modal para la etiqueta OCR -->
  <VaModal
    v-model="doShowLabelModal"
    size="large"
    close-button
    hide-default-actions
    max-width="1000px"
    class="label-modal"
  >
    <template #header>
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
          <VaIcon name="fa4-barcode" color="primary" />
        </div>
        <div>
          <h1 class="text-xl font-bold text-gray-900">Etiqueta Original OCR</h1>
          <p class="text-sm text-gray-600">Imagen procesada por el sistema OCR</p>
        </div>
      </div>
    </template>

    <div v-if="pkg?.label_image" class="label-content">
      <!-- Imagen de la etiqueta -->
      <div class="flex justify-center mb-4">
        <img
          :src="getLabelImageUrl(pkg.label_image.image_path)"
          :alt="pkg.label_image.filename"
          class="max-w-full h-auto rounded-lg shadow-lg border-2 border-gray-200"
          @error="handleImageError"
        />
      </div>

      <!-- Información del procesamiento OCR -->
      <div class="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4 space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-gray-700">Parser Utilizado:</span>
          <VaBadge :text="pkg.label_image.parser_used || 'Generic'" color="info" />
        </div>
        <div v-if="pkg.label_image.confidence" class="flex items-center justify-between">
          <span class="text-sm font-medium text-gray-700">Confianza OCR:</span>
          <VaBadge
            :text="`${pkg.label_image.confidence}%`"
            :color="
              pkg.label_image.confidence >= 80 ? 'success' : pkg.label_image.confidence >= 60 ? 'warning' : 'danger'
            "
          />
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-gray-700">Fecha de Escaneo:</span>
          <span class="text-sm text-gray-900 font-semibold">{{ formatDate(pkg.label_image.scanned_at) }}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-gray-700">Archivo:</span>
          <span class="text-xs text-gray-600 font-mono">{{ pkg.label_image.filename }}</span>
        </div>
      </div>
    </div>
  </VaModal>

  <!-- Lightbox para ver imágenes en grande -->
  <VueEasyLightbox
    :visible="visibleLightbox"
    :imgs="lightboxImages"
    :index="currentImageIndex"
    @hide="visibleLightbox = false"
  />
</template>

<style scoped>
.page-title {
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 1rem;
}

/* Estilos modernos para el modal de fotos */
.photos-modal :deep(.va-modal__container) {
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.photos-modal :deep(.va-modal__header) {
  background: #ffffff;
  color: #374151;
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.photos-modal :deep(.va-modal__content) {
  padding: 1.5rem;
  background: #f8fafc;
}

.photos-gallery {
  animation: fadeIn 0.3s ease-in-out;
}

.photo-card {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
}

.photo-card:hover {
  transform: translateY(-4px) scale(1.02);
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.photo-card img {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  filter: brightness(1);
}

.photo-card:hover img {
  filter: brightness(1.1) contrast(1.05);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Responsive design */
@media (max-width: 768px) {
  .photos-modal :deep(.va-modal__content) {
    padding: 1rem;
  }

  .photos-gallery .grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}

/* Loading state */
.photo-card img[loading] {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
}

@keyframes loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* Estilos para el modal de etiqueta OCR */
.label-modal :deep(.va-modal__container) {
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.label-modal :deep(.va-modal__header) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1.5rem;
  border-bottom: none;
}

.label-modal :deep(.va-modal__content) {
  padding: 1.5rem;
  background: #ffffff;
}

.label-content {
  animation: fadeIn 0.3s ease-in-out;
}

.label-content img {
  max-height: 70vh;
  object-fit: contain;
}
</style>
