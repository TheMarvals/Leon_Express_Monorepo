<script setup lang="ts">
import { defineVaDataTableColumns, useColors } from 'vuestic-ui'
import { Pickup } from '../types'
import { PropType, computed } from 'vue'
import { useRouter } from 'vue-router'

import { useUserStore } from '@/stores/user-store'

defineProps({
  pickups: { type: Array as PropType<Pickup[]>, required: true },
  loading: { type: Boolean, default: false },
})

defineEmits<{
  (event: 'edit-pickup', pickup: Pickup): void
  (event: 'delete-pickup', pickup: Pickup): void
}>()

const { getColor } = useColors()
const router = useRouter()

const goToPickupDetails = (event: any) => {
  const id = event?.item?.pickup_id
  if (id) {
    router.push({ name: 'pickup-details', params: { id } })
  }
}

const userStore = useUserStore()
const canEdit = computed(() => userStore.isAdmin || userStore.isWarehouseStaff)
const isAdmin = computed(() => userStore.isAdmin)

const statusColors: Record<string, string> = {
  SOLICITADA: 'warning',
  ASIGNADO_A_RECOLECTOR: 'secondary',
  EN_PROCESO_RECOLECCION: 'info',
  RECOLECCION_FINALIZADA_DRIVER: 'primary',
  ENTREGADO_EN_ALMACEN: 'warning',
  VERIFICADO_EN_ALMACEN: 'success',
  CANCELADO: 'danger',
}

const statusLabels: Record<string, string> = {
  SOLICITADA: 'Solicitada',
  ASIGNADO_A_RECOLECTOR: 'Conductor asignado',
  EN_PROCESO_RECOLECCION: 'Recolección en curso',
  RECOLECCION_FINALIZADA_DRIVER: 'Recolectada',
  ENTREGADO_EN_ALMACEN: 'Entregada en almacén',
  VERIFICADO_EN_ALMACEN: 'Verificada en almacén',
  CANCELADO: 'Cancelada',
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
  <VaDataTable
    :columns="columns"
    :items="pickups"
    :loading="loading"
    :per-page="100"
    no-data-html="No hay colectas para mostrar."
    hoverable
    class="cursor-pointer"
    sticky-header
    @row:click="goToPickupDetails"
  >
    <template #[`cell(client.client_name)`]="{ rowData }">
      <div class="flex items-center gap-2">
        <span class="font-bold text-gray-800">{{ rowData.client?.client_name || 'N/A' }}</span>
        <RouterLink
          :to="{ name: 'pickup-details', params: { id: rowData.pickup_id } }"
          class="inline-flex"
          @click.stop
        >
          <VaButton preset="primary" size="small" icon="fa4-eye" title="Ver recolección" />
        </RouterLink>
      </div>
    </template>
    <template #[`cell(user.full_name)`]="{ rowData }">
      {{ rowData.user?.full_name || 'Pendiente de asignación' }}
    </template>
    <template #cell(pickup_scheduled_date)="{ value }">
      {{ formatDate(value) }}
    </template>

    <template #cell(status)="{ rowData }">
      <div class="flex items-center">
        <span class="va-text-bold" :style="{ color: getColor(statusColors[rowData.status] || 'secondary') }">
          {{ statusLabels[rowData.status] || rowData.status }}
        </span>
      </div>
    </template>

    <template #cell(actions)="{ rowData }">
      <div class="flex gap-2 justify-end" @click.stop>
        <RouterLink :to="{ name: 'pickup-details', params: { id: rowData.pickup_id } }">
          <VaButton preset="primary" size="small" icon="fa4-eye" aria-label="Ver detalles" />
        </RouterLink>
        <VaButton
          v-if="canEdit"
          preset="primary"
          size="small"
          icon="fa4-edit"
          aria-label="Editar recolección"
          @click.stop="$emit('edit-pickup', rowData as Pickup)"
        />
        <VaButton
          v-if="isAdmin"
          preset="primary"
          color="danger"
          size="small"
          icon="fa4-trash"
          @click.stop="$emit('delete-pickup', rowData as Pickup)"
        />
      </div>
    </template>
  </VaDataTable>
</template>
