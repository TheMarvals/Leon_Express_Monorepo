<template>
  <div class="ocr-review-dashboard">
    <VaCard>
      <VaCardTitle>
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-2">
            <VaIcon name="photo_camera" size="large" />
            <h1 class="text-2xl font-bold">Revisión OCR</h1>
          </div>
          <VaButton icon="refresh" :loading="loading" @click="loadData"> Actualizar </VaButton>
        </div>
      </VaCardTitle>

      <VaCardContent>
        <!-- Tabs unificados (sin estadísticas arriba) -->
        <div class="tabs-scroll-container mb-4">
          <VaTabs v-model="activeTab" class="ocr-tabs">
            <template #tabs>
              <VaTab v-for="tab in allTabs" :key="tab.value" :name="tab.value">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold uppercase">{{ tab.label }}</span>
                  <VaBadge v-if="tab.count > 0" :text="tab.count" size="small" :color="tab.badgeColor || 'primary'" />
                </div>
              </VaTab>
            </template>
          </VaTabs>
        </div>

        <!-- Contenido según tab activo -->

        <!-- Tabs de tiempo: today, yesterday, last7Days, older -->
        <div v-if="['today', 'yesterday', 'last7Days', 'older'].includes(activeTab)" class="time-group-section">
          <div v-if="currentTimeGroup">
            <!-- Si tiene grupos horarios (Hoy / Ayer) -->
            <template v-if="currentTimeGroup.hourlyGroups && currentTimeGroup.hourlyGroups.length > 0">
              <div class="space-y-2">
                <VaCollapse
                  v-for="hourGroup in currentTimeGroup.hourlyGroups"
                  :key="hourGroup.hour"
                  :model-value="!!accordionState[`hour_${activeTab}_${hourGroup.hour}`]"
                  :header="`${hourGroup.label} (${hourGroup.items.length})`"
                  icon="schedule"
                  @update:modelValue="(val: boolean) => (accordionState[`hour_${activeTab}_${hourGroup.hour}`] = val)"
                >
                  <div class="grid grid-cols-1 gap-4 p-4">
                    <OcrReviewCard
                      v-for="item in hourGroup.items"
                      :key="item.id"
                      :item="item"
                      @approve="handleApprove"
                      @reject="handleReject"
                    />
                  </div>
                </VaCollapse>
              </div>
            </template>

            <!-- Si tiene grupos diarios (Últimos 7 días / Más antiguos) -->
            <template v-else-if="currentTimeGroup.dailyGroups && currentTimeGroup.dailyGroups.length > 0">
              <div class="space-y-2">
                <VaCollapse
                  v-for="dayGroup in currentTimeGroup.dailyGroups"
                  :key="dayGroup.date"
                  :model-value="!!accordionState[`day_${activeTab}_${dayGroup.date}`]"
                  :header="`${dayGroup.label} (${dayGroup.items.length})`"
                  icon="event"
                  @update:modelValue="(val: boolean) => (accordionState[`day_${activeTab}_${dayGroup.date}`] = val)"
                >
                  <div class="grid grid-cols-1 gap-4 p-4">
                    <OcrReviewCard
                      v-for="item in dayGroup.items"
                      :key="item.id"
                      :item="item"
                      @approve="handleApprove"
                      @reject="handleReject"
                    />
                  </div>
                </VaCollapse>
              </div>
            </template>

            <!-- Sin grupos (lista simple) -->
            <template v-else>
              <div v-if="currentTimeGroup.items.length === 0" class="text-center py-8">
                <VaIcon name="check_circle" size="4rem" color="success" />
                <p class="text-lg mt-4">No hay paquetes en este período</p>
              </div>
              <div v-else class="grid grid-cols-1 gap-4">
                <OcrReviewCard
                  v-for="item in currentTimeGroup.items"
                  :key="item.id"
                  :item="item"
                  @approve="handleApprove"
                  @reject="handleReject"
                />
              </div>
            </template>
          </div>
        </div>

        <!-- Tab de duplicados -->
        <div v-else-if="activeTab === 'duplicates'" class="duplicates-section">
          <div v-if="duplicatePackages.length === 0" class="text-center py-8">
            <VaIcon name="check_circle" size="4rem" color="success" />
            <p class="text-lg mt-4">No hay duplicados pendientes de revisión.</p>
          </div>

          <div v-else class="grid grid-cols-1 gap-4">
            <DuplicateCard
              v-for="item in duplicatePackages"
              :key="item.id"
              :item="item as any"
              @resolve="handleResolveDuplicate"
            />
          </div>
        </div>

        <!-- Tab de historial -->
        <div v-else-if="activeTab === 'history'" class="history-section">
          <VaInput
            v-model="searchExternalCode"
            placeholder="Buscar por código externo o interno (ej: L4414)"
            class="mb-4"
            @keyup.enter="searchDuplicateHistory"
          >
            <template #append>
              <VaButton icon="search" :loading="loadingHistory" @click="searchDuplicateHistory" />
            </template>
          </VaInput>

          <div v-if="historyItems.length > 0" class="mt-4">
            <VaDataTable :items="historyItems" :columns="historyColumns">
              <template #cell(duplicate_handling)="{ value }">
                <VaBadge :text="getDuplicateLabel(value)" :color="getDuplicateColor(value)" />
              </template>

              <template #cell(status)="{ value }">
                <VaBadge :text="value" />
              </template>

              <!-- Mostrar notas de acción como toolip si están presentes -->
              <template #cell(action_notes)="{ value }">
                <span v-if="value" class="text-xs text-gray-500 truncate inline-block max-w-xs" :title="value">
                  {{ value }}
                </span>
                <span v-else class="text-gray-400">-</span>
              </template>
            </VaDataTable>
          </div>
          <div v-else-if="loadingHistory" class="text-center py-4">
            <VaInnerLoading :loading="true" />
          </div>
          <div v-else class="text-center py-8 text-gray-500">Realiza una búsqueda para ver el historial</div>
        </div>
      </VaCardContent>
    </VaCard>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'vuestic-ui'
