<template>
  <div class="billing-administration">
    <VaCard class="mb-4">
      <VaCardTitle>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <VaIcon name="fa4-money-bill-wave" />
            <span>Administración Financiera</span>
          </div>
          <VaBadge
            :text="automationStatus.isActive ? 'Automatización Activa' : 'Automatización Inactiva'"
            :color="automationStatus.isActive ? 'success' : 'warning'"
          />
        </div>
      </VaCardTitle>
      <VaCardContent>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Estado del CRON -->
          <div class="p-4 bg-blue-50 rounded">
            <h3 class="text-lg font-semibold mb-2">🤖 Automatización</h3>
            <p class="text-sm">
              <strong>Estado:</strong> {{ automationStatus.isActive ? 'Activo ✅' : 'Inactivo ❌' }}
            </p>
            <p class="text-sm"><strong>Horario:</strong> {{ automationStatus.cronSchedule }}</p>
            <p class="text-sm"><strong>Zona Horaria:</strong> {{ automationStatus.timezone }}</p>
          </div>

          <!-- Período Actual -->
          <div class="p-4 bg-green-50 rounded">
            <h3 class="text-lg font-semibold mb-2">📅 Período Actual</h3>
            <template v-if="currentPeriod">
              <p class="text-sm"><strong>Semana:</strong> {{ currentPeriod.period_number }}</p>
              <p class="text-sm"><strong>Inicio:</strong> {{ formatDate(currentPeriod.start_date) }}</p>
              <p class="text-sm"><strong>Fin:</strong> {{ formatDate(currentPeriod.end_date) }}</p>
              <VaBadge
                :text="currentPeriod.status"
                :color="currentPeriod.status === 'ACTIVE' ? 'success' : 'secondary'"
              />
            </template>
            <p v-else class="text-sm text-gray-500">No hay período activo</p>
          </div>
        </div>
      </VaCardContent>
    </VaCard>

    <!-- Acciones Manuales -->
    <VaCard class="mb-4">
      <VaCardTitle>Acciones Manuales</VaCardTitle>
      <VaCardContent>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <!-- Inicializar Período -->
          <VaButton
            color="info"
            size="large"
            icon="fa4-calendar-plus"
            :disabled="isProcessing"
            :loading="isProcessing && currentAction === 'initialize'"
            class="w-full"
            @click="confirmAction('initialize')"
          >
            Inicializar Período
          </VaButton>

          <!-- Cerrar Período -->
          <VaButton
            color="primary"
            size="large"
            icon="fa4-calendar-check"
            :disabled="isProcessing"
            :loading="isProcessing && currentAction === 'close'"
            class="w-full"
            @click="confirmAction('close')"
          >
            Cerrar Período Actual
          </VaButton>

          <!-- Generar Facturas -->
          <VaButton
            color="success"
            size="large"
            icon="fa4-file-invoice-dollar"
            :disabled="isProcessing"
            :loading="isProcessing && currentAction === 'invoices'"
            class="w-full"
            @click="openDateRangeModal('invoices')"
          >
            Generar Facturas
          </VaButton>

          <!-- Generar Pagos -->
          <VaButton
            color="warning"
            size="large"
            icon="fa4-hand-holding-dollar"
            :disabled="isProcessing"
            :loading="isProcessing && currentAction === 'payouts'"
            class="w-full"
            @click="openDateRangeModal('payouts')"
          >
            Generar Pagos
          </VaButton>
        </div>
      </VaCardContent>
    </VaCard>

    <!-- Diagnóstico del Sistema -->
    <VaCard class="mb-4">
      <VaCardTitle>
        <div class="flex items-center justify-between">
          <span>🔍 Diagnóstico del Sistema</span>
          <VaButton size="small" :loading="isLoadingDiagnostics" @click="loadDiagnostics"> Actualizar </VaButton>
        </div>
      </VaCardTitle>
      <VaCardContent>
        <div v-if="diagnostics" class="space-y-4">
          <!-- Información del Período -->
          <div class="p-4 bg-gray-50 rounded">
            <h4 class="font-semibold mb-2">Período Actual</h4>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div>
                <p class="text-gray-600">Semana</p>
                <p class="font-medium">{{ diagnostics.currentPeriod.weekNumber }}</p>
              </div>
              <div>
                <p class="text-gray-600">Inicio</p>
                <p class="font-medium">{{ formatDate(diagnostics.currentPeriod.startDate) }}</p>
              </div>
              <div>
                <p class="text-gray-600">Fin</p>
                <p class="font-medium">{{ formatDate(diagnostics.currentPeriod.endDate) }}</p>
              </div>
              <div>
                <p class="text-gray-600">Estado</p>
                <VaBadge
                  :text="diagnostics.currentPeriod.exists ? diagnostics.currentPeriod.status || 'ACTIVE' : 'NO EXISTE'"
                  :color="
                    diagnostics.currentPeriod.status === 'CLOSED'
                      ? 'success'
                      : diagnostics.currentPeriod.exists
                        ? 'primary'
                        : 'warning'
                  "
                />
              </div>
            </div>
          </div>

          <!-- Items Pendientes -->
          <div class="p-4 bg-yellow-50 rounded">
            <h4 class="font-semibold mb-2">Items Pendientes de Procesar</h4>
            <div class="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p class="text-gray-600">Paquetes a Facturar</p>
                <p class="text-lg font-semibold text-orange-600">{{ diagnostics.pendingItems.packagesToInvoice }}</p>
              </div>
              <div>
                <p class="text-gray-600">Entregas a Pagar</p>
                <p class="text-lg font-semibold text-orange-600">{{ diagnostics.pendingItems.deliveriesToPay }}</p>
              </div>
              <div>
                <p class="text-gray-600">Recolecciones a Pagar</p>
                <p class="text-lg font-semibold text-orange-600">{{ diagnostics.pendingItems.pickupsToPay }}</p>
              </div>
            </div>
          </div>

          <!-- Información de Automatización -->
          <div class="p-4 bg-blue-50 rounded">
            <h4 class="font-semibold mb-2">Automatización</h4>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
              <div>
                <p class="text-gray-600">Estado</p>
                <VaBadge
                  :text="diagnostics.automation.isActive ? 'Activo' : 'Inactivo'"
                  :color="diagnostics.automation.isActive ? 'success' : 'danger'"
                />
              </div>
              <div>
                <p class="text-gray-600">Última Ejecución</p>
                <p class="font-medium">
                  {{
                    diagnostics.automation.lastExecution
                      ? formatDate(diagnostics.automation.lastExecution.created_at)
                      : 'Nunca'
                  }}
                </p>
              </div>
              <div>
                <p class="text-gray-600">Próxima Ejecución</p>
                <p class="font-medium">{{ formatDate(diagnostics.automation.nextExecution) }}</p>
              </div>
            </div>
          </div>

          <!-- Recomendaciones -->
          <div v-if="diagnostics.recommendations && diagnostics.recommendations.length > 0" class="space-y-2">
            <h4 class="font-semibold">Recomendaciones</h4>
            <VaAlert
              v-for="(rec, index) in diagnostics.recommendations"
              :key="index"
              :color="
                rec.type === 'error'
                  ? 'danger'
                  : rec.type === 'warning'
                    ? 'warning'
                    : rec.type === 'action'
                      ? 'info'
                      : 'info'
              "
              class="mb-2"
            >
              {{ rec.message }}
            </VaAlert>
          </div>
        </div>
        <div v-else class="text-center py-4">
          <VaProgressCircle indeterminate />
        </div>
      </VaCardContent>
    </VaCard>

    <!-- Último Cierre -->
    <VaCard v-if="lastClosure" class="mb-4">
      <VaCardTitle>📊 Último Cierre Realizado</VaCardTitle>
      <VaCardContent>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p class="text-sm text-gray-600">Período</p>
            <p class="text-lg font-semibold">
              {{ formatDate(lastClosure.start_date) }} - {{ formatDate(lastClosure.end_date) }}
            </p>
          </div>
          <div>
            <p class="text-sm text-gray-600">Facturas Generadas</p>
            <p class="text-lg font-semibold">{{ lastClosure.total_invoices }}</p>
          </div>
          <div>
            <p class="text-sm text-gray-600">Total Facturado</p>
            <p class="text-lg font-semibold">${{ formatNumber(lastClosure.total_invoiced) }}</p>
          </div>
          <div>
            <p class="text-sm text-gray-600">Pagos a Conductores</p>
            <p class="text-lg font-semibold">${{ formatNumber(lastClosure.total_paid_to_drivers) }}</p>
          </div>
        </div>
      </VaCardContent>
    </VaCard>

    <!-- Historial de Períodos -->
    <VaCard>
      <VaCardTitle>
        <div class="flex items-center justify-between">
          <span>Historial de Períodos</span>
          <VaButton size="small" @click="loadPeriods">Actualizar</VaButton>
        </div>
      </VaCardTitle>
      <VaCardContent>
        <div class="table-wrapper">
          <VaDataTable
            v-model:sort-column="sortByPeriods"
            v-model:sorting-order="sortingOrderPeriods"
            :items="periods"
            :columns="periodsColumns"
            :loading="isLoadingPeriods"
            :per-page="100"
            sticky-header
          >
            <template #cell(start_date)="{ rowData }">
              {{ formatDate(rowData.start_date) }}
            </template>
            <template #cell(end_date)="{ rowData }">
              {{ formatDate(rowData.end_date) }}
            </template>
            <template #cell(status)="{ rowData }">
              <VaBadge :text="rowData.status" :color="rowData.status === 'CLOSED' ? 'success' : 'primary'" />
            </template>
            <template #cell(total_invoiced)="{ rowData }"> ${{ formatNumber(rowData.total_invoiced) }} </template>
            <template #cell(total_paid_to_drivers)="{ rowData }">
              ${{ formatNumber(rowData.total_paid_to_drivers) }}
            </template>
            <template #cell(actions)="{ rowData }">
              <VaButton size="small" @click="viewPeriodDetails(rowData.period_id)"> Ver Detalles </VaButton>
            </template>
          </VaDataTable>
        </div>
      </VaCardContent>
    </VaCard>

    <!-- Modal de Detalles del Período -->
    <VaModal
      v-model="showDetailsModal"
      size="large"
      hide-default-actions
      :title="
        selectedPeriod
          ? `Detalles del Período ${selectedPeriod.period_number} (${formatDate(
              selectedPeriod.start_date,
            )} - ${formatDate(selectedPeriod.end_date)})`
          : 'Detalles del Período'
      "
    >
      <div v-if="isLoadingDetails" class="flex justify-center py-8">
        <VaProgressCircle indeterminate />
      </div>
      <div v-else-if="periodDetails">
        <VaTabs v-model="activeDetailTab" class="mb-4">
          <template #tabs>
            <VaTab name="invoices">Facturas de Clientes ({{ periodDetails.invoices.length }})</VaTab>
            <VaTab name="payouts">Pagos a Conductores ({{ periodDetails.payouts.length }})</VaTab>
          </template>
        </VaTabs>

        <div v-if="activeDetailTab === 'invoices'" class="detail-content">
          <VaDataTable
            :items="periodDetails.invoices"
            :columns="invoiceColumns"
            no-data-html="No hay facturas generadas en este período"
            sticky-header
          >
            <template #cell(invoice_date)="{ rowData }">
              {{ formatDate(rowData.invoice_date) }}
            </template>
            <template #cell(total_amount)="{ rowData }">
              <span class="font-bold">${{ formatNumber(rowData.total_amount) }}</span>
            </template>
            <template #cell(status)="{ rowData }">
              <VaBadge :text="rowData.status" :color="getInvoiceStatusColor(rowData.status)" />
            </template>
          </VaDataTable>
        </div>

        <div v-if="activeDetailTab === 'payouts'" class="detail-content">
          <VaDataTable
            :items="periodDetails.payouts"
            :columns="payoutColumns"
            no-data-html="No hay pagos generados en este período"
            sticky-header
          >
            <template #cell(payout_date)="{ rowData }">
              {{ formatDate(rowData.payout_date) }}
            </template>
            <template #cell(total_amount)="{ rowData }">
              <span class="font-bold">${{ formatNumber(rowData.total_amount) }}</span>
            </template>
            <template #cell(status)="{ rowData }">
              <VaBadge :text="rowData.status" :color="getPayoutStatusColor(rowData.status)" />
            </template>
          </VaDataTable>
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end mt-4">
          <VaButton @click="showDetailsModal = false">Cerrar</VaButton>
        </div>
      </template>
    </VaModal>

    <!-- Modal de Confirmación -->
    <VaModal
      v-model="showConfirmModal"
      title="Confirmar Acción"
      ok-text="Confirmar"
      cancel-text="Cancelar"
      @ok="executeAction"
    >
      <p>
        ¿Estás seguro que deseas <strong>{{ confirmMessage }}</strong
        >?
      </p>
      <p class="text-sm text-gray-600 mt-2">Esta acción generará facturas y pagos automáticamente.</p>
    </VaModal>

    <!-- Modal de Rango de Fechas -->
    <VaModal
      v-model="showDateRangeModal"
      title="Seleccionar Período"
      ok-text="Generar"
      cancel-text="Cancelar"
      @ok="executeAction"
    >
      <div class="flex flex-col gap-4">
        <VaDateInput v-model="dateRange.startDate" label="Fecha Inicio" />
        <VaDateInput v-model="dateRange.endDate" label="Fecha Fin" />
      </div>
    </VaModal>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useToast } from 'vuestic-ui'
