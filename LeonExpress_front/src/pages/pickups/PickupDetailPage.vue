<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import api from '../../services/api'
import { Pickup, Package } from './types'
import { useToast, defineVaDataTableColumns } from 'vuestic-ui'
import { useUserStore } from '../../stores/user-store'
import { RouterLink } from 'vue-router'
// 1. Importa el nuevo formulario de verificación
import PackageVerificationForm from '../packages/widgets/PackageVerificationForm.vue'

const route = useRoute()
const { init: notify } = useToast()
const userStore = useUserStore()

const pickup = ref<Pickup | null>(null)
const isLoading = ref(true)

// 2. Añade estado para manejar el modal y el paquete seleccionado
const packageToVerify = ref<Package | null>(null)
const doShowVerificationModal = ref(false)
const showOcrProcessingModal = ref(false)
const dismissedOcrModal = ref(false)
const pollingInterval = ref<any>(null)

const handleOcrModalDismiss = () => {
  showOcrProcessingModal.value = false
  dismissedOcrModal.value = true
}

const stopPolling = () => {
  if (pollingInterval.value) {
    clearInterval(pollingInterval.value)
    pollingInterval.value = null
  }
}

const startPolling = () => {
  if (pollingInterval.value) return
  pollingInterval.value = setInterval(() => {
    fetchPickupDetails(true)
  }, 5000)
}

onUnmounted(() => {
  stopPolling()
})

const tableItems = computed(() => {
  if (!pickup.value) return []

  const pkgs = pickup.value.packages || []
  const ocrItems = pickup.value.ocrQueue || []

  const mappedOcr = ocrItems.map((item: any) => ({
    package_id: item.id, // ID temporal
    tracking_code: 'EN REVISIÓN',
    external_tracking_code: item.filename,
    recipient_name: '---',
    is_ocr_pending: true,
    has_multiple_labels: false,
    // Propiedades dummy para cumplir con la interfaz si es necesario
    client_id: pickup.value?.client_id as string,
  }))

  return [...mappedOcr, ...pkgs]
})

const packageColumns = defineVaDataTableColumns([
  { label: 'Código de Seguimiento', key: 'tracking_code', sortable: true },
  { label: 'Código Externo', key: 'external_tracking_code', sortable: true },
  { label: 'Destinatario', key: 'recipient_name', sortable: true },
  { label: 'Estado', key: 'status', sortable: true },
  { label: ' ', key: 'actions', align: 'right' },
])

const fetchPickupDetails = async (silent = false) => {
  if (!silent) isLoading.value = true
  try {
    const pickupId = route.params.id as string
    const response = await api.getPickupById(pickupId)
    pickup.value = response.data

    // Usar ocrStats (desde DB) para detectar si hay procesamiento activo
    const stats = response.data.ocrStats
    const hasActiveBatch = !!response.data.activeBatch
    const hasActiveOcr = stats && (stats.queued > 0 || stats.processing > 0)
    const hasNeedsReview = stats && stats.needs_review > 0

    if (hasActiveBatch || hasActiveOcr) {
      showOcrProcessingModal.value = true
      startPolling()
    } else if (hasNeedsReview && !dismissedOcrModal.value) {
      showOcrProcessingModal.value = true
      stopPolling()
    } else {
      if (showOcrProcessingModal.value && (hasActiveBatch || hasActiveOcr)) {
        showOcrProcessingModal.value = false
        notify({ message: 'Procesamiento de paquetes finalizado.', color: 'success' })
      }
      stopPolling()
    }
  } catch (error) {
    if (!silent) notify({ message: 'Error al cargar los detalles', color: 'danger' })
    console.error('Error loading pickup details:', error)
    stopPolling()
  } finally {
    if (!silent) isLoading.value = false
  }
}

onMounted(fetchPickupDetails)

// 3. Añade las funciones para abrir el modal y guardar los cambios

