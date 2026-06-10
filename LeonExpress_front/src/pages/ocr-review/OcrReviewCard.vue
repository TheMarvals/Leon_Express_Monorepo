<template>
  <VaCard class="ocr-review-card mb-4">
    <VaCardContent>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- Columna 1: Imagen escaneada -->
        <div class="image-section">
          <h3 class="text-sm font-semibold mb-2">Imagen Escaneada</h3>
          <div class="relative">
            <img
              v-if="imageUrl"
              :src="imageUrl"
              :alt="item.filename"
              class="w-full rounded border border-gray-300 cursor-pointer"
              @click="showImageModal = true"
            />
            <VaIcon v-else name="image_not_supported" size="4rem" class="text-gray-400" />
          </div>
          <div class="text-xs text-gray-600 mt-2">
            <div>Archivo: {{ item.filename }}</div>
            <div>Parser: {{ item.parser_used }}</div>
            <div>Fecha: {{ formatDate(item.created_at) }}</div>
          </div>
        </div>

        <!-- Columna 2: Datos extraídos -->
        <div class="data-section">
          <div class="flex justify-between items-center mb-2">
            <h3 class="text-sm font-semibold">Datos Extraídos</h3>
            <VaBadge
              :text="`${item.overall_confidence || 0}% confianza`"
              :color="getConfidenceColor(item.overall_confidence || 0)"
            />
          </div>

          <!-- Alerta si no hay datos extraídos -->
          <VaAlert v-if="!hasExtractedData" color="warning" class="mb-3" border="left">
            <template #title>
              <VaIcon name="warning" class="mr-1" />
              OCR sin datos
            </template>
            El OCR no pudo extraer información de esta imagen. Por favor, ingresa los datos manualmente.
          </VaAlert>

          <!-- Formulario editable -->
          <div class="space-y-2">
            <VaInput v-model="formData.external_tracking_code" label="Código Externo" placeholder="Opcional" />

            <!-- Advertencia de ID de Venta ML -->
            <VaAlert v-if="looksLikeMLVentaId" color="warning" class="mb-2" border="left">
              <template #title>
                <VaIcon name="warning" class="mr-1" />
                Posible ID de Venta de Mercado Libre
              </template>
              El código <strong>{{ formData.external_tracking_code }}</strong> parece ser un ID de Venta (empieza con
              20000). El código de Envío correcto normalmente empieza con <strong>4</strong> (ej: 46XXXXXXXXX). Puedes
              corregirlo arriba si está disponible en la imagen, o aprobar así si es correcto.
            </VaAlert>

            <VaInput
              v-model="formData.recipient_name"
              label="Destinatario"
              :error="!formData.recipient_name"
              :error-messages="!formData.recipient_name ? ['Campo requerido'] : []"
            />

            <VaInput v-model="formData.recipient_phone" label="Teléfono" placeholder="+56 9 1234 5678" />

            <VaTextarea
              v-model="formData.destination_address"
              label="Dirección"
              :error="!formData.destination_address"
              :error-messages="!formData.destination_address ? ['Campo requerido'] : []"
              :min-rows="2"
            />
          </div>

          <!-- Información de precios (cargados automáticamente) -->
          <div v-if="!isLoadingPrices" class="mt-3">
            <!-- Alerta si el precio del cliente es 0 -->
            <VaAlert v-if="formData.client_price === 0" color="warning" class="mb-2" border="left">
              <template #title>
                <VaIcon name="warning" class="mr-1" />
                Sin Precio Configurado
              </template>
              Este cliente no tiene una política de precios activa. Configúrala en la sección de Clientes antes de
              aprobar.
            </VaAlert>

            <div class="p-2 bg-blue-50 rounded border border-blue-200">
              <div class="text-xs text-blue-700 font-semibold mb-1">💰 Precios Automáticos</div>
              <div class="text-xs text-gray-600">
                <div>Precio Cliente: ${{ formData.client_price.toLocaleString() }}</div>
                <div>Costo Entrega: ${{ formData.delivery_cost.toLocaleString() }}</div>
              </div>
            </div>
          </div>
          <div v-else class="mt-3 p-2 bg-gray-50 rounded">
            <div class="text-xs text-gray-500">⏳ Cargando precios...</div>
          </div>
        </div>

        <!-- Columna 3: Información y acciones -->
        <div class="actions-section">
          <h3 class="text-sm font-semibold mb-2">Información</h3>

          <!-- Info del pickup -->
          <div class="bg-gray-50 p-3 rounded mb-3 text-sm">
            <div class="font-semibold">{{ item.pickup.client.client_name }}</div>
            <div class="text-gray-600">{{ item.pickup.client.contact_name }}</div>
            <div class="text-gray-600">{{ item.pickup.client.contact_phone }}</div>
            <div class="mt-2">
              <VaBadge :text="`Driver: ${item.pickup.driver.name}`" color="info" class="text-xs" />
            </div>
          </div>

          <!-- Indicador de duplicado -->
          <VaAlert v-if="item.is_duplicate" color="warning" class="mb-3">
            <template #title>⚠️ Duplicado Detectado</template>
            {{ item.duplicate_reason || 'Código externo ya existe en el sistema' }}
          </VaAlert>

          <!-- Campos extraídos -->
          <div class="mb-3">
            <div class="text-xs text-gray-600">Campos extraídos: {{ item.fields_extracted }}</div>
            <VaProgressBar
              :model-value="(item.fields_extracted / 4) * 100"
              :color="item.fields_extracted >= 2 ? 'success' : 'warning'"
              size="small"
            />
          </div>

          <!-- Texto OCR crudo (colapsable) -->
          <VaCollapse v-model="showRawText" header="Ver texto OCR crudo">
            <pre class="text-xs bg-gray-100 p-2 rounded mt-2 overflow-auto max-h-32">{{ item.ocr_raw_text }}</pre>
          </VaCollapse>

          <!-- Botones de acción -->
          <div class="mt-4 space-y-2">
            <VaButton block color="success" :disabled="!isFormValid" :loading="approving" @click="promptApprove">
              <VaIcon name="check" class="mr-1" />
              Aprobar y Crear Paquete
            </VaButton>

            <!-- Mensaje de ayuda cuando el botón está deshabilitado -->
            <div
              v-if="!isFormValid && formData.client_price === 0"
              class="text-xs text-warning p-2 bg-warning-light rounded"
            >
              ⚠️ Configura el precio del cliente para poder aprobar
            </div>

            <VaButton block color="danger" variant="secondary" :loading="rejecting" @click="showRejectDialog = true">
              <VaIcon name="delete" class="mr-1" />
              Descartar
            </VaButton>
          </div>
        </div>
      </div>
    </VaCardContent>

    <!-- Modal de imagen ampliada -->
    <VaModal v-model="showImageModal" size="large" title="Imagen Escaneada">
      <img v-if="imageUrl" :src="imageUrl" :alt="item.filename" class="w-full" />
    </VaModal>

    <!-- Dialog de confirmación de duplicados -->
    <VaModal
      v-model="showApproveDuplicateDialog"
      title="Confirmar Creación de Duplicado"
      ok-text="Sí, Forzar Creación"
      cancel-text="Cancelar"
      @ok="handleApprove"
    >
      <VaAlert color="danger" class="mb-4">
        <template #title>
          <VaIcon name="warning" class="mr-2" />
          Atención: Creación Forzada
        </template>
        Aprobar un paquete marcado como duplicado podría generar cobros dobles o errores operativos. Solo debes hacer
        esto si estás seguro que corresponde a un envío "Multi-Parte" válido (donde un mismo cliente envía varias cosas
        con el mismo código). Si fue un error de escaneo repetido del conductor, debes presionar Rechazar.
      </VaAlert>
    </VaModal>

    <!-- Dialog de descarte -->
    <VaModal
      v-model="showRejectDialog"
      title="Descartar Paquete"
      ok-text="Descartar y Eliminar"
      cancel-text="Cancelar"
      @ok="handleApproveReject"
    >
      <VaTextarea
        v-model="rejectReason"
        label="Razón del descarte"
        placeholder="Ej: Imagen borrosa, datos incompletos, etiqueta ilegible, duplicado accidental..."
        :min-rows="3"
      />
    </VaModal>
  </VaCard>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'vuestic-ui'
