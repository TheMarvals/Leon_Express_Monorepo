<script setup lang="ts">
import { ref } from 'vue'
import { useModal, useToast } from 'vuestic-ui'
import VehiclesTable from './widgets/VehiclesTable.vue' // Necesitarás crear este componente
import EditVehicleForm from './widgets/EditVehicleForm.vue'
import { Vehicle } from './types'
import { useVehicles } from './composables/useVehicles'

const { vehicles, isLoading, filters, sorting, pagination, remove, add, update } = useVehicles()

const doShowModal = ref(false)
const vehicleToEdit = ref<Vehicle | null>(null)
const { init: notify } = useToast()

const showModal = (vehicle: Vehicle | null) => {
  vehicleToEdit.value = vehicle
  doShowModal.value = true
}

const onFormSave = async (payload: Omit<Vehicle, 'vehicle_id'>) => {
  doShowModal.value = false
  try {
    if (vehicleToEdit.value) {
      await update({ ...vehicleToEdit.value, ...payload })
      notify({ message: 'Vehículo actualizado', color: 'success' })
    } else {
      await add(payload)
      notify({ message: 'Vehículo creado', color: 'success' })
    }
  } catch (e: any) {
    notify({ message: e.message || 'Error al guardar el vehículo', color: 'danger' })
  }
}

const onVehicleDelete = async (vehicle: Vehicle) => {
  try {
    await remove(vehicle)
    notify({ message: `Vehículo ${vehicle.license_plate} eliminado`, color: 'success' })
  } catch (e: any) {
    notify({ message: e.message || 'Error al eliminar', color: 'danger' })
  }
}
</script>

<template>
  <h1 class="page-title">Gestión de Vehículos</h1>
  <VaCard>
    <VaCardContent>
      <div class="flex flex-col md:flex-row gap-2 mb-2 justify-between">
        <div class="flex flex-col md:flex-row gap-2 justify-start">
          <!-- <VaButtonToggle
            v-model="filters.isActive"
            color="background-element"
            border-color="background-element"
            :options="[
              { label: 'Todos', value: undefined },
              { label: 'Activos', value: true },
              { label: 'Inactivos', value: false },
            ]"
          /> -->
          <VaInput v-model="filters.search" placeholder="Buscar por patente">
            <template #prependInner>
              <FontAwesomeIcon icon="search" style="color: #6c757d; font-size: 1rem; margin-right: 4px" />
            </template>
          </VaInput>
        </div>
        <VaButton @click="showModal(null)">Añadir Vehículo</VaButton>
      </div>

      <div class="table-wrapper">
        <VehiclesTable
          v-model:sort-by="sorting.sortBy"
          v-model:sorting-order="sorting.sortingOrder"
          :vehicles="vehicles"
          :loading="isLoading"
          :pagination="pagination"
          @editVehicle="showModal"
          @deleteVehicle="onVehicleDelete"
        />
      </div>
    </VaCardContent>
  </VaCard>

  <VaModal v-model="doShowModal" size="small" close-button hide-default-actions>
    <h1 class="va-h5">{{ vehicleToEdit ? 'Editar' : 'Nuevo' }} Vehículo</h1>
    <EditVehicleForm :vehicle="vehicleToEdit" @close="doShowModal = false" @save="onFormSave" />
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