const openVerificationModal = (pkg: any) => {
  // Asegura que el paquete tenga todos los campos requeridos por el formulario de verificación
  packageToVerify.value = {
    package_id: pkg.package_id,
    tracking_code: pkg.tracking_code,
    external_tracking_code: pkg.external_tracking_code ?? '',
    client_id: pkg.client_id ?? pickup.value?.client_id ?? '',
    pickup_id: pkg.pickup_id ?? pickup.value?.pickup_id ?? '',
    status: pkg.status,
    is_cod: pkg.is_cod ?? false,
    cod_amount: pkg.cod_amount ?? 0,
    client_price: pkg.client_price ?? 0,
    delivery_cost: pkg.delivery_cost ?? 0,
    destination_address: pkg.destination_address ?? '',
    recipient_name: pkg.recipient_name ?? '',
    recipient_phone: pkg.recipient_phone ?? '',
    scanned_at_origin_datetime: pkg.scanned_at_origin_datetime ?? '',
    has_multiple_labels: pkg.has_multiple_labels ?? false,
    sales_codes: pkg.sales_codes ?? '',
    client: pkg.client ?? pickup.value?.client ?? undefined,
    packageCosts: pkg.packageCosts ?? [],
  }
  doShowVerificationModal.value = true
}

const handleVerificationSave = async (payload: any) => {
  if (!packageToVerify.value) return
  try {
    await api.verifyPackage(packageToVerify.value.package_id, payload)
    // Recargar el paquete actualizado desde el backend
    await fetchPickupDetails()
    // Buscar el paquete actualizado y asignarlo al modal
    const updatedPkg = pickup.value?.packages?.find((p) => p.package_id === packageToVerify.value?.package_id)
    if (updatedPkg) {
      packageToVerify.value = { ...updatedPkg }
    }
    notify({ message: 'Paquete actualizado exitosamente.', color: 'success' })
    doShowVerificationModal.value = false
  } catch (error: any) {
    const errorMessage = error.response?.data?.error || 'Error al guardar.'
    notify({ message: errorMessage, color: 'danger' })
  }
}

const updateStatus = async (newStatus: string) => {
  if (!pickup.value) return
  try {
    await api.updatePickupStatus(pickup.value.pickup_id, newStatus)
    notify({ message: `Estado actualizado correctamente`, color: 'success' })
    await fetchPickupDetails()
  } catch (error) {
    notify({ message: 'Error al actualizar el estado', color: 'danger' })
  }
}
</script>

