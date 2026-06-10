<script setup lang="ts">
import { ref } from 'vue'
import { useModal, useToast } from 'vuestic-ui'
import WarehousesTable from './widgets/WarehousesTable.vue'
import EditWarehouseForm from './widgets/EditWarehouseForm.vue'
import { Warehouse } from './types'
import { useWarehouses } from './composables/useWarehouses'

const { warehouses, isLoading, filters, sorting, pagination, remove, add, update } = useWarehouses()

const doShowModal = ref(false)
const warehouseToEdit = ref<Warehouse | null>(null)
const { init: notify } = useToast()

const showModal = (warehouse: Warehouse | null) => {
  warehouseToEdit.value = warehouse
  doShowModal.value = true
}

const onFormSave = async (payload: Omit<Warehouse, 'warehouse_id'>) => {
  doShowModal.value = false
  try {
    if (warehouseToEdit.value) {
      await update({ ...warehouseToEdit.value, ...payload })
      notify({ message: 'Almacén actualizado con éxito', color: 'success' })
    } else {
      await add(payload)
      notify({ message: 'Almacén creado con éxito', color: 'success' })
    }
  } catch (e: any) {
    notify({ message: e.message || 'Error al guardar el almacén', color: 'danger' })
  }
}

const onWarehouseDelete = async (warehouse: Warehouse) => {
  try {
    await remove(warehouse)
    notify({ message: `Almacén ${warehouse.warehouse_name} eliminado`, color: 'success' })
  } catch (e: any) {
    notify({ message: e.message || 'Error al eliminar el almacén', color: 'danger' })
  }
}
</script>

<template>
  <h1 class="page-title">Gestión de Almacenes</h1>
  <VaCard>
    <VaCardContent>
      <div class="flex flex-col md:flex-row gap-2 mb-2 justify-between">
        <div class="flex flex-col md:flex-row gap-2 justify-start">
          <VaInput v-model="filters.search" placeholder="Buscar por nombre o dirección...">
            <template #prependInner>
              <FontAwesomeIcon icon="search" style="color: #6c757d; font-size: 1rem; margin-right: 4px" />
            </template>
          </VaInput>
        </div>
        <VaButton @click="showModal(null)">Crear Almacén</VaButton>
      </div>

      <div class="table-wrapper">
        <WarehousesTable
          v-model:sort-by="sorting.sortBy"
          v-model:sorting-order="sorting.sortingOrder"
          :warehouses="warehouses"
          :loading="isLoading"
          :pagination="pagination"
          @editWarehouse="showModal"
          @deleteWarehouse="onWarehouseDelete"
        />
      </div>
    </VaCardContent>
  </VaCard>

  <VaModal v-model="doShowModal" size="medium" close-button hide-default-actions>
    <template #header>
      <h1 class="va-h5">{{ warehouseToEdit ? 'Editar' : 'Nuevo' }} Almacén</h1>
    </template>
    <EditWarehouseForm :warehouse="warehouseToEdit" @close="doShowModal = false" @save="onFormSave" />
  </VaModal>
</template>

<style scoped>
.page-title {
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 1rem;
}

/* Wrapper de la tabla con scroll */
.table-wrapper {
  width: 100%;
  max-height: 70vh;
  overflow: auto;
  position: relative;
}

/* Estilos para móvil */
@media (max-width: 768px) {
  .table-wrapper {
    max-height: 60vh;
  }
}

/* Mejorar el scroll */
.table-wrapper::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.table-wrapper::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 5px;
}

.table-wrapper::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 5px;
}

.table-wrapper::-webkit-scrollbar-thumb:hover {
  background: #555;
}

/* Para Firefox */
.table-wrapper {
  scrollbar-width: thin;
  scrollbar-color: #888 #f1f1f1;
}
</style>
