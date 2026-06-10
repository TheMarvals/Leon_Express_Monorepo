<template>
  <VaCard class="duplicate-card mb-4">
    <VaCardContent>
      <div class="flex items-start gap-4">
        <!-- Badge de advertencia -->
        <div class="flex-shrink-0">
          <VaIcon name="warning" size="3rem" color="warning" />
        </div>

        <!-- Contenido principal -->
        <div class="flex-grow">
          <div class="flex justify-between items-start mb-4">
            <div>
              <h3 class="text-lg font-bold">Duplicado Detectado</h3>
              <div class="text-sm text-gray-600">
                Código externo:
                <span class="font-mono font-semibold">{{ item.extracted_data?.external_tracking_code }}</span>
              </div>
            </div>
            <VaBadge text="Pendiente de Revisión" color="warning" />
          </div>

          <!-- Comparación lado a lado -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <!-- Paquete NUEVO -->
            <div class="border-2 border-warning rounded-lg p-4">
              <div class="flex justify-between items-center mb-2">
                <h4 class="font-semibold text-warning">🆕 NUEVO (Escaneado)</h4>
                <VaBadge text="Pendiente" color="warning" />
              </div>

              <div class="space-y-2 text-sm">
                <div>
                  <div class="text-gray-600">Destinatario:</div>
                  <div class="font-medium">{{ item.extracted_data?.recipient_name || 'N/A' }}</div>
                </div>

                <div>
                  <div class="text-gray-600">Dirección:</div>
                  <div class="font-medium">{{ item.extracted_data?.destination_address || 'N/A' }}</div>
                </div>

                <div>
                  <div class="text-gray-600">Teléfono:</div>
                  <div>{{ item.extracted_data?.recipient_phone || 'N/A' }}</div>
                </div>

                <!-- Imagen miniatura Nuevo -->
                <div v-if="item.image_path">
                  <div class="text-gray-600 mb-1">Evidencia Escaneada:</div>
                  <img
                    :src="getImageUrl(item.image_path) || ''"
                    class="w-full h-32 object-cover rounded cursor-pointer border hover:opacity-90"
                    @click="openImage(item.image_path)"
                  />
                </div>

                <div>
                  <div class="text-gray-600">Archivo:</div>
                  <div class="text-xs">{{ item.filename }}</div>
                </div>
              </div>
            </div>

            <!-- Paquete ORIGINAL -->
            <div class="border-2 border-info rounded-lg p-4">
              <div class="flex justify-between items-center mb-2">
                <h4 class="font-semibold text-info">📦 ORIGINAL</h4>
                <VaBadge v-if="item.duplicate_package" :text="item.duplicate_package.tracking_code" color="info" />
                <VaBadge v-else text="No encontrado" color="danger" />
              </div>

              <div v-if="item.duplicate_package" class="space-y-2 text-sm">
                <div>
                  <div class="text-gray-600">Destinatario:</div>
                  <div class="font-medium">{{ item.duplicate_package.recipient_name }}</div>
                </div>

                <div>
                  <div class="text-gray-600">Dirección:</div>
                  <div class="font-medium">{{ item.duplicate_package.destination_address }}</div>
                </div>

                <div>
                  <div class="text-gray-600">Estado:</div>
                  <VaBadge :text="item.duplicate_package.status" size="small" />
                </div>

                <div>
                  <div class="text-gray-600">Creado:</div>
                  <div>{{ formatDate(item.duplicate_package.created_at) }}</div>
                </div>

                <!-- Imagen miniatura Original -->
                <div v-if="item.duplicate_package.image_path">
                  <div class="text-gray-600 mb-1">Evidencia Original:</div>
                  <img
                    :src="getImageUrl(item.duplicate_package.image_path) || ''"
                    class="w-full h-32 object-cover rounded cursor-pointer border hover:opacity-90"
                    @click="openImage(item.duplicate_package.image_path)"
                  />
                </div>
              </div>

              <div v-else class="text-sm text-gray-500 italic">
                No se encontró el paquete original. Posiblemente fue eliminado o el código es único.
              </div>
            </div>
          </div>

          <!-- Análisis automático -->
          <VaAlert v-if="isSimilar" color="danger" class="mb-4">
            <template #title>⚠️ Posible Error de Duplicación</template>
            Los datos son idénticos o muy similares. Probablemente sea un error del cliente.
          </VaAlert>

          <VaAlert v-else color="info" class="mb-4">
            <template #title>ℹ️ Datos Diferentes</template>
            Los destinatarios o direcciones son diferentes. Podría ser un envío multi-parte.
          </VaAlert>

          <!-- Campo de notas adicionales -->
          <VaTextarea
            v-model="notes"
            label="Notas adicionales (opcional)"
            placeholder="Agrega observaciones sobre esta decisión..."
            :min-rows="2"
            class="mb-4"
          />

          <!-- Botones de resolución -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <VaButton block color="danger" :loading="resolving === 'return'" @click="handleResolve('return')">
              <VaIcon name="undo" class="mr-1" />
              Error - Devolver
            </VaButton>

            <VaButton block color="secondary" :loading="resolving === 'discard'" @click="handleResolve('discard')">
              <VaIcon name="delete" class="mr-1" />
              Descartar (Repetido)
            </VaButton>

            <VaButton block color="success" :loading="resolving === 'create'" @click="handleResolve('create')">
              <VaIcon name="inventory" class="mr-1" />
              Envío Multi-Parte
            </VaButton>
          </div>

          <!-- Explicación de opciones -->
          <div class="mt-4 p-3 bg-gray-50 rounded-lg">
            <p class="text-xs font-semibold text-gray-700 mb-2">Opciones disponibles:</p>
            <div class="text-xs text-gray-600 space-y-2">
              <div class="flex items-start gap-2">
                <VaIcon name="undo" class="text-danger mt-0.5" size="small" />
                <div>
                  <strong class="text-danger">Error - Devolver:</strong>
                  <span class="ml-1"
                    >El paquete fue escaneado por error. Se devolverá al cliente y NO se cobrará ni pagará al
                    conductor.</span
                  >
                </div>
              </div>
              <div class="flex items-start gap-2">
                <VaIcon name="delete" class="text-secondary mt-0.5" size="small" />
                <div>
                  <strong class="text-secondary">Descartar (Repetido):</strong>
                  <span class="ml-1"
                    >El conductor tomó dos fotos del mismo paquete (Misma recolección). Se descarta el escaneo nuevo y
                    se mantiene el original.</span
                  >
                </div>
              </div>
              <div class="flex items-start gap-2">
                <VaIcon name="inventory" class="text-success mt-0.5" size="small" />
                <div>
                  <strong class="text-success">Envío Multi-Parte:</strong>
                  <span class="ml-1"
                    >Es un envío válido dividido en varias partes. Se procesará y facturará normalmente como paquetes
                    independientes.</span
                  >
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </VaCardContent>

    <!-- Dialog de confirmación -->
    <VaModal
      v-model="showConfirmDialog"
      :title="`Confirmar: ${getActionLabel(pendingAction)}`"
      ok-text="Sí, Confirmar"
      cancel-text="Cancelar"
      @ok="confirmResolve"
    >
      <p class="mb-4 text-base">
        ¿Estás seguro de que deseas procesar este duplicado como: <br />
        <strong class="text-lg">{{ getActionLabel(pendingAction) }}</strong
        >?
      </p>

      <VaAlert :color="getActionColor(pendingAction)" class="mb-4">
        <template #title>
          <VaIcon
            :name="pendingAction === 'return' ? 'warning' : pendingAction === 'discard' ? 'delete' : 'info'"
            class="mr-2"
          />
          {{
            pendingAction === 'return'
              ? 'Acción de Devolución'
              : pendingAction === 'discard'
                ? 'Descartar Repetido'
                : 'Envío Multi-Parte'
          }}
        </template>
        {{ getActionExplanation(pendingAction) }}
      </VaAlert>

      <div v-if="notes" class="p-3 bg-gray-50 rounded">
        <p class="text-sm font-semibold mb-1">Notas agregadas:</p>
        <p class="text-sm text-gray-700">{{ notes }}</p>
      </div>
    </VaModal>

    <!-- Modal para ver imagen en grande -->
    <VaModal v-model="showImageModal" hide-default-actions size="large" close-button>
      <div class="flex justify-center p-2 bg-gray-100 rounded-lg">
        <img :src="currentViewingImage" class="max-w-full max-h-[80vh] object-contain rounded shadow-lg" />
      </div>
    </VaModal>
  </VaCard>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface DuplicateItem {
  id: string
  filename: string
  image_path?: string
  extracted_data: any
  duplicate_package: any
  pickup: {
    pickup_id: string
    client: {
      client_name: string
    }
  }
}

