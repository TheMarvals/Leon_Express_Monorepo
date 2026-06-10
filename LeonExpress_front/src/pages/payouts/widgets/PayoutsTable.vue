<script setup lang="ts">
import { defineVaDataTableColumns, useToast } from 'vuestic-ui'
import { PropType, computed, ref } from 'vue'
import { Payout } from '../types'
import { usePayouts } from '../../payouts/composables/usePayouts'
import { useUserStore } from '@/stores/user-store'

defineProps({
  payouts: { type: Array as PropType<Payout[]>, required: true },
  loading: { type: Boolean, default: false },
})

const { updateStatus } = usePayouts()
const { init: notify } = useToast()

const userStore = useUserStore()
const isDriver = computed(() => userStore.isDriver)

const statuses = ['PENDIENTE', 'PAGADO', 'CANCELADO']

const statusColors: Record<string, string> = {
  PENDIENTE: 'warning',
  PAGADO: 'success',
  CANCELADO: 'danger',
}

const columns = defineVaDataTableColumns([
  { label: 'Conductor', key: 'user.full_name', sortable: true },
  { label: 'Fecha de Pago', key: 'payout_date', sortable: true },
  { label: 'Monto Total', key: 'total_amount', sortable: true, align: 'right' },
  { label: 'Estado', key: 'status' },
  { label: ' ', key: 'actions', align: 'right' },
])

const sortBy = ref('payout_date')
const sortingOrder = ref<'asc' | 'desc' | null>('desc')

const handleStatusChange = async (payout: Payout, newStatus: any) => {
  try {
    await updateStatus(payout, newStatus)
    notify({ message: 'Estado actualizado', color: 'success' })
  } catch (e: any) {
    notify({ message: e.message || 'Error al actualizar', color: 'danger' })
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
    :items="payouts"
    :loading="loading"
    sticky-header
    height="65vh"
  >
    <template #cell(payout_date)="{ value }">{{ formatDate(value) }}</template>
    <template #cell(total_amount)="{ value }"
      ><strong>{{ formatCurrency(Number(value)) }}</strong></template
    >
    <template #cell(status)="{ rowData }">
      <VaSelect
        v-model="rowData.status"
        :options="statuses"
        :disabled="isDriver"
        :color="statusColors[rowData.status]"
        class="w-48"
        @update:modelValue="(newStatus) => handleStatusChange(rowData as Payout, newStatus)"
      />
    </template>
    <template #cell(actions)="{ rowData }">
      <VaButton preset="primary" size="small" :to="{ name: 'payout-details', params: { id: rowData.payout_id } }">
        Ver Detalles
      </VaButton>
    </template>
  </VaDataTable>
</template>
