<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast, defineVaDataTableColumns } from 'vuestic-ui'
import api from '../../services/api'
import { Invoice } from './types'
import PaymentModal from './widgets/PaymentModal.vue'
import { useUserStore } from '@/stores/user-store'

const route = useRoute()
const router = useRouter()
const { init: notify } = useToast()
const userStore = useUserStore()
const isClient = computed(() => userStore.isClient)

const invoice = ref<Invoice | null>(null)
const isLoading = ref(true)
const itemsPerPage = ref(50)
const currentPage = ref(1)

const statusColors: Record<string, string> = {
  PENDIENTE: 'warning',
  EN_REVISION: 'info',
  PAGADA: 'success',
  VENCIDA: 'danger',
  CANCELADA: 'secondary',
}

const statusLabels: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EN_REVISION: 'En Revisión',
  PAGADA: 'Pagada',
  VENCIDA: 'Vencida',
  CANCELADA: 'Cancelada',
}

const itemColumns = defineVaDataTableColumns([
  { label: 'Descripción', key: 'description' },
  { label: 'Tracking', key: 'package.tracking_code' },
  { label: 'Tracking Externo', key: 'package.external_tracking_code' },
  { label: 'Cantidad', key: 'quantity', align: 'right' },
  { label: 'Precio Unit.', key: 'unit_price', align: 'right' },
  { label: 'Total', key: 'amount', align: 'right' },
])

const paymentColumns = computed(() => {
  const cols = [
    { label: 'Fecha de Pago', key: 'payment_date' },
    { label: 'Método', key: 'payment_method' },
    { label: 'Referencia', key: 'transaction_reference' },
    { label: 'Comprobante', key: 'receipt_url' },
    { label: 'Estado', key: 'status' },
    { label: 'Notas', key: 'notes' },
    { label: 'Monto', key: 'amount', align: 'right' },
  ]
  if (!isClient.value) {
    cols.push({ label: 'Acciones', key: 'actions', align: 'right' })
  }
  return defineVaDataTableColumns(cols)
})

const fetchInvoiceDetails = async () => {
  isLoading.value = true
  try {
    const invoiceId = route.params.id as string
    const { data } = await api.getInvoiceById(invoiceId)
    invoice.value = data
  } catch (error: any) {
    notify({
      message: error.response?.data?.error || 'Error al cargar el detalle de la factura',
      color: 'danger',
    })
  } finally {
    isLoading.value = false
  }
}

onMounted(fetchInvoiceDetails)

const totalPaid = computed(() => {
  if (!invoice.value?.payments) return 0
  return invoice.value.payments
    .filter((p: any) => !p.status || p.status === 'APROBADO')
    .reduce((sum: number, p: any) => sum + Number(p.amount), 0)
})

const pendingReviewAmount = computed(() => {
  if (!invoice.value?.payments) return 0
  return invoice.value.payments
    .filter((p: any) => p.status === 'PENDIENTE_APROBACION')
    .reduce((sum: number, p: any) => sum + Number(p.amount), 0)
})

const balanceDue = computed(() => {
  if (!invoice.value) return 0
  return Math.max(0, invoice.value.total_amount - totalPaid.value)
})

const uniquePackageCount = computed(() => {
  if (!invoice.value?.invoiceItems) return 0
  const codes = new Set()
  invoice.value.invoiceItems.forEach((item) => {
    if (item.package?.tracking_code) {
      codes.add(item.package.tracking_code)
    }
  })
  return codes.size
})

const invoiceSummary = computed(() => {
  if (!invoice.value?.invoiceItems) return { gross: 0, codCredits: 0, codCount: 0 }

  let gross = 0
  let codCredits = 0
  const codPackages = new Set()

  invoice.value.invoiceItems.forEach((item: any) => {
    const amount = Number(item.amount || 0)
    const desc = (item.description || '').toLowerCase()

    if (amount > 0) {
      gross += amount
    } else if (/\bcod\b/.test(desc)) {
      codCredits += Math.abs(amount)
      if (item.package?.tracking_code) {
        codPackages.add(item.package.tracking_code)
      }
    }
  })

  return {
    gross,
    codCredits,
    codCount: codPackages.size,
  }
})