import api from '@/services/api'

const { init: notify } = useToast()

// Estado
const automationStatus = ref({
  isActive: false,
  cronSchedule: '',
  timezone: '',
})
const currentPeriod = ref(null)
const lastClosure = ref(null)
const periods = ref([])
const isLoadingPeriods = ref(false)
const isProcessing = ref(false)
const currentAction = ref('')
const diagnostics = ref(null)
const isLoadingDiagnostics = ref(false)

// Detalles del período
const showDetailsModal = ref(false)
const isLoadingDetails = ref(false)
const selectedPeriod = ref(null)
const periodDetails = ref(null)
const activeDetailTab = ref('invoices')

// Modals
const showConfirmModal = ref(false)
const showDateRangeModal = ref(false)
const confirmMessage = ref('')
const dateRange = ref({
  startDate: null,
  endDate: null,
})

// Columnas de tablas
const periodsColumns = [
  { key: 'period_number', label: 'Semana', sortable: true },
  { key: 'start_date', label: 'Inicio', sortable: true },
  { key: 'end_date', label: 'Fin', sortable: true },
  { key: 'status', label: 'Estado', sortable: true },
  { key: 'total_invoices', label: 'Facturas', sortable: true },
  { key: 'total_invoiced', label: 'Total Facturado', sortable: true },
  { key: 'total_payouts', label: 'Pagos', sortable: true },
  { key: 'total_paid_to_drivers', label: 'Total Pagado', sortable: true },
  { key: 'actions', label: 'Acciones' },
]

