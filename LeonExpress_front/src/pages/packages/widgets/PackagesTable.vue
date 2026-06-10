<script setup lang="ts">
import { defineVaDataTableColumns, useModal } from 'vuestic-ui'
import { Package } from '../types'
import { PropType } from 'vue'
import { RouterLink } from 'vue-router'
import { useUserStore } from '../../../stores/user-store'

const userStore = useUserStore()

const columns = defineVaDataTableColumns([
  { label: 'CÓDIGO DE SEGUIMIENTO', key: 'tracking_code', sortable: true },
  { label: 'CLIENTE', key: 'client', sortable: true },
  { label: 'DESTINATARIO', key: 'recipient_name', sortable: true },
  { label: 'ESTADO', key: 'status', sortable: true },
  { label: ' ', key: 'actions', align: 'right' },
])

defineProps({
  packages: { type: Array as PropType<Package[]>, required: true },
  loading: { type: Boolean, default: false },
  pagination: { type: Object as PropType<{ page: number; perPage: number; total: number }>, required: true },
})

const emit = defineEmits<{
  (event: 'edit-package', pkg: Package): void
  (event: 'delete-package', pkg: Package): void
  (event: 'open-change-modal', pkg: Package): void
  (event: 'confirm-reception', packageId: string): void
}>()

const { confirm } = useModal()

const onPackageDelete = async (pkg: Package) => {
  const agreed = await confirm({
    title: 'Eliminar Paquete',
    message: `¿Estás seguro de eliminar el paquete ${pkg.tracking_code}? Esta acción no se puede deshacer.`,
    okText: 'Eliminar',
    cancelText: 'Cancelar',
  })
  if (agreed) emit('delete-package', pkg)
}

// Colores para los diferentes estados de los paquetes
const statusColors: Record<string, string> = {
  RECOLECTADO_EN_ORIGEN: 'info',
  RECIBIDO_EN_ALMACEN: 'primary',
  ASIGNADO_A_RUTA: 'warning',
  ENTREGADO: 'success',
  INCIDENCIA_ENTREGA: 'danger',
  CANCELADO: 'secondary',
  DEVUELTO_A_CLIENTE: 'danger',
}
</script>

<template>
  <VaDataTable :columns="columns" :items="packages" :loading="loading" :per-page="pagination.perPage" sticky-header>
    <template #cell(tracking_code)="{ rowData }">
      <span>{{ rowData.tracking_code }}</span>
    </template>
    <template #cell(client)="{ rowData }">
      <span>{{ rowData.client?.client_name || 'N/A' }}</span>
    </template>
    <template #cell(status)="{ value, rowData }">
      <div class="flex flex-col gap-1">
        <VaBadge
          :text="value === 'DEVUELTO_A_CLIENTE' ? 'DEVUELTO AL CLIENTE' : value.replace(/_/g, ' ')"
          :color="statusColors[value] || 'secondary'"
        />
        <!-- Badge para múltiples etiquetas -->
        <VaBadge v-if="rowData.has_multiple_labels" text="🏷️ MÚLTIPLES ETIQUETAS" color="info" class="text-xs" />

        <!-- Badge para cambios -->
        <div v-if="rowData.is_change" class="flex flex-col gap-1">
          <VaBadge
            v-if="!rowData.change_received"
            text="🔄 CAMBIO PENDIENTE"
            color="warning"
            class="text-xs cursor-pointer hover:opacity-80 transition-opacity"
            @click="$emit('open-change-modal', rowData as Package)"
          />
          <VaBadge
            v-else
            :text="`✅ CAMBIO RECIBIDO`"
            color="success"
            class="text-xs cursor-pointer hover:opacity-80 transition-opacity"
            @click="$emit('open-change-modal', rowData as Package)"
          />
        </div>

        <!-- Badge para pendiente de devolución física -->
        <template v-if="rowData.pending_return_user_id">
          <VaBadge
            color="warning"
            :text="'📦 Pendiente entrega física: ' + (rowData.pendingReturnDriver?.full_name || 'Conductor')"
            class="text-xs mt-1"
          />
          <VaButton
            v-if="userStore.isAdmin || userStore.isWarehouseStaff"
            size="small"
            preset="secondary"
            color="primary"
            class="mt-1"
            @click.stop="$emit('confirm-reception', rowData.package_id)"
          >
            Confirmar Recepción
          </VaButton>
        </template>
      </div>
    </template>
    <template #cell(actions)="{ rowData }">
      <div class="flex gap-2 justify-end">
        <RouterLink :to="{ name: 'package-details', params: { id: rowData.package_id } }">
          <VaButton preset="primary" size="small" icon="fa4-eye" aria-label="Ver detalles" />
        </RouterLink>
        <VaButton
          preset="primary"
          size="small"
          icon="fa4-edit"
          aria-label="Editar paquete"
          @click="$emit('edit-package', rowData as Package)"
        />
        <VaButton
          v-if="userStore.isAdmin"
          preset="primary"
          size="small"
          icon="fa4-trash"
          color="danger"
          aria-label="Eliminar paquete"
          @click="onPackageDelete(rowData as Package)"
        />
      </div>
    </template>
  </VaDataTable>
</template>
