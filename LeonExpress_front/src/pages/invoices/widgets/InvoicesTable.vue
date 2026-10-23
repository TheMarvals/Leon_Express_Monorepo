<script setup lang="ts">
import { defineVaDataTableColumns, useToast } from 'vuestic-ui'
import { PropType, ref, computed } from 'vue'
import { Invoice } from '../types'
import { useInvoices } from '../composables/useInvoices'
import { useUserStore } from '@/stores/user-store'
import PaymentModal from './PaymentModal.vue'

defineProps({
  invoices: { type: Array as PropType<Invoice[]>, required: true },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['refresh'])

const { updateStatus } = useInvoices()
const { init: notify } = useToast()
const userStore = useUserStore()
const isClient = computed(() => userStore.isClient)

const statuses = ['PENDIENTE', 'EN_REVISION', 'PAGADA', 'VENCIDA', 'CANCELADA']

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

const columns = computed(() => {
  const cols = []
  if (!isClient.value) {
    cols.push({ label: 'Cliente', key: 'client.client_name', sortable: true })
  }
  cols.push(
    { label: 'Nº Factura', key: 'invoice_number', sortable: true },
    { label: 'Fecha Emisión', key: 'invoice_date', sortable: true },
    { label: 'Monto Total', key: 'total_amount', sortable: true, align: 'right' },
    { label: 'Estado', key: 'status' },
    { label: 'Acciones', key: 'actions', align: 'right' },
  )
  return defineVaDataTableColumns(cols)
})

const sortBy = ref('invoice_date')
const sortingOrder = ref<'asc' | 'desc' | null>('desc')

const showPaymentModal = ref(false)
const selectedInvoice = ref<Invoice | null>(null)

const openPaymentModal = (invoice: Invoice) => {
  selectedInvoice.value = invoice
  showPaymentModal.value = true
}

const handleStatusChange = async (invoice: Invoice, newStatus: any) => {
  if (isClient.value) {
    return
  }

  if (newStatus === 'PAGADA') {
    openPaymentModal(invoice)
    return
  }

  try {
    await updateStatus(invoice, newStatus)
    notify({ message: 'Estado de la factura actualizado', color: 'success' })
    emit('refresh')
  } catch (e: any) {
    notify({ message: e.message || 'Error al actualizar estado', color: 'danger' })
  }
}

const formatDate = (date: string) => {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('es-CL')
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val)
</script>

<template>
  <VaDataTable
    v-model:sort-column="sortBy"
    v-model:sorting-order="sortingOrder"
    :columns="columns"
    :items="invoices"
    :loading="loading"
    sticky-header
    height="65vh"
  >
    <template #cell(invoice_date)="{ value }">{{ formatDate(value) }}</template>
    <template #cell(total_amount)="{ value }">
      <strong>{{ formatCurrency(Number(value)) }}</strong>
    </template>

    <template #cell(status)="{ rowData }">
      <!-- Si es cliente: solo badge de lectura, nunca editable -->
      <VaBadge
        v-if="isClient"
        :color="statusColors[rowData.status] || 'secondary'"
        :text="statusLabels[rowData.status] || rowData.status"
      />
      <!-- Si es admin / finanzas: selector de cambio de estado -->
      <VaSelect
        v-else
        v-model="rowData.status"
        :options="statuses"
        :color="statusColors[rowData.status]"
        class="w-48"
        @update:modelValue="(newStatus) => handleStatusChange(rowData as Invoice, newStatus)"
      />
    </template>

    <template #cell(actions)="{ rowData }">
      <div class="flex items-center justify-end gap-2">
        <VaButton
          v-if="(rowData.status === 'PENDIENTE' || rowData.status === 'VENCIDA') && isClient"
          preset="secondary"
          size="small"
          icon="upload_file"
          @click="openPaymentModal(rowData as Invoice)"
        >
          Informar Pago
        </VaButton>

        <VaButton preset="primary" size="small" :to="{ name: 'invoice-details', params: { id: rowData.invoice_id } }">
          Ver Detalles
        </VaButton>
      </div>
    </template>
  </VaDataTable>

  <PaymentModal
    v-if="showPaymentModal && selectedInvoice"
    :invoice-id="selectedInvoice.invoice_id"
    :invoice-number="selectedInvoice.invoice_number"
    :default-amount="Number(selectedInvoice.total_amount)"
    :show="showPaymentModal"
    @close="showPaymentModal = false"
    @success="
      () => {
        showPaymentModal = false
        $emit('refresh')
      }
    "
  />
</template>