const showPaymentModal = ref(false)
const processingPaymentId = ref<string | null>(null)
const showRejectModal = ref(false)
const rejectingPayment = ref<any>(null)
const rejectReason = ref('')

const formatDate = (date: string) => {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('es-CL')
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val)

const normalizeReceiptUrl = (url?: string) => {
  if (!url) return ''
  let cleaned = url.replace(/^\/app\/uploads/, '/uploads')
  if (!cleaned.startsWith('/uploads')) {
    if (!cleaned.startsWith('/')) cleaned = '/' + cleaned
    if (!cleaned.startsWith('/uploads')) cleaned = '/uploads' + cleaned
  }
  return cleaned
}

const paymentStatusColor = (status?: string) => {
  switch (status) {
    case 'PENDIENTE_APROBACION':
      return 'warning'
    case 'APROBADO':
      return 'success'
    case 'RECHAZADO':
      return 'danger'
    default:
      return 'success'
  }
}

const paymentStatusLabel = (status?: string) => {
  switch (status) {
    case 'PENDIENTE_APROBACION':
      return 'Pendiente de Revisión'
    case 'APROBADO':
      return 'Aprobado'
    case 'RECHAZADO':
      return 'Rechazado'
    default:
      return 'Aprobado'
  }
}

const registerPayment = () => {
  showPaymentModal.value = true
}

const approvePayment = async (p: any) => {
  if (!invoice.value) return
  processingPaymentId.value = p.payment_id
  try {
    const { data } = await api.approveInvoicePayment(invoice.value.invoice_id, p.payment_id)
    notify({ message: data.message || 'Pago aprobado exitosamente', color: 'success' })
    await fetchInvoiceDetails()
  } catch (error: any) {
    notify({
      message: error.response?.data?.error || 'Error al aprobar pago',
      color: 'danger',
    })
  } finally {
    processingPaymentId.value = null
  }
}

const openRejectModal = (p: any) => {
  rejectingPayment.value = p
  rejectReason.value = ''
  showRejectModal.value = true
}

const confirmRejectPayment = async () => {
  if (!invoice.value || !rejectingPayment.value) return
  if (!rejectReason.value.trim()) {
    notify({ message: 'Debe ingresar el motivo de rechazo', color: 'warning' })
    return
  }
  processingPaymentId.value = rejectingPayment.value.payment_id
  try {
    const { data } = await api.rejectInvoicePayment(
      invoice.value.invoice_id,
      rejectingPayment.value.payment_id,
      rejectReason.value.trim(),
    )
    notify({ message: data.message || 'Pago rechazado', color: 'info' })
    showRejectModal.value = false
    await fetchInvoiceDetails()
  } catch (error: any) {
    notify({
      message: error.response?.data?.error || 'Error al rechazar pago',
      color: 'danger',
    })
  } finally {
    processingPaymentId.value = null
  }
}

const printInvoice = () => {
  const routeResolved = router.resolve({
    name: 'print-invoice',
    params: { id: invoice.value!.invoice_id },
  })
  window.open(routeResolved.href, '_blank')
}
</script>

