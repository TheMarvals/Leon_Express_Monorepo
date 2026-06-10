<script setup lang="ts">
import { defineVaDataTableColumns, useModal } from 'vuestic-ui'
import { Route } from '../types'
import { PropType, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useUserStore } from '../../../stores/user-store'

const columns = defineVaDataTableColumns([
  { label: 'CONDUCTOR', key: 'user', sortable: true },
  { label: 'VEHÍCULO', key: 'vehicle', sortable: true },
  { label: 'ALMACÉN', key: 'warehouse', sortable: true },
  { label: 'FECHA DE INICIO', key: 'start_date', sortable: true },
  { label: 'ESTADO', key: 'status', sortable: true },
  { label: ' ', key: 'actions', align: 'right' },
])

defineProps({
  routes: { type: Array as PropType<Route[]>, required: true },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits<{
  (event: 'edit-route', route: Route): void
  (event: 'delete-route', route: Route): void
}>()

const userStore = useUserStore()
const isDriver = computed(() => userStore.isDriver)

const { confirm } = useModal()

const onRouteDelete = async (route: Route) => {
  const agreed = await confirm({
    title: 'Eliminar Ruta',
    message: `¿Estás seguro de eliminar esta ruta? La acción no se puede deshacer.`,
    okText: 'Eliminar',
    cancelText: 'Cancelar',
  })
  if (agreed) emit('delete-route', route)
}

const statusColors: Record<string, string> = {
  PENDIENTE: 'info',
  EN_PROGRESO: 'primary',
  FINALIZADA: 'success',
  CANCELADA: 'secondary',
}

const formatDate = (dateString: string | Date) => {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleString('es-CL')
}
</script>

<template>
  <VaDataTable :columns="columns" :items="routes" :loading="loading" :per-page="100" sticky-header>
    <template #cell(user)="{ rowData }">
      <span>{{ rowData.user?.full_name || 'N/A' }}</span>
    </template>
    <template #cell(vehicle)="{ rowData }">
      <span>{{ rowData.vehicle?.license_plate || 'N/A' }}</span>
    </template>
    <template #cell(warehouse)="{ rowData }">
      <span>{{ rowData.warehouse?.warehouse_name || 'N/A' }}</span>
    </template>
    <template #cell(start_date)="{ value }">
      <span>{{ formatDate(value) }}</span>
    </template>
    <template #cell(status)="{ value, rowData }">
      <div class="flex items-center gap-2">
        <VaBadge :text="value.replace(/_/g, ' ')" :color="statusColors[value] || 'secondary'" />
        <VaIcon
          v-if="(rowData.pending_returns_count || 0) > 0"
          name="fa4-warning"
          color="warning"
          :title="`Esta ruta tiene ${rowData.pending_returns_count} paquete(s) pendiente(s) de devolución física`"
        />
      </div>
    </template>

    <template #cell(actions)="{ rowData }">
      <div class="flex gap-2 justify-end">
        <RouterLink :to="{ name: 'route-details', params: { id: rowData.route_id } }">
          <VaButton preset="primary" size="small" icon="fa4-eye" aria-label="Ver detalles" />
        </RouterLink>
        <VaButton
          v-if="!isDriver"
          preset="primary"
          size="small"
          icon="fa4-edit"
          aria-label="Editar ruta"
          @click="$emit('edit-route', rowData as Route)"
        />
        <VaButton
          v-if="!isDriver"
          preset="primary"
          size="small"
          icon="fa4-trash"
          color="danger"
          aria-label="Eliminar ruta"
          @click="onRouteDelete(rowData as Route)"
        />
      </div>
    </template>
  </VaDataTable>
</template>