const sortByPeriods = ref('start_date')
const sortingOrderPeriods = (ref < 'asc') | 'desc' | (null > 'desc')

const invoiceColumns = [
  { key: 'invoice_number', label: 'N° Factura', sortable: true },
  { key: 'client_name', label: 'Cliente', sortable: true },
  { key: 'invoice_date', label: 'Fecha', sortable: true },
  { key: 'total_amount', label: 'Monto', sortable: true },
  { key: 'status', label: 'Estado', sortable: true },
]

const payoutColumns = [
  { key: 'payout_number', label: 'N° Pago', sortable: true },
  { key: 'driver_name', label: 'Conductor', sortable: true },
  { key: 'payout_date', label: 'Fecha', sortable: true },
  { key: 'total_amount', label: 'Monto', sortable: true },
  { key: 'status', label: 'Estado', sortable: true },
]

// Funciones
async function loadStatus() {
  try {
    const response = await api.getBillingStatus()
    automationStatus.value = response.data.automation
    currentPeriod.value = response.data.currentPeriod
    lastClosure.value = response.data.lastClosure
  } catch (error) {
    console.error('Error al cargar estado:', error)
    // Notificar solo si es error crítico
  }
}

async function loadDiagnostics() {
  isLoadingDiagnostics.value = true
  try {
    const response = await api.getBillingDiagnostics()
    diagnostics.value = response.data.data
  } catch (error) {
    console.error('Error al cargar diagnóstico:', error)
  } finally {
    isLoadingDiagnostics.value = false
  }
}