<template>
  <div v-if="isLoading" class="flex justify-center p-8">
    <VaProgressCircle indeterminate />
  </div>
  <div v-else-if="invoice">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
      <div>
        <h1 class="page-title mb-1">Detalle de Factura #{{ invoice.invoice_number }}</h1>
        <p class="text-sm text-gray-500">ID: {{ invoice.invoice_id }}</p>
      </div>
      <div>
        <VaBadge
          :color="statusColors[invoice.status] || 'secondary'"
          :text="statusLabels[invoice.status] || invoice.status"
        />
      </div>
    </div>

    <VaCard class="mb-6">
      <VaCardContent class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div>
          <p class="va-text-secondary text-xs uppercase">Cliente</p>
          <p class="font-bold">{{ invoice.client?.client_name }}</p>
        </div>
        <div>
          <p class="va-text-secondary text-xs uppercase">Fecha Emisión</p>
          <p class="font-bold">{{ formatDate(invoice.invoice_date) }}</p>
        </div>
        <div>
          <p class="va-text-secondary text-xs uppercase">Fecha Vencimiento</p>
          <p class="font-bold">{{ formatDate(invoice.due_date) }}</p>
        </div>
        <div>
          <p class="va-text-secondary text-xs uppercase">Paquetes</p>
          <p class="font-bold">{{ uniquePackageCount }}</p>
        </div>
        <div v-if="invoiceSummary.codCount > 0">
          <p class="va-text-secondary text-xs uppercase">Créditos COD</p>
          <p class="font-bold text-success">
            {{ invoiceSummary.codCount }} pqts ({{ formatCurrency(invoiceSummary.codCredits) }})
          </p>
        </div>
        <div>
          <p class="va-text-secondary text-xs uppercase">Monto Total</p>
          <p class="va-h6 mb-0">{{ formatCurrency(invoice.total_amount) }}</p>
        </div>
      </VaCardContent>
    </VaCard>

    <VaCard class="mb-6">
      <VaCardTitle>
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center w-full gap-2">
          <div>
            <span>Pagos Realizados</span>
            <span class="text-sm text-gray-500 ml-2">
              ({{ formatCurrency(balanceDue) }} pendiente
              <template v-if="pendingReviewAmount > 0">
                - {{ formatCurrency(pendingReviewAmount) }} en revisión
              </template>
              )
            </span>
          </div>
          <div class="flex gap-2">
            <VaButton color="secondary" icon="print" @click="printInvoice"> Imprimir / PDF </VaButton>
            <VaButton
              v-if="balanceDue > 0 && invoice.status !== 'CANCELADA'"
              color="primary"
              size="small"
              :icon="isClient ? 'upload_file' : 'add'"
              @click="registerPayment"
            >
              {{ isClient ? 'Informar Pago' : 'Registrar Pago' }}
            </VaButton>
          </div>
        </div>
      </VaCardTitle>
      <VaCardContent>
        <VaDataTable :columns="paymentColumns" :items="invoice.payments || []">
          <template #cell(payment_date)="{ value }">{{ formatDate(value) }}</template>

          <template #cell(receipt_url)="{ value }">
            <VaButton
              v-if="value"
              preset="secondary"
              size="small"
              icon="visibility"
              :href="normalizeReceiptUrl(value)"
              target="_blank"
            >
              Ver Comprobante
            </VaButton>
            <span v-else class="text-gray-400 text-xs">Sin comprobante</span>
          </template>

          <template #cell(status)="{ value, rowData }">
            <div>
              <VaBadge :color="paymentStatusColor(value)" :text="paymentStatusLabel(value)" />
              <div v-if="value === 'RECHAZADO' && rowData.rejection_reason" class="text-xs text-danger mt-1">
                Motivo: {{ rowData.rejection_reason }}
              </div>
            </div>
          </template>

          <template #cell(amount)="{ value }">
            <strong>{{ formatCurrency(Number(value)) }}</strong>
          </template>

          <template #cell(actions)="{ rowData }">
            <div v-if="rowData.status === 'PENDIENTE_APROBACION'" class="flex items-center gap-1 justify-end">
              <VaButton
                preset="primary"
                color="success"
                size="small"
                icon="check"
                :loading="processingPaymentId === rowData.payment_id"
                @click="approvePayment(rowData)"
              >
                Aprobar
              </VaButton>
              <VaButton
                preset="secondary"
                color="danger"
                size="small"
                icon="close"
                :disabled="processingPaymentId === rowData.payment_id"
                @click="openRejectModal(rowData)"
              >
                Rechazar
              </VaButton>
            </div>
          </template>
        </VaDataTable>
      </VaCardContent>
    </VaCard>

    <VaCard>
      <VaCardTitle>
        <div class="flex justify-between items-center w-full">
          <span>Paquetes ({{ uniquePackageCount }})</span>
          <VaPagination
            v-if="(invoice.invoiceItems?.length || 0) > itemsPerPage"
            v-model="currentPage"
            :pages="Math.ceil((invoice.invoiceItems?.length || 0) / itemsPerPage)"
            :visible-pages="5"
            size="small"
            class="justify-end"
          />
        </div>
      </VaCardTitle>
      <VaCardContent>
        <div class="table-container">
          <VaDataTable
            :columns="itemColumns"
            :items="invoice.invoiceItems || []"
            :per-page="itemsPerPage"
            :current-page="currentPage"
            class="invoice-table"
            hoverable
            striped
            sticky-header
          >
            <template #cell(unit_price)="{ value }">{{ formatCurrency(Number(value)) }}</template>
            <template #cell(amount)="{ value }">{{ formatCurrency(Number(value)) }}</template>
            <template #cell(package.external_tracking_code)="{ value }">
              <span v-if="value">{{ value }}</span>
              <span v-else class="text-gray-400">-</span>
            </template>
          </VaDataTable>
        </div>
      </VaCardContent>
    </VaCard>
  </div>
  <div v-else>
    <VaAlert color="danger" class="p-4"> No se pudo cargar la información de la factura. </VaAlert>
  </div>

  <!-- Modal de Pago / Subida de Comprobante -->
  <PaymentModal
    v-if="invoice"
    :show="showPaymentModal"
    :invoice-id="invoice.invoice_id"
    :invoice-number="invoice.invoice_number"
    :default-amount="balanceDue"
    @close="showPaymentModal = false"
    @success="fetchInvoiceDetails"
  />

  <!-- Modal de Rechazo de Comprobante -->
  <VaModal
    v-model="showRejectModal"
    title="Rechazar Comprobante de Pago"
    hide-default-actions
    size="small"
  >
    <div class="space-y-4">
      <p class="text-sm text-gray-600">
        Indica el motivo por el cual se rechaza el comprobante de pago presentado por el cliente.
      </p>
      <VaInput
        v-model="rejectReason"
        label="Motivo del Rechazo"
        type="textarea"
        :rows="3"
        placeholder="Ej: El monto en la transferencia no coincide con el registrado / Comprobante ilegible"
        required
      />
      <div class="flex justify-end gap-2 pt-2">
        <VaButton preset="secondary" @click="showRejectModal = false">Cancelar</VaButton>
        <VaButton
          preset="primary"
          color="danger"
          :loading="processingPaymentId !== null"
          @click="confirmRejectPayment"
        >
          Confirmar Rechazo
        </VaButton>
      </div>
    </div>
  </VaModal>
