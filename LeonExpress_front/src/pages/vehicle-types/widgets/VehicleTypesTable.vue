<script setup lang="ts">
import { defineVaDataTableColumns, useModal } from 'vuestic-ui'
import { VehicleType } from '../types'
import { PropType, computed } from 'vue'
import { Pagination } from '../../../data/pages/clients'
import { useVModel } from '@vueuse/core'

const columns = defineVaDataTableColumns([
  { label: 'Nombre del Tipo', key: 'type_name', sortable: true },
  { label: 'Costo Base de Entrega', key: 'base_delivery_cost', sortable: true },
  { label: ' ', key: 'actions', align: 'right' },
])

const props = defineProps({
  vehicleTypes: { type: Array as PropType<VehicleType[]>, required: true },
  loading: { type: Boolean, default: false },
  pagination: { type: Object as PropType<Pagination>, required: true },
})

const emit = defineEmits<{
  (event: 'edit-type', vehicleType: VehicleType): void
  (event: 'delete-type', vehicleType: VehicleType): void
  // Se define el evento para actualizar la paginación
  (event: 'update:pagination', pagination: Pagination): void
}>()

const { confirm } = useModal()

// --- CORRECCIÓN: Se usan v-models para manejar la paginación ---
const pageVModel = useVModel(props, 'pagination', emit, { key: 'page' })
const perPageVModel = useVModel(props, 'pagination', emit, { key: 'perPage' })
const totalPages = computed(() => Math.ceil(props.pagination.total / props.pagination.perPage))

const onTypeDelete = async (vehicleType: VehicleType) => {
  const agreed = await confirm({
    title: 'Eliminar Tipo de Vehículo',
    message: `¿Estás seguro de eliminar "${vehicleType.type_name}"?`,
    okText: 'Eliminar',
    cancelText: 'Cancelar',
    maxWidth: '380px',
  })

  if (agreed) {
    emit('delete-type', vehicleType)
  }
}
</script>

<template>
  <div>
    <VaDataTable :columns="columns" :items="vehicleTypes" :loading="loading">
      <template #cell(base_delivery_cost)="{ value }"> ${{ value }} </template>

      <template #cell(actions)="{ rowData }">
        <div class="flex gap-2 justify-end">
          <VaButton preset="primary" size="small" icon="fa4-edit" @click="$emit('edit-type', rowData as VehicleType)" />
          <VaButton
            preset="primary"
            size="small"
            icon="fa4-trash"
            color="danger"
            @click="onTypeDelete(rowData as VehicleType)"
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
