<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import api from '../../services/api'
import { useToast, defineVaDataTableColumns } from 'vuestic-ui'
import { Payout } from './types'
import { useUserStore } from '@/stores/user-store'
import DriverPaymentModal from './widgets/DriverPaymentModal.vue'

import { useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const { init: notify } = useToast()
const userStore = useUserStore()

const payout = ref<Payout | null>(null)
const isLoading = ref(true)
const showPaymentModal = ref(false)

const isAdmin = computed(() => userStore.user?.role === 'ADMIN')

const itemColumns = defineVaDataTableColumns([
  { label: 'Descripción', key: 'item_description', sortable: true },
  { label: 'Fecha', key: 'date', sortable: true },
  { label: 'Dirección', key: 'address', sortable: true },
  { label: 'Tracking', key: 'tracking_code', sortable: true },
  { label: 'Monto', key: 'amount', align: 'right', sortable: true },
])

const paymentColumns = defineVaDataTableColumns([
  { label: 'Fecha', key: 'payment_date', sortable: true },
  { label: 'Método', key: 'payment_method' },
  { label: 'Referencia', key: 'transaction_reference' },
  { label: 'Notas', key: 'notes' },
  { label: 'Monto', key: 'amount', align: 'right' },
])

const fetchData = async () => {
  isLoading.value = true
  try {
    const payoutId = route.params.id as string
    const { data } = await api.getPayoutById(payoutId)

    // Enriquecer items con datos del paquete/pickup
    if (data.payoutItems) {
      data.payoutItems = data.payoutItems.map((item: any) => ({
        ...item,
        address: item.package?.destination_address || item.pickup?.pickup_address || '-',
        tracking_code: item.package?.tracking_code || item.pickup?.pickup_code || '-',
        package_id: item.package?.package_id || null,
        date: item.package?.delivered_datetime || item.pickup?.pickup_scheduled_date || item.created_at,
      }))

      // Ordenar por fecha (más reciente arriba)
      data.payoutItems.sort((a: any, b: any) => {
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      })
    }

    payout.value = data
  } catch (error) {
    notify({ message: 'Error al cargar el detalle', color: 'danger' })
  } finally {
    isLoading.value = false
  }
}

onMounted(fetchData)

const totalPaid = computed(() => {
  if (!payout.value?.payments) return 0
  return payout.value.payments.reduce((sum, p) => sum + Number(p.amount), 0)
})

const balanceDue = computed(() => {
  if (!payout.value) return 0
  return Number(payout.value.total_amount) - totalPaid.value
})

const formatDate = (date: string) => (date ? new Date(date).toLocaleDateString('es-CL') : '-')
const formatCurrency = (val: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val)

const printVoucher = () => {
  const route = router.resolve({
    name: 'print-payout',
    params: { id: payout.value!.payout_id },
  })
  window.open(route.href, '_blank')
}
</script>

<template>
  <div v-if="isLoading" class="flex justify-center p-8">
    <VaProgressCircle indeterminate />
  </div>
  <div v-else-if="payout">
    <div class="flex justify-between items-center mb-4 hide-on-print">
      <h1 class="page-title mb-0">Detalle de Liquidación</h1>
      <div class="flex gap-2">
        <VaButton color="secondary" icon="print" @click="printVoucher"> Imprimir Voucher </VaButton>
        <VaButton v-if="isAdmin && balanceDue > 0" color="primary" @click="showPaymentModal = true">
          Registrar Pago
        </VaButton>
      </div>
    </div>

    <!-- Printable Header (hidden on screen) -->
    <div class="show-on-print-only mb-6">
      <div class="flex justify-between items-start">
        <div>
          <h1 class="text-2xl font-bold">Comprobante de Pago (Liquidación)</h1>
          <p class="text-xl">N° {{ payout.payout_id.slice(0, 8) }}</p>
        </div>
        <div class="text-right">
          <p class="font-bold">Leon Express</p>
          <p>Fecha: {{ formatDate(new Date().toISOString()) }}</p>
        </div>
      </div>
      <hr class="my-4" />
    </div>

    <VaCard class="mb-6 printable-section">
      <VaCardContent class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <p class="va-text-secondary">Conductor</p>
          <p class="va-h6">{{ payout.user?.full_name }}</p>
        </div>
        <div>
          <p class="va-text-secondary">Fecha de Liquidación</p>
          <p class="va-h6">{{ formatDate(payout.payout_date) }}</p>
        </div>
        <div>
          <p class="va-text-secondary">Total a Liquidar</p>
          <p class="va-h6">{{ formatCurrency(payout.total_amount) }}</p>
        </div>
      </VaCardContent>
    </VaCard>

    <!-- Table of Payments (Driver Payments) -->
    <VaCard v-if="payout.payments && payout.payments.length > 0" class="mb-6 printable-section">
      <VaCardTitle>Pagos Realizados ({{ formatCurrency(totalPaid) }})</VaCardTitle>
      <VaCardContent>
        <VaDataTable :columns="paymentColumns" :items="payout.payments">
          <template #cell(payment_date)="{ value }">{{ formatDate(value) }}</template>
          <template #cell(amount)="{ value }">{{ formatCurrency(Number(value)) }}</template>
        </VaDataTable>
      </VaCardContent>
    </VaCard>

    <VaCard class="printable-section">
      <VaCardTitle>Items Incluidos</VaCardTitle>
      <VaCardContent>
        <div class="table-container">
          <VaDataTable :columns="itemColumns" :items="payout.payoutItems || []" sticky-header hoverable striped>
            <template #cell(date)="{ value }">
              <span class="text-xs">{{ formatDate(value || '') }}</span>
            </template>

            <template #cell(address)="{ row }">
              <template v-if="row.rowData.package_id">
                <RouterLink
                  :to="{ name: 'package-details', params: { id: row.rowData.package_id } }"
                  class="text-primary hover:text-primary-dark underline hide-on-print"
                >
                  {{ row.rowData.address }}
                </RouterLink>
                <span class="show-on-print-only">{{ row.rowData.address }}</span>
              </template>
              <span v-else>{{ row.rowData.address }}</span>
            </template>

            <template #cell(amount)="{ value }">{{ formatCurrency(Number(value)) }}</template>
          </VaDataTable>
        </div>

        <div class="show-on-print-only mt-8 pt-4 border-t text-right">
          <p>Total Liquidación: {{ formatCurrency(payout.total_amount) }}</p>
          <p class="text-xl font-bold">Total Pagado: {{ formatCurrency(totalPaid) }}</p>
        </div>
      </VaCardContent>
    </VaCard>

    <!-- Signature for Voucher -->
    <div class="show-on-print-only mt-20 flex justify-around">
      <div class="text-center border-t border-black pt-2 w-48">Firma Leon Express</div>
      <div class="text-center border-t border-black pt-2 w-48">Firma Conductor</div>
    </div>
  </div>

  <DriverPaymentModal
    v-if="payout && isAdmin"
    :show="showPaymentModal"
    :payout-id="payout.payout_id"
    @close="showPaymentModal = false"
    @success="fetchData"
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

  .va-card {
    box-shadow: none !important;
    border: 1px solid #eee !important;
  }
}
</style>

<style scoped>
.page-title {
  font-size: 1.5rem;
  font-weight: bold;
}
.text-primary {
  color: var(--va-primary);
}
.text-primary:hover {
  filter: brightness(0.9);
}

.show-on-print-only {
  display: none;
}

@media print {
  .hide-on-print {
    display: none !important;
  }
  .show-on-print-only {
    display: block !important;
  }

  .printable-section {
    margin-bottom: 20px !important;
    break-inside: avoid;
  }

  .table-container {
    max-height: none !important;
    overflow: visible !important;
  }
}

.table-container {
  max-height: 600px;
  overflow-y: auto;
}
</style>