import ocrReviewService, { type OcrQueueItem, type DuplicatePackage, type TimeGroup } from '@/services/ocrReviewService'
import OcrReviewCard from './OcrReviewCard.vue'
import DuplicateCard from './DuplicateCard.vue'

const { init: notify } = useToast()

const loading = ref(false)
const activeTab = ref('today') // Tab activo único (sin anidamiento)

const stats = ref({
  total_pending: 0,
  total_duplicates: 0,
  total_low_confidence: 0,
  total_processed_today: 0,
})

const groupedData = ref<{
  groups: {
    today: TimeGroup
    yesterday: TimeGroup
    last7Days: TimeGroup
    older: TimeGroup
  }
  summary: {
    total: number
    today: number
    yesterday: number
    last7Days: number
    older: number
  }
} | null>(null)

const duplicatePackages = ref<DuplicatePackage[]>([])
const historyItems = ref<any[]>([])
const searchExternalCode = ref('')
const loadingHistory = ref(false)

// Estado de expansión individual (mapa key -> boolean) para evitar bugs de índice
const accordionState = ref<Record<string, boolean>>({})

// Tabs unificados (todos al mismo nivel)
const allTabs = computed(() => {
  const tabs = []

  if (groupedData.value) {
    tabs.push(
      {
        label: 'Hoy',
        value: 'today',
        count: groupedData.value.summary.today,
        badgeColor: 'info',
      },
      {
        label: 'Ayer',
        value: 'yesterday',
        count: groupedData.value.summary.yesterday,
        badgeColor: 'info',
      },
      {
        label: 'Últimos 7 días',
        value: 'last7Days',
        count: groupedData.value.summary.last7Days,
        badgeColor: 'info',
      },
      {
        label: 'Más antiguos',
        value: 'older',
        count: groupedData.value.summary.older,
        badgeColor: 'warning',
      },
    )
  }

  tabs.push(
    {
      label: 'Duplicados',
      value: 'duplicates',
      count: stats.value.total_duplicates,
      badgeColor: 'danger',
    },
    {
      label: 'Historial',
      value: 'history',
      count: 0,
      badgeColor: 'secondary',
    },
  )

  return tabs
})