import type { OcrQueueItem } from '@/services/ocrReviewService'
import api from '@/services/api'

const props = defineProps<{
  item: OcrQueueItem
}>()

const emit = defineEmits<{
  approve: [queueId: string, correctedData: any]
  reject: [queueId: string, reason: string]
}>()

const { init: notify } = useToast()

const formData = ref({
  external_tracking_code: '',
  recipient_name: '',
  recipient_phone: '',
  destination_address: '',
  client_price: 0,
  delivery_cost: 0,
})

const showRawText = ref(false)
const showImageModal = ref(false)
const showRejectDialog = ref(false)
const rejectReason = ref('')
const approving = ref(false)
const rejecting = ref(false)
const isLoadingPrices = ref(true)

const showApproveDuplicateDialog = ref(false)
const approverDialogReason = ref('')

// Verificar si hay datos extraídos
const hasExtractedData = computed(() => {
  if (!props.item.extracted_data) return false
  try {
    const data =
      typeof props.item.extracted_data === 'string' ? JSON.parse(props.item.extracted_data) : props.item.extracted_data
    return !!(data.recipient_name || data.destination_address || data.recipient_phone)
  } catch (e) {
    return false
  }
})

const imageUrl = computed(() => {
  if (!props.item.image_path) return null
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4100'

  // Normalizar la ruta almacenada en la DB para entornos locales (/home/...) y producción en contenedor (/app/uploads)
  let serverPath = props.item.image_path as string

  // Si viene con prefijo absoluto del repo local, lo eliminamos
  serverPath = serverPath.replace('/home/marval/Proyects/Leon_Express/LeonExpress_back', '')

  // Si viene con el prefijo /app/uploads (ruta dentro del contenedor), convertir a /uploads
  serverPath = serverPath.replace(/^\/app\/uploads/, '/uploads')

  // Asegurar que la ruta comience con '/uploads'
  if (!serverPath.startsWith('/uploads')) {
    // Si el path tenía una barra extra o no conocida, forzar prefijo
    if (!serverPath.startsWith('/')) serverPath = '/' + serverPath
  }

  // Construir URL pública usando baseUrl (removiendo '/api' si está presente)
  return `${baseUrl.replace('/api', '')}${serverPath}`
})

