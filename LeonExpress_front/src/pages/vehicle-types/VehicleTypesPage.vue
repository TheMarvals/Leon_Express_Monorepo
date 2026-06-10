<script setup lang="ts">
import { ref } from 'vue'
import { useModal, useToast } from 'vuestic-ui'
import VehicleTypesTable from './widgets/VehicleTypesTable.vue'
import EditVehicleTypeForm from './widgets/EditVehicleTypeForm.vue'
import { VehicleType } from './types'
import { useVehicleTypes } from './composables/useVehicleTypes'

// 'add' y 'update' ahora se usan aquí
const { vehicleTypes, isLoading, filters, sorting, pagination, remove, add, update } = useVehicleTypes()

const doShowModal = ref(false)
const typeToEdit = ref<VehicleType | null>(null)
const { init: notify } = useToast()

const showModal = (vehicleType: VehicleType | null) => {
  typeToEdit.value = vehicleType
  doShowModal.value = true
}

// --- CAMBIO 3: Nueva función que maneja la lógica de guardado ---
const onFormSave = async (payload: Omit<VehicleType, 'type_id'>) => {
  try {
    if (typeToEdit.value) {
      // Si estamos editando, llamamos a 'update'
      await update({ ...typeToEdit.value, ...payload })
      notify({ message: 'Tipo de vehículo actualizado', color: 'success' })
    } else {
      // Si estamos creando, llamamos a 'add'
      await add(payload)
      notify({ message: 'Tipo de vehículo creado', color: 'success' })
    }
  } catch (e: any) {
    notify({ message: e.message || 'Error al guardar', color: 'danger' })
  } finally {
    doShowModal.value = false
  }
}

const onTypeDelete = async (vehicleType: VehicleType) => {
  try {
    await remove(vehicleType)
    notify({ message: `"${vehicleType.type_name}" eliminado`, color: 'success' })
  } catch (e: any) {
    notify({ message: e.message || 'Error al eliminar', color: 'danger' })
  }
}
</script>

<template>
  <h1 class="page-title">Tipos de Vehículo</h1>
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
          <VaInput v-model="filters.search" placeholder="Buscar tipo">
            <template #prependInner>
              <FontAwesomeIcon icon="search" style="color: #6c757d; font-size: 1rem; margin-right: 4px" />
            </template>
          </VaInput>
        </div>
        <VaButton @click="showModal(null)">Añadir Tipo de Vehículo</VaButton>
      </div>
      <VehicleTypesTable
        v-model:sort-by="sorting.sortBy"
        v-model:sorting-order="sorting.sortingOrder"
        :vehicle-types="vehicleTypes"
        :loading="isLoading"
        :pagination="pagination"
        @editType="showModal"
        @deleteType="onTypeDelete"
      />
    </VaCardContent>
  </VaCard>

  <VaModal v-model="doShowModal" size="small" close-button hide-default-actions>
    <h1 class="va-h5">{{ typeToEdit ? 'Editar' : 'Nuevo' }} Tipo de Vehículo</h1>
    <EditVehicleTypeForm
      :vehicle-type="typeToEdit"
      :action-button-label="typeToEdit ? 'Guardar' : 'Crear'"
      @close="doShowModal = false"
      @save="onFormSave"
    />
  </VaModal>
</template>

<style scoped>
.page-title {
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 1rem;
}
</style>