const props = defineProps<{
  item: DuplicateItem
}>()

const emit = defineEmits<{
  resolve: [queueId: string, action: 'create' | 'return' | 'discard', notes: string]
}>()

const notes = ref('')
const resolving = ref<string | null>(null)
const showConfirmDialog = ref(false)
const pendingAction = ref<'create' | 'return' | 'discard'>('return')

const showImageModal = ref(false)
const currentViewingImage = ref('')

const getImageUrl = (path?: string) => {
  if (!path) return null
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4100'

  let serverPath = path
  serverPath = serverPath.replace('/home/marval/Proyects/Leon_Express/LeonExpress_back', '')
  serverPath = serverPath.replace(/^\/app\/uploads/, '/uploads')
  if (!serverPath.startsWith('/uploads')) {
    if (!serverPath.startsWith('/')) serverPath = '/' + serverPath
  }
  return `${baseUrl.replace('/api', '')}${serverPath}`
}

const openImage = (path?: string) => {
  const url = getImageUrl(path)
  if (url) {
    currentViewingImage.value = url
    showImageModal.value = true
  }
}

const isSimilar = computed(() => {
  if (!props.item.duplicate_package || !props.item.extracted_data) return false

  const newName = props.item.extracted_data.recipient_name?.toLowerCase().trim()
  const oldName = props.item.duplicate_package.recipient_name?.toLowerCase().trim()
  const newAddr = props.item.extracted_data.destination_address?.toLowerCase().trim()
  const oldAddr = props.item.duplicate_package.destination_address?.toLowerCase().trim()

  return newName === oldName && newAddr === oldAddr
})

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const handleResolve = (action: 'create' | 'return' | 'discard') => {
  pendingAction.value = action
  showConfirmDialog.value = true
}