const looksLikeMLVentaId = computed(() => {
  const code = formData.value.external_tracking_code
  return code && code.startsWith('20000') && code.length === 16
})

const isFormValid = computed(() => {
  return formData.value.recipient_name && formData.value.destination_address && formData.value.client_price > 0 // Validar que el precio del cliente esté configurado
})

const getConfidenceColor = (confidence: number) => {
  if (confidence >= 80) return 'success'
  if (confidence >= 60) return 'warning'
  return 'danger'
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Cargar precio del cliente automáticamente
const loadClientPrice = async (clientId: string) => {
  if (!clientId) {
    console.warn('⚠️ No se proporcionó client_id')
    formData.value.client_price = 0
    return
  }
  try {
    console.log('💰 Cargando precio del cliente:', clientId)
    const { data } = await api.getClientPricing(clientId)
    console.log('💰 Respuesta del API pricing:', data)
    const price = parseFloat(data?.base_price) || 0
    console.log('💰 Precio parseado:', price)
    formData.value.client_price = price
  } catch (error: any) {
    console.error('❌ Error loading client price:', error)
    formData.value.client_price = 0

    // Mensaje más específico si no hay política de precios activa
    if (error?.response?.status === 404) {
      notify({
        message:
          '⚠️ Este cliente no tiene una política de precios activa configurada. Por favor, configúrala en la sección de Clientes.',
        color: 'warning',
        duration: 6000,
      })
    } else {
      notify({
        message: 'No se pudo cargar el precio del cliente. Usando valor por defecto (0).',
        color: 'warning',
      })
    }
  }
}

// Cargar costo de entrega del conductor automáticamente
const loadPickupDriverCost = async (pickupId: string) => {
  if (!pickupId) {
    formData.value.delivery_cost = 0
    return
  }
  try {
    const { data } = await api.getPickupById(pickupId)
    const cost = parseFloat(data?.user?.vehicles?.[0]?.vehicleType?.base_delivery_cost) || 0
    formData.value.delivery_cost = cost
    if (!cost) {
      notify({
        message: 'No se encontró costo de entrega. Usando valor por defecto (0).',
        color: 'warning',
      })
    }
  } catch (error) {
    console.error('Error loading delivery cost:', error)
    formData.value.delivery_cost = 0
    notify({
      message: 'Error al cargar costo de entrega. Usando valor por defecto (0).',
      color: 'danger',
    })
  }
}

const promptApprove = () => {
  if (props.item.is_duplicate) {
    showApproveDuplicateDialog.value = true
  } else {
    handleApprove()
  }
}

const handleApprove = async () => {
  approving.value = true
  showApproveDuplicateDialog.value = false
  try {
    emit('approve', props.item.id, formData.value)
  } finally {
    approving.value = false
  }
}

const handleApproveReject = async () => {
  if (!rejectReason.value.trim()) {
    rejectReason.value = 'Rechazado manualmente sin especificar razón'
  }

  rejecting.value = true
  try {
    emit('reject', props.item.id, rejectReason.value)
    showRejectDialog.value = false
  } finally {
    rejecting.value = false
  }
}

// Inicializar formulario con datos extraídos y cargar precios
onMounted(async () => {
  console.log('🔍 OcrReviewCard mounted - Item:', props.item)

  // Asignar datos extraídos del OCR
  if (props.item.extracted_data) {
    try {
      const data =
        typeof props.item.extracted_data === 'string'
          ? JSON.parse(props.item.extracted_data)
          : props.item.extracted_data
      Object.assign(formData.value, data)
    } catch (e) {
      console.warn('Failed to parse extracted_data inside OcrReviewCard', e)
    }
  }

  // Cargar precios automáticamente desde el pickup
  if (props.item.pickup) {
    console.log('📦 Pickup info:', {
      pickup_id: props.item.pickup.pickup_id,
      client_id: props.item.pickup.client?.client_id,
      client_name: props.item.pickup.client?.client_name,
    })

    isLoadingPrices.value = true
    try {
      if (props.item.pickup.client?.client_id) {
        await Promise.all([
          loadClientPrice(props.item.pickup.client.client_id),
          loadPickupDriverCost(props.item.pickup.pickup_id),
        ])
      } else {
        await loadPickupDriverCost(props.item.pickup.pickup_id)
      }
      console.log('✅ Precios cargados:', {
        client_price: formData.value.client_price,
        delivery_cost: formData.value.delivery_cost,
      })
    } finally {
      isLoadingPrices.value = false
    }
  } else {
    console.warn('⚠️ No hay información de pickup')
    isLoadingPrices.value = false
  }
})
</script>

<style scoped>
.ocr-review-card {
  border-left: 4px solid var(--va-info);
}

.ocr-review-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.image-section img {
  max-height: 300px;
  object-fit: contain;
}
</style>
