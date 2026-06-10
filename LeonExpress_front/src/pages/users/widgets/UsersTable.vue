<script setup lang="ts">
import { defineVaDataTableColumns, useModal } from 'vuestic-ui'
import { User } from '../types'
import UserAvatar from './UserAvatar.vue'
import { PropType, computed } from 'vue'
import { Pagination, Sorting } from '../../../data/pages/users'
import { useVModel } from '@vueuse/core'

// --- INICIO DE LA CORRECCIÓN 1 ---
const columns = defineVaDataTableColumns([
  { label: 'NOMBRE COMPLETO', key: 'fullname', sortable: true },
  // { label: 'CORREO', key: 'email', sortable: true }, // Columna que faltaba
  // { label: 'USUARIO', key: 'username', sortable: true },
  { label: 'TELÉFONO', key: 'phone' },
  { label: 'ROL', key: 'role_name', sortable: true },
  { label: 'VEHICULO', key: 'vehicles' },
  { label: 'ALMACEN', key: 'warehouse_name' },
  { label: 'ESTADO', key: 'active' },
  { label: ' ', key: 'actions', align: 'right' },
])
// --- FIN DE LA CORRECCIÓN 1 ---

const props = defineProps({
  users: { type: Array as PropType<User[]>, required: true },
  loading: { type: Boolean, default: false },
  pagination: { type: Object as PropType<Pagination>, required: true },
  sortBy: { type: String as PropType<Sorting['sortBy']>, required: true },
  sortingOrder: { type: String as PropType<Sorting['sortingOrder']>, default: null },
})

const emit = defineEmits<{
  (event: 'edit-user', user: User): void
  (event: 'delete-user', user: User): void
  (event: 'update:sortBy', sortBy: Sorting['sortBy']): void
  (event: 'update:sortingOrder', sortingOrder: Sorting['sortingOrder']): void
  (event: 'reactivate-user', user: User): void
  (event: 'update:page', page: number): void
  (event: 'update:perPage', perPage: number): void
}>()

const sortByVModel = useVModel(props, 'sortBy', emit)
const sortingOrderVModel = useVModel(props, 'sortingOrder', emit)
const pageVModel = useVModel(props, 'pagination', emit, { key: 'page' })
const perPageVModel = useVModel(props, 'pagination', emit, { key: 'perPage' })

const roleColors: Record<string, string> = { ADMIN: 'danger', DRIVER: 'info' }
const totalPages = computed(() => Math.ceil(props.pagination.total / props.pagination.perPage))

const { confirm } = useModal()

const onUserDelete = async (user: User) => {
  const agreed = await confirm({
    title: 'Desactivar usuario',
    message: `¿Estás seguro de desactivar a ${user.fullname}?`,
    okText: 'Desactivar',
    cancelText: 'Cancelar',
    maxWidth: '380px',
  })
  if (agreed) emit('delete-user', user)
}
</script>

<template>
  <VaDataTable
    v-model:sort-by="sortByVModel"
    v-model:sorting-order="sortingOrderVModel"
    :columns="columns"
    :items="users"
    :loading="loading"
    :per-page="100"
    sticky-header
  >
    <template #cell(fullname)="{ rowData }">
      <div class="flex items-center gap-2">
        <UserAvatar :user="rowData as User" size="small" />
        <span>{{ rowData.fullname }}</span>
      </div>
    </template>

    <template #cell(role_name)="{ rowData }">
      <VaBadge :text="rowData.role_name" :color="roleColors[rowData.role_name] || 'secondary'" />
    </template>

    <template #cell(vehicles)="{ rowData }">
      <span v-if="rowData.vehicles && rowData.vehicles.length > 0">
        {{ rowData.vehicles[0].license_plate }}
      </span>
      <span v-else class="va-text-secondary">N/A</span>
    </template>

    <template #cell(warehouse_name)="{ rowData }">
      <span>{{ rowData.warehouse_name || 'N/A' }}</span>
    </template>

    <template #cell(active)="{ rowData }">
      <VaBadge :text="rowData.active ? 'Activo' : 'Inactivo'" :color="rowData.active ? 'success' : 'secondary'" />
    </template>
    <template #cell(actions)="{ rowData }">
      <div class="flex gap-2 justify-end">
        <VaButton
          preset="primary"
          size="small"
          icon="fa4-edit"
          aria-label="Editar usuario"
          @click="$emit('edit-user', rowData as User)"
        />

        <VaButton
          v-if="rowData.active"
          preset="primary"
          size="small"
          icon="fa4-power-off"
          color="danger"
          aria-label="Desactivar usuario"
          @click="onUserDelete(rowData as User)"
        />

        <VaButton
          v-else
          preset="primary"
          size="small"
          icon="fa4-power-off"
          color="success"
          aria-label="Reactivar usuario"
          @click="$emit('reactivate-user', rowData as User)"
        />
      </div>
    </template>
  </VaDataTable>

  <div class="flex flex-col-reverse md:flex-row gap-2 justify-between items-center py-2">
    <div>
      <b>{{ pagination.total }} resultados.</b>
      Resultados por página
      <VaSelect v-model="pagination.perPage" class="!w-20" :options="[10, 50, 100]" />
    </div>
  </div>
</template>
