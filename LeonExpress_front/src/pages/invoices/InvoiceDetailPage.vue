<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useToast, defineVaDataTableColumns } from 'vuestic-ui'
import api from '../../services/api' // Asumo que tienes un servicio api centralizado
import { Invoice } from './types'
import PaymentModal from './widgets/PaymentModal.vue'

import { useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const { init: notify } = useToast()

const invoice = ref<Invoice | null>(null)
const isLoading = ref(true)
const itemsPerPage = ref(50)
const currentPage = ref(1)

const itemColumns = defineVaDataTableColumns([
  { label: 'Descripción', key: 'description' },
  { label: 'Tracking', key: 'package.tracking_code' },
  { label: 'Tracking Externo', key: 'package.external_tracking_code' },
  { label: 'Cantidad', key: 'quantity', align: 'right' },
  { label: 'Precio Unit.', key: 'unit_price', align: 'right' },
  { label: 'Total', key: 'amount', align: 'right' },
])

const paymentColumns = defineVaDataTableColumns([
  { label: 'Fecha de Pago', key: 'payment_date' },
  { label: 'Método', key: 'payment_method' },
  { label: 'Referencia', key: 'transaction_reference' },
  { label: 'Notas', key: 'notes' },
  { label: 'Monto', key: 'amount', align: 'right' },
])

const fetchInvoiceDetails = async () => {
  isLoading.value = true
  try {
    const invoiceId = route.params.id as string
    const { data } = await api.getInvoiceById(invoiceId)
    invoice.value = data
  } catch (error) {
    notify({ message: 'Error al cargar el detalle de la factura', color: 'danger' })
  } finally {
    isLoading.value = false
  }
}

onMounted(fetchInvoiceDetails)

const totalPaid = computed(() => {
  if (!invoice.value?.payments) return 0
  return invoice.value.payments.reduce((sum, p) => sum + p.amount, 0)
})

const balanceDue = computed(() => {
  if (!invoice.value) return 0
  return invoice.value.total_amount - totalPaid.value
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
const showFreePickupModal = ref(false)

const formatDate = (date: string) => new Date(date).toLocaleDateString('es-CL')
const formatCurrency = (val: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val)

const registerPayment = () => {
  showPaymentModal.value = true
}

const printInvoice = () => {
  const route = router.resolve({
    name: 'print-invoice',
    params: { id: invoice.value!.invoice_id },
  })
  window.open(route.href, '_blank')
}
</script>

<template>
  <div v-if="isLoading" class="flex justify-center p-8">
    <VaProgressCircle indeterminate />
  </div>
  <div v-else-if="invoice">
    <h1 class="page-title">Detalle de Factura #{{ invoice.invoice_number }}</h1>

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
        <div class="flex justify-between items-center w-full">
          <span>Pagos Realizados ({{ formatCurrency(balanceDue) }} pendiente)</span>
          <div class="flex gap-2">
            <VaButton color="secondary" icon="print" @click="printInvoice"> Imprimir / PDF </VaButton>
            <VaButton v-if="balanceDue > 0" color="primary" size="small" @click="registerPayment">
              Registrar Pago
            </VaButton>
          </div>
        </div>
      </VaCardTitle>
      <VaCardContent>
        <VaDataTable :columns="paymentColumns" :items="invoice.payments || []">
          <template #cell(amount)="{ value }">{{ formatCurrency(Number(value)) }}</template>
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

  <!-- Payment Modal -->
  <PaymentModal
    v-if="invoice"
    :show="showPaymentModal"
    :invoice-id="invoice.invoice_id"
    @close="showPaymentModal = false"
    @success="fetchInvoiceDetails"
  />
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
