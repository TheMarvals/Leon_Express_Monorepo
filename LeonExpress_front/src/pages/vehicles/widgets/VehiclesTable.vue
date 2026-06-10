<script setup lang="ts">
import { defineVaDataTableColumns, useModal } from 'vuestic-ui'
import { Vehicle } from '../types'
import { PropType, computed } from 'vue'
import { Pagination, Sorting } from '../../../data/pages/clients' // Puedes reutilizar estos tipos
import { useVModel } from '@vueuse/core'

const columns = defineVaDataTableColumns([
  { label: 'PATENTE', key: 'license_plate', sortable: true },
  { label: 'TIPO DE VEHÍCULO', key: 'vehicleType', sortable: true },
  { label: 'CONDUCTOR ASIGNADO', key: 'user', sortable: true },
  { label: ' ', key: 'actions', align: 'right' },
])

const props = defineProps({
  vehicles: { type: Array as PropType<Vehicle[]>, required: true },
  loading: { type: Boolean, default: false },
  pagination: { type: Object as PropType<Pagination>, required: true },
  sortBy: { type: String as PropType<Sorting['sortBy']>, required: true },
  sortingOrder: { type: String as PropType<Sorting['sortingOrder']>, default: null },
})

const emit = defineEmits<{
  (event: 'edit-vehicle', vehicle: Vehicle): void
  (event: 'delete-vehicle', vehicle: Vehicle): void
  (event: 'update:sortBy', sortBy: Sorting['sortBy']): void
  (event: 'update:sortingOrder', sortingOrder: Sorting['sortingOrder']): void
  (event: 'update:pagination', pagination: Pagination): void
}>()

const sortByVModel = useVModel(props, 'sortBy', emit)
const sortingOrderVModel = useVModel(props, 'sortingOrder', emit)
const pageVModel = useVModel(props, 'pagination', emit, { key: 'page' })
const perPageVModel = useVModel(props, 'pagination', emit, { key: 'perPage' })

const totalPages = computed(() => Math.ceil(props.pagination.total / props.pagination.perPage))
const { confirm } = useModal()

const onVehicleDelete = async (vehicle: Vehicle) => {
  const agreed = await confirm({
    title: 'Eliminar Vehículo',
    message: `¿Estás seguro de eliminar el vehículo con patente ${vehicle.license_plate}?`,
    okText: 'Eliminar',
    cancelText: 'Cancelar',
    maxWidth: '450px',
  })

  if (agreed) {
    emit('delete-vehicle', vehicle)
  }
}
</script>

<template>
  <div>
    <VaDataTable
      v-model:sort-by="sortByVModel"
      v-model:sorting-order="sortingOrderVModel"
      :columns="columns"
      :items="vehicles"
      :loading="loading"
      :per-page="100"
      sticky-header
    >
      <template #cell(vehicleType)="{ rowData }">
        <span>{{ rowData.vehicleType?.type_name || 'N/A' }}</span>
      </template>

      <template #cell(user)="{ rowData }">
        <span v-if="rowData.user">{{ rowData.user.full_name }}</span>
        <VaBadge v-else text="Sin asignar" color="secondary" />
      </template>

      <template #cell(actions)="{ rowData }">
        <div class="flex gap-2 justify-end">
          <VaButton preset="primary" size="small" icon="fa4-edit" @click="$emit('edit-vehicle', rowData as Vehicle)" />
          <VaButton
            preset="primary"
            size="small"
            icon="fa4-trash"
            color="danger"
            @click="onVehicleDelete(rowData as Vehicle)"
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
  </div>
</template>