<template>
  <div v-if="isLoading" class="flex justify-center p-8">
    <VaProgressCircle indeterminate />
  </div>

  <div v-else-if="pickup">
    <h1 class="page-title">Detalle de Recolección</h1>

    <VaCard class="mb-6">
      <VaCardContent class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <p class="va-text-secondary">Cliente</p>
          <p class="va-h6">{{ pickup.client?.client_name }}</p>
        </div>
        <div>
          <p class="va-text-secondary">Conductor Asignado</p>
          <p class="va-h6">{{ pickup.user?.full_name }}</p>
        </div>
        <div>
          <p class="va-text-secondary">Estado Actual</p>
          <VaBadge :text="pickup.status.replace(/_/g, ' ')" size="large" />
        </div>
      </VaCardContent>
    </VaCard>

    <div class="flex gap-2 mt-4 mb-6">
      <VaButton
        v-if="userStore.isDriver && pickup.status === 'ASIGNADO_A_RECOLECTOR'"
        @click="updateStatus('EN_PROCESO_RECOLECCION')"
      >
        Iniciar Recolección
      </VaButton>
      <template v-if="userStore.isDriver && pickup.status === 'EN_PROCESO_RECOLECCION'">
        <RouterLink :to="{ name: 'pickup-scan-packages', params: { id: pickup.pickup_id } }">
          <VaButton icon="fa4-camera" color="primary" size="large">Escanear Paquetes</VaButton>
        </RouterLink>
        <VaButton color="warning" @click="updateStatus('RECOLECCION_FINALIZADA_DRIVER')">
          Finalizar Recolección
        </VaButton>
      </template>
      <VaButton
        v-if="userStore.isDriver && pickup.status === 'RECOLECCION_FINALIZADA_DRIVER'"
        :disabled="(pickup.ocrStats?.queued ?? 0) > 0 || (pickup.ocrStats?.processing ?? 0) > 0"
        @click="updateStatus('ENTREGADO_EN_ALMACEN')"
      >
        {{
          (pickup.ocrStats?.queued ?? 0) > 0 || (pickup.ocrStats?.processing ?? 0) > 0
            ? 'Procesando Paquetes...'
            : 'Marcar como Entregado en Almacén'
        }}
      </VaButton>
      <VaButton
        v-if="(userStore.isAdmin || userStore.isWarehouseStaff) && pickup.status === 'ENTREGADO_EN_ALMACEN'"
        color="success"
        @click="updateStatus('VERIFICADO_EN_ALMACEN')"
      >
        Verificar en Almacén
      </VaButton>
    </div>

    <VaCard>
      <VaCardTitle>Paquetes en la Recolección ({{ tableItems.length }})</VaCardTitle>
      <VaCardContent>
        <div class="package-table-wrapper">
          <VaDataTable :columns="packageColumns" :items="tableItems" :per-page="100" sticky-header>
            <template #cell(tracking_code)="{ rowData }">
              <span>{{ rowData.tracking_code }}</span>
            </template>
            <template #cell(status)="{ rowData, value }">
              <div class="flex flex-col gap-1 items-start">
                <span>{{ value }}</span>
                <VaBadge
                  v-if="rowData.has_multiple_labels"
                  text="🏷️ MÚLTIPLES ETIQUETAS"
                  color="info"
                  class="text-xs"
                />
              </div>
            </template>
            <template #cell(actions)="{ rowData }">
              <div class="flex gap-2 justify-end">
                <RouterLink
                  v-if="!rowData.is_ocr_pending"
                  :to="{ name: 'package-details', params: { id: rowData.package_id } }"
                >
                  <VaButton preset="primary" size="small" icon="fa4-eye" />
                </RouterLink>
                <VaButton v-else preset="secondary" size="small" icon="fa4-eye" disabled />

                <VaButton
                  v-if="userStore.isAdmin || userStore.isWarehouseStaff"
                  preset="primary"
                  size="small"
                  icon="fa4-edit"
                  aria-label="Verificar o Editar Paquete"
                  @click="openVerificationModal(rowData as Package)"
                >
                  Verificar / Editar
                </VaButton>
              </div>
            </template>
          </VaDataTable>
        </div>
      </VaCardContent>
    </VaCard>
  </div>

  <div v-else>
    <h1 class="page-title">Recolección no encontrada</h1>
  </div>

  <VaModal v-model="doShowVerificationModal" size="large" close-button hide-default-actions>
    <h1 class="va-h5 mb-4">Verificar Paquete: {{ packageToVerify?.tracking_code }}</h1>
    <PackageVerificationForm
      v-if="packageToVerify"
      :pkg="packageToVerify"
      @save="handleVerificationSave"
      @close="doShowVerificationModal = false"
    />
  </VaModal>

  <VaModal
    v-model="showOcrProcessingModal"
    :title="
      (pickup?.ocrStats?.queued ?? 0) > 0 || (pickup?.ocrStats?.processing ?? 0) > 0
        ? 'Procesamiento en Segundo Plano'
        : 'Atención Requerida'
    "
    close-button
    hide-default-actions
  >
    <div class="flex flex-col items-center p-4 gap-3 w-full">
      <!-- ICONO CENTRAL -->
      <VaIcon
        :name="
          (pickup?.ocrStats?.queued ?? 0) > 0 || (pickup?.ocrStats?.processing ?? 0) > 0
            ? 'fa4-hourglass-half'
            : 'fa4-exclamation-circle'
        "
        size="3.5rem"
        :color="(pickup?.ocrStats?.queued ?? 0) > 0 || (pickup?.ocrStats?.processing ?? 0) > 0 ? 'info' : 'warning'"
      />

      <!-- TITULO -->
      <h3 class="va-h6 text-center">
        {{
          (pickup?.ocrStats?.queued ?? 0) > 0 || (pickup?.ocrStats?.processing ?? 0) > 0
            ? 'Procesando paquetes con IA...'
            : 'Paquetes pendientes de revisión manual'
        }}
      </h3>

      <!-- PANEL DE STATS (cuando hay procesamiento activo) -->
      <template
        v-if="
          pickup?.ocrStats &&
          ((pickup.ocrStats.queued ?? 0) > 0 ||
            (pickup.ocrStats.processing ?? 0) > 0 ||
            (pickup.ocrStats.completed ?? 0) > 0)
        "
      >
        <div class="w-full bg-gray-50 rounded-lg p-3 text-sm">
          <!-- Barra de progreso -->
          <div class="flex justify-between text-xs text-gray-500 mb-1">
            <span>Progreso</span>
            <span>{{ pickup.ocrStats.completed }} / {{ pickup.ocrStats.total }} procesados</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2.5 mb-3">
            <div
              class="bg-blue-500 h-2.5 rounded-full transition-all duration-500"
              :style="{
                width:
                  pickup.ocrStats.total > 0
                    ? `${Math.round((pickup.ocrStats.completed / pickup.ocrStats.total) * 100)}%`
                    : '0%',
              }"
            ></div>
          </div>
          <!-- Contadores por estado -->
          <div class="grid grid-cols-2 gap-2">
            <div class="flex items-center gap-2 bg-blue-50 rounded p-2">
              <VaIcon name="fa4-hourglass-half" size="1.2rem" color="info" />
              <div>
                <p class="text-xs text-gray-500 font-semibold">En Cola</p>
                <p class="font-bold text-blue-700">{{ pickup.ocrStats.queued }}</p>
              </div>
            </div>
            <div class="flex items-center gap-2 bg-yellow-50 rounded p-2">
              <VaIcon name="fa4-refresh" spin size="1.2rem" color="warning" />
              <div>
                <p class="text-xs text-gray-500 font-semibold">Procesando</p>
                <p class="font-bold text-yellow-700">{{ pickup.ocrStats.processing }}</p>
              </div>
            </div>
            <div class="flex items-center gap-2 bg-green-50 rounded p-2">
              <VaIcon name="fa4-check-circle" size="1.2rem" color="success" />
              <div>
                <p class="text-xs text-gray-500 font-semibold">Completados</p>
                <p class="font-bold text-green-700">{{ pickup.ocrStats.completed }}</p>
              </div>
            </div>
            <div class="flex items-center gap-2 bg-red-50 rounded p-2">
              <VaIcon name="fa4-exclamation-triangle" size="1.2rem" color="danger" />
              <div>
                <p class="text-xs text-gray-500 font-semibold">Revisión Manual</p>
                <p class="font-bold text-red-700">{{ pickup.ocrStats.needs_review }}</p>
              </div>
            </div>
          </div>
        </div>
        <p class="text-xs text-gray-400 text-center">Se actualiza cada 5 segundos automáticamente</p>
      </template>

      <!-- MENSAJE SIMPLE SI SOLO HAY NEEDS_REVIEW -->
      <template v-else>
        <p class="text-center text-secondary">
          Hay <b>{{ pickup?.ocrStats?.needs_review ?? 0 }}</b> paquetes donde la lectura automática falló. <br />
          Requieren tu <b>revisión manual</b> para ser agregados correctamente.
        </p>
      </template>

      <VaButton color="primary" @click="handleOcrModalDismiss">Entendido</VaButton>
    </div>
  </VaModal>
</template>

<style scoped>
.page-title {
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 1rem;
}

/* Wrapper de la tabla con scroll */
.package-table-wrapper {
  width: 100%;
  max-height: 600px;
  overflow: auto;
  position: relative;
}

/* Estilos para móvil */
@media (max-width: 768px) {
  .package-table-wrapper {
    max-height: 500px;
  }
}

/* Mejorar el scroll */
.package-table-wrapper::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.package-table-wrapper::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 5px;
}

.package-table-wrapper::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 5px;
}

.package-table-wrapper::-webkit-scrollbar-thumb:hover {
  background: #555;
}

/* Para Firefox */
.package-table-wrapper {
  scrollbar-width: thin;
  scrollbar-color: #888 #f1f1f1;
}
</style>