async function loadPeriods() {
  isLoadingPeriods.value = true
  try {
    const response = await api.getBillingPeriods(20)
    periods.value = response.data.data
  } catch (error) {
    console.error('Error al cargar períodos:', error)
    notify({
      message: 'Error al cargar períodos',
      color: 'danger',
    })
  } finally {
    isLoadingPeriods.value = false
  }
}

// Funciones de acciones manuales
function confirmAction(action) {
  currentAction.value = action
  if (action === 'initialize') {
    confirmMessage.value = 'inicializar el período actual (crearlo si no existe)'
  } else if (action === 'close') {
    confirmMessage.value = 'cerrar el período semanal actual'
  }
  showConfirmModal.value = true
}

function openDateRangeModal(action) {
  currentAction.value = action
  // Sugerir período actual
  if (currentPeriod.value) {
    dateRange.value.startDate = new Date(currentPeriod.value.start_date)
    dateRange.value.endDate = new Date(currentPeriod.value.end_date)
  }
  showDateRangeModal.value = true
}

async function executeAction() {
  isProcessing.value = true

  try {
    let response

    if (currentAction.value === 'initialize') {
      response = await api.initializeBillingPeriod()
      notify({
        message: response.data.message || 'Período inicializado exitosamente',
        color: 'success',
      })
    } else if (currentAction.value === 'close') {
      response = await api.closeBillingPeriod()
      notify({
        message: 'Período cerrado exitosamente',
        color: 'success',
      })
    } else if (currentAction.value === 'invoices') {
      response = await api.generateInvoices(
        formatDateForAPI(dateRange.value.startDate),
        formatDateForAPI(dateRange.value.endDate),
      )
      notify({
        message: 'Facturas generadas exitosamente',
        color: 'success',
      })
    } else if (currentAction.value === 'payouts') {
      response = await api.generatePayouts(
        formatDateForAPI(dateRange.value.startDate),
        formatDateForAPI(dateRange.value.endDate),
      )
      notify({
        message: 'Pagos generados exitosamente',
        color: 'success',
      })
    }

    // Recargar datos
    await loadStatus()
    await loadPeriods()
    await loadDiagnostics()
  } catch (error) {
    console.error('Error al ejecutar acción:', error)
    notify({
      message: error.response?.data?.error || 'Error al ejecutar acción',
      color: 'danger',
    })
  } finally {
    isProcessing.value = false
    showConfirmModal.value = false
    showDateRangeModal.value = false
  }
}

