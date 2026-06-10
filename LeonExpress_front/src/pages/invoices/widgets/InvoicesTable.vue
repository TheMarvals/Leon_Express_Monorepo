<script setup lang="ts">
import { defineVaDataTableColumns, useToast } from 'vuestic-ui'
import { PropType, ref } from 'vue'
import { Invoice } from '../types'
import { useInvoices } from '../composables/useInvoices'

defineProps({
  invoices: { type: Array as PropType<Invoice[]>, required: true },
  loading: { type: Boolean, default: false },
})

const { updateStatus } = useInvoices()
const { init: notify } = useToast()

const statuses = ['PENDIENTE', 'PAGADA', 'VENCIDA', 'CANCELADA']

const statusColors: Record<string, string> = {
  PENDIENTE: 'warning',
  PAGADA: 'success',
  VENCIDA: 'danger',
  CANCELADA: 'secondary',
}

const columns = defineVaDataTableColumns([
  { label: 'Cliente', key: 'client.client_name', sortable: true },
  { label: 'Nº Factura', key: 'invoice_number', sortable: true },
  { label: 'Fecha Emisión', key: 'invoice_date', sortable: true },
  { label: 'Monto Total', key: 'total_amount', sortable: true, align: 'right' },
  { label: 'Estado', key: 'status' },
  { label: ' ', key: 'actions', align: 'right' },
])

const sortBy = ref('invoice_date')
const sortingOrder = ref<'asc' | 'desc' | null>('desc')

import PaymentModal from './PaymentModal.vue'

const showPaymentModal = ref(false)
const selectedInvoiceId = ref<string | null>(null)

const handleStatusChange = async (invoice: Invoice, newStatus: any) => {
  if (newStatus === 'PAGADA') {
    selectedInvoiceId.value = invoice.invoice_id
    showPaymentModal.value = true
    // El pago se registrará desde el modal, solo cambiar el estado local si el pago es exitoso
    return
  }
  try {
    await updateStatus(invoice, newStatus)
    notify({ message: 'Estado de la factura actualizado', color: 'success' })
  } catch (e: any) {
    notify({ message: e.message || 'Error al actualizar estado', color: 'danger' })
  }
}

const formatDate = (date: string) => new Date(date).toLocaleDateString('es-CL')
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
    <template #cell(total_amount)="{ value }"
      ><strong>{{ formatCurrency(Number(value)) }}</strong></template
    >
    <template #cell(status)="{ rowData }">
      <VaSelect
        v-model="rowData.status"
        :options="statuses"
        :color="statusColors[rowData.status]"
        class="w-48"
        @update:modelValue="(newStatus) => handleStatusChange(rowData as Invoice, newStatus)"
      />
    </template>
    <template #cell(actions)="{ rowData }">
      <VaButton preset="primary" size="small" :to="{ name: 'invoice-details', params: { id: rowData.invoice_id } }">
        Ver Detalles
      </VaButton>
    </template>
  </VaDataTable>

  <PaymentModal
    v-if="showPaymentModal && selectedInvoiceId"
    :invoice-id="selectedInvoiceId"
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