const currentTimeGroup = computed(() => {
  if (!groupedData.value) return null

  const timeTabKeys = ['today', 'yesterday', 'last7Days', 'older'] as const
  type TimeTabKey = (typeof timeTabKeys)[number]

  if (timeTabKeys.includes(activeTab.value as TimeTabKey)) {
    return groupedData.value.groups[activeTab.value as TimeTabKey]
  }

  return null
})

const historyColumns = [
  { key: 'tracking_code', label: 'Código Interno' },
  { key: 'external_tracking_code', label: 'Código Externo' },
  { key: 'recipient_name', label: 'Destinatario' },
  { key: 'status', label: 'Estado' },
  { key: 'duplicate_handling', label: 'Tipo' },
  { key: 'reason', label: 'Motivo de Revisión' },
  { key: 'reviewed_by_name', label: 'Revisado por' },
  { key: 'action_notes', label: 'Notas' },
  { key: 'created_at', label: 'Fecha' },
]

const loadData = async () => {
  loading.value = true
  try {
    await Promise.all([loadStats(), loadGroupedPending(), loadDuplicates()])
  } catch (error: any) {
    notify({
      message: `Error al cargar datos: ${error.message}`,
      color: 'danger',
    })
  } finally {
    loading.value = false
  }
}

const loadStats = async () => {
  const data = await ocrReviewService.getStats()
  stats.value = data
}

const loadGroupedPending = async () => {
  const data = await ocrReviewService.getGroupedPending({ include_duplicates: false })
  groupedData.value = data

  // Auto-seleccionar el primer tab que tenga datos
  const timeKeys = ['today', 'yesterday', 'last7Days', 'older'] as const
  const firstWithData = timeKeys.find((key) => data.summary[key] > 0)
  if (firstWithData && activeTab.value === 'today' && data.summary.today === 0) {
    activeTab.value = firstWithData
  }

  // Auto-expandir el primer grupo horario si existe y no hay estado previo
  if (Object.keys(accordionState.value).length === 0) {
    const selectedTab = activeTab.value as (typeof timeKeys)[number]
    const group = data.groups[selectedTab]
    if (group?.hourlyGroups && group.hourlyGroups.length > 0) {
      const firstGroupKey = `hour_${selectedTab}_${group.hourlyGroups[0].hour}`
      accordionState.value[firstGroupKey] = true
    } else if (group?.dailyGroups && group.dailyGroups.length > 0) {
      const firstGroupKey = `day_${selectedTab}_${group.dailyGroups[0].date}`
      accordionState.value[firstGroupKey] = true
    }
  }
}

const loadDuplicates = async () => {
  const data = await ocrReviewService.getPendingDuplicates()
  duplicatePackages.value = data.items || []
}

const getErrorMessage = (error: any): string => {
  // Extraer el mensaje real del backend (Axios guarda la respuesta en error.response)
  const backendMessage = error.response?.data?.message || error.response?.data?.error
  if (backendMessage) return backendMessage
  return error.message || 'Error desconocido'
}

const handleApprove = async (queueId: string, correctedData: any) => {
  try {
    await ocrReviewService.approvePackage(queueId, correctedData)
    notify({
      message: 'Paquete aprobado exitosamente',
      color: 'success',
    })
    await loadData()
  } catch (error: any) {
    const msg = getErrorMessage(error)
    console.error('❌ Error al aprobar:', error.response?.data || error.message)
    notify({
      message: `Error al aprobar: ${msg}`,
      color: 'danger',
      duration: 8000,
    })
  }
}

const handleReject = async (queueId: string, reason: string) => {
  try {
    await ocrReviewService.rejectPackage(queueId, reason)
    notify({
      message: 'Paquete rechazado',
      color: 'success',
    })
    await loadData()
  } catch (error: any) {
    const msg = getErrorMessage(error)
    console.error('❌ Error al rechazar:', error.response?.data || error.message)
    notify({
      message: `Error al rechazar: ${msg}`,
      color: 'danger',
      duration: 8000,
    })
  }
}