// Nueva función para ver detalles
async function viewPeriodDetails(periodId) {
  selectedPeriod.value = periods.value.find((p) => p.period_id === periodId)
  showDetailsModal.value = true
  isLoadingDetails.value = true
  periodDetails.value = null // Resetear

  try {
    const response = await api.getBillingPeriod(periodId)
    periodDetails.value = response.data.data
  } catch (error) {
    console.error('Error al cargar detalles:', error)
    notify({
      message: 'Error al cargar detalles del período',
      color: 'danger',
    })
    showDetailsModal.value = false
  } finally {
    isLoadingDetails.value = false
  }
}

function getInvoiceStatusColor(status) {
  const colors = {
    DRAFT: 'secondary',
    ISSUED: 'primary',
    PAID: 'success',
    OVERDUE: 'danger',
    CANCELLED: 'gray',
  }
  return colors[status] || 'primary'
}

function getPayoutStatusColor(status) {
  const colors = {
    DRAFT: 'secondary',
    PENDING: 'warning',
    PAID: 'success',
    CANCELLED: 'gray',
  }
  return colors[status] || 'primary'
}

function formatDate(date) {
  if (!date) return '-'
  // Si es una cadena YYYY-MM-DD, la parseamos manualmente para evitar problemas de zona horaria
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    const [year, month, day] = date.split('T')[0].split('-')
    return `${day}-${month}-${year}`
  }
  return new Date(date).toLocaleDateString('es-CL')
}

function formatNumber(num) {
  return new Intl.NumberFormat('es-CL').format(num)
}

function formatDateForAPI(date) {
  if (!date) return null
  const d = new Date(date)
  return d.toISOString().split('T')[0] // YYYY-MM-DD
}

onMounted(async () => {
  await loadStatus()
  await loadPeriods()
  await loadDiagnostics()
})
</script>

<style scoped>
.billing-administration {
  padding: 1rem;
}

/* Wrapper de la tabla con scroll */
.table-wrapper {
  width: 100%;
  max-height: 60vh;
  overflow: auto;
  position: relative;
}

/* Estilos para móvil */
@media (max-width: 768px) {
  .table-wrapper {
    max-height: 50vh;
  }
}

/* Mejorar el scroll */
.table-wrapper::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.table-wrapper::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 5px;
}

.table-wrapper::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 5px;
}

.table-wrapper::-webkit-scrollbar-thumb:hover {
  background: #555;
}

/* Para Firefox */
.table-wrapper {
  scrollbar-width: thin;
  scrollbar-color: #888 #f1f1f1;
}
</style>
