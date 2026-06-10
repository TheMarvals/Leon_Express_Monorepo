<script setup lang="ts">
import { defineVaDataTableColumns, useToast, useColors } from 'vuestic-ui'
import { Pickup } from '../types'
import { PropType, computed } from 'vue'

import { useUserStore } from '@/stores/user-store'

defineProps({
  pickups: { type: Array as PropType<Pickup[]>, required: true },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits<{
  (event: 'edit-pickup', pickup: Pickup): void
  (event: 'delete-pickup', pickup: Pickup): void
}>()

const { init: notify } = useToast()
const { getColor } = useColors()

const userStore = useUserStore()
const isDriver = computed(() => userStore.isDriver)
const isAdmin = computed(() => userStore.isAdmin)

const statusColors: Record<string, string> = {
  ASIGNADO_A_RECOLECTOR: 'secondary',
  EN_PROCESO_RECOLECCION: 'info',
  RECOLECCION_FINALIZADA_DRIVER: 'primary',
  ENTREGADO_EN_ALMACEN: 'warning',
  VERIFICADO_EN_ALMACEN: 'success',
  CANCELADO: 'danger',
}

const columns = defineVaDataTableColumns([
  { label: 'CLIENTE', key: 'client.client_name', sortable: true },
  { label: 'CONDUCTOR', key: 'user.full_name', sortable: true },
  { label: 'FECHA PROGRAMADA', key: 'pickup_scheduled_date', sortable: true },
  { label: 'ESTADO', key: 'status', sortable: true },
  { label: ' ', key: 'actions', align: 'right' },
])

const formatDate = (dateString: string) => new Date(dateString).toLocaleString('es-CL')
</script>

<template>
  <VaDataTable :columns="columns" :items="pickups" :loading="loading" :per-page="100" sticky-header>
    <template #cell(pickup_scheduled_date)="{ value }">
      {{ formatDate(value) }}
    </template>

    <template #cell(status)="{ rowData }">
      <div class="flex items-center">
        <span class="va-text-bold" :style="{ color: getColor(statusColors[rowData.status] || 'secondary') }">
          {{ rowData.status }}
        </span>
      </div>
    </template>

    <template #cell(actions)="{ rowData }">
      <div class="flex gap-2 justify-end">
        <RouterLink :to="{ name: 'pickup-details', params: { id: rowData.pickup_id } }">
          <VaButton preset="primary" size="small" icon="fa4-eye" aria-label="Ver detalles" />
        </RouterLink>
        <VaButton
          preset="primary"
          size="small"
          icon="fa4-edit"
          :disabled="isDriver"
          @click="$emit('edit-pickup', rowData as Pickup)"
        />
        <VaButton
          v-if="isAdmin"
          preset="primary"
          color="danger"
          size="small"
          icon="fa4-trash"
          @click="$emit('delete-pickup', rowData as Pickup)"
        />
      </div>
    </template>
  </VaDataTable>
</template>
