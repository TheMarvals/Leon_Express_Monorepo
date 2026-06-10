<script setup lang="ts">
import { defineVaDataTableColumns, useModal } from 'vuestic-ui'
import { Warehouse } from '../types'
import { PropType } from 'vue'

const columns = defineVaDataTableColumns([
  { label: 'NOMBRE', key: 'warehouse_name', sortable: true },
  { label: 'DIRECCIÓN', key: 'address', sortable: true },
  { label: ' ', key: 'actions', align: 'right' },
])

defineProps({
  warehouses: { type: Array as PropType<Warehouse[]>, required: true },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits<{
  (event: 'edit-warehouse', warehouse: Warehouse): void
  (event: 'delete-warehouse', warehouse: Warehouse): void
}>()

const { confirm } = useModal()

const onWarehouseDelete = async (warehouse: Warehouse) => {
  const agreed = await confirm({
    title: 'Eliminar Almacén',
    message: `¿Estás seguro de eliminar el almacén ${warehouse.warehouse_name}? Esta acción no se puede deshacer.`,
    okText: 'Eliminar',
    cancelText: 'Cancelar',
    okButtonProps: { color: 'danger' },
  })
  if (agreed) emit('delete-warehouse', warehouse)
}
</script>

<template>
  <VaDataTable :columns="columns" :items="warehouses" :loading="loading" :per-page="100" sticky-header>
    <template #cell(actions)="{ rowData }">
      <div class="flex gap-2 justify-end">
        <VaButton
          preset="primary"
          size="small"
          icon="fa4-edit"
          aria-label="Editar almacén"
          @click="$emit('edit-warehouse', rowData as Warehouse)"
        />
        <VaButton
          preset="primary"
          size="small"
          icon="fa4-trash"
          color="danger"
          aria-label="Eliminar almacén"
          @click="onWarehouseDelete(rowData as Warehouse)"
        />
      </div>
    </template>
  </VaDataTable>
</template>