</template>

<style>
@media print {
  /* HIDE EVERYTHING GLOBALLY BY TARGETING ALL VUESTIC LAYOUT SLOTS */
  .va-layout__top,
  .va-layout__left,
  .va-layout__right,
  .va-layout__bottom,
  .va-navbar,
  .va-sidebar,
  .hide-on-print,
  button,
  .va-button {
    display: none !important;
  }

  /* Reset layout constraints and force content visibility */
  .va-layout,
  .va-layout__content,
  .va-layout__page {
    padding: 0 !important;
    margin: 0 !important;
    display: block !important;
    width: 100% !important;
    height: auto !important;
    overflow: visible !important;
  }

  body {
    background: white !important;
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
  }

  /* Force the printable content to take full width and be at the top */
  .printable-content {
    box-shadow: none !important;
    border: none !important;
    width: 100% !important;
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    margin: 0 !important;
    padding: 20px !important;
    visibility: visible !important;
  }
}
</style>

<style scoped>
.page-title {
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 1rem;
}

.color-primary {
  color: #154ec1; /* Color azul corporativo */
}

.gray-text {
  color: #666;
}

.show-on-print-only {
  display: none;
}

.client-info-box {
  border: 1px solid #e2e8f0;
  border-left: 4px solid #154ec1;
}

@media print {
  .show-on-print-only {
    display: block !important;
  }

  .invoice-header {
    margin-bottom: 40px;
    border-bottom: 2px solid #f1f5f9;
    padding-bottom: 20px;
  }

  .invoice-table {
    margin-top: 20px;
  }

  :deep(.va-data-table__table-thead) {
    background-color: #f8fafc !important;
    border-bottom: 2px solid #e2e8f0;
  }

  :deep(.va-data-table__table-tr) {
    border-bottom: 1px solid #f1f5f9;
  }
}

.table-container {
  max-height: 600px;
  overflow-y: auto;
  /* Ensure header sticks inside this container if using Vuestic specific classes */
}
</style>