const handleResolveDuplicate = async (queueId: string, action: 'create' | 'return' | 'discard', notes: string) => {
  try {
    const response = await ocrReviewService.resolveDuplicate(queueId, action, notes)
    const actionLabels: Record<string, string> = {
      create: 'Multi-Parte',
      return: 'Devolver',
      discard: 'Descartado',
    }
    const actionLabel = actionLabels[action] || action
    notify({
      message: `✓ Duplicado resuelto: ${actionLabel}. ${response.message}`,
      color: 'success',
    })
    await loadData()
  } catch (error: any) {
    const msg = getErrorMessage(error)
    console.error('❌ Error al resolver duplicado:', error.response?.data || error.message)
    notify({
      message: `Error al resolver: ${msg}`,
      color: 'danger',
      duration: 8000,
    })
  }
}

const searchDuplicateHistory = async () => {
  if (!searchExternalCode.value) {
    notify({
      message: 'Ingresa un código para buscar',
      color: 'warning',
    })
    return
  }

  loadingHistory.value = true
  try {
    const data = await ocrReviewService.getOcrReviewHistory({ search: searchExternalCode.value })
    historyItems.value = data
    if (data.length === 0) {
      notify({ message: 'No se encontraron resultados para esta búsqueda', color: 'info' })
    }
  } catch (error: any) {
    notify({
      message: `Error al buscar historial: ${error.message}`,
      color: 'danger',
    })
  } finally {
    loadingHistory.value = false
  }
}

const getDuplicateLabel = (value: string) => {
  const labels: Record<string, string> = {
    pending: 'Pendiente',
    error_return: 'Error - Devolver',
    multi_part: 'Envío Multi-Parte',
    confirmed_unique: 'Único Confirmado',
  }
  return labels[value] || value
}

const getDuplicateColor = (value: string) => {
  if (!value) return 'secondary'
  const colors: Record<string, string> = {
    pending: 'warning',
    error_return: 'danger',
    multi_part: 'success',
    confirmed_unique: 'info',
    'Auto-Aprobado': 'success',
    'Aprobado Manual': 'primary',
    Rechazado: 'danger',
  }
  return colors[value] || 'secondary'
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.ocr-review-dashboard {
  padding: 1.5rem;
}

@media (max-width: 768px) {
  .ocr-review-dashboard {
    padding: 0.75rem;
  }
}

.stat-card {
  border-left: 4px solid var(--va-primary);
  transition: transform 0.2s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
}

.time-group-section,
.duplicates-section,
.history-section {
  min-height: 300px;
}

/* === TABS IMPROVEMENTS === */
.tabs-scroll-container {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  background-color: var(--va-background-element);
  border-radius: 12px;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.05);
  padding: 0.5rem;
}

.tabs-scroll-container::-webkit-scrollbar {
  height: 4px;
}
.tabs-scroll-container::-webkit-scrollbar-thumb {
  background: var(--va-background-border);
  border-radius: 4px;
}

.ocr-tabs {
  min-width: max-content;
}

:deep(.va-tabs__container) {
  flex-wrap: nowrap !important;
}

:deep(.va-tab) {
  padding: 0 1.25rem;
  white-space: nowrap;
}

:deep(.va-tab__content) {
  padding: 0.75rem 0;
}

@media (max-width: 768px) {
  .tabs-scroll-container {
    padding: 0.25rem;
  }

  :deep(.va-tab) {
    padding: 0 0.75rem;
  }

  :deep(.va-tab .text-xs) {
    font-size: 0.7rem;
  }
}

/* === COLLAPSE STYLES === */
:deep(.va-collapse__header) {
  background-color: var(--va-background-element);
  padding: 1.25rem 1.5rem;
  font-weight: 600;
  border-radius: 8px;
  margin-bottom: 0.75rem;
  transition: all 0.2s ease;
  border: 1px solid var(--va-background-border);
}

:deep(.va-collapse__header:hover) {
  background-color: var(--va-background-border);
  transform: translateX(4px);
}

:deep(.va-collapse__body) {
  background-color: transparent;
  padding: 0 0 1rem 0;
}

/* Custom badge space */
.gap-2 {
  gap: 0.5rem;
}
</style>