const confirmResolve = async () => {
  resolving.value = pendingAction.value
  try {
    emit('resolve', props.item.id, pendingAction.value, notes.value)
  } finally {
    resolving.value = null
    showConfirmDialog.value = false
  }
}

const getActionLabel = (action: string) => {
  const labels: Record<string, string> = {
    return: 'Error - Devolver al Cliente',
    create: 'Envío Multi-Parte (Válido)',
    discard: 'Descartar (Foto Repetida)',
  }
  return labels[action] || action
}

const getActionColor = (action: string) => {
  const colors: Record<string, string> = {
    return: 'danger',
    create: 'success',
    discard: 'secondary',
  }
  return colors[action] || 'secondary'
}

const getActionExplanation = (action: string) => {
  const explanations: Record<string, string> = {
    return:
      'El paquete se registrará con estado DEVUELTO_A_CLIENTE para auditoría. NO se cobrará al cliente ni se pagará al conductor. El paquete se marcará para devolución.',
    create:
      'El paquete se creará normalmente como parte de un envío multi-parte. Se procesará, cobrará al cliente y pagará al conductor según corresponda.',
    discard:
      'Se descartará este escaneo porque es una foto repetida de un paquete de la misma recolección. Se mantendrá el paquete original.',
  }
  return explanations[action] || ''
}
</script>

<style scoped>
.duplicate-card {
  border-left: 4px solid var(--va-warning);
}

.duplicate-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
</style>
