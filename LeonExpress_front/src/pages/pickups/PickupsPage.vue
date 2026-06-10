<script setup lang="ts">
import { ref } from 'vue'
import { useModal, useToast } from 'vuestic-ui'
import PickupsTable from './widgets/PickupsTable.vue'
import EditPickupForm from './widgets/EditPickupForm.vue'
import { Pickup } from './types'
import { usePickups } from './composables/usePickups'
import { useUserStore } from '../../stores/user-store' // 1. Importa el userStore

const { pickups, isLoading, filters, sorting, pagination, add, update, updateStatus, remove } = usePickups()
const userStore = useUserStore() // 2. Obtén una instancia del store

const doShowModal = ref(false)
const pickupToEdit = ref<Pickup | null>(null)
const { init: notify } = useToast()
const { confirm } = useModal()

const showModal = (pickup: Pickup | null) => {
  pickupToEdit.value = pickup
  doShowModal.value = true
}

const onFormSave = async (payload: any) => {
  doShowModal.value = false
  try {
    if (pickupToEdit.value) {
      await update({ ...pickupToEdit.value, ...payload })
      notify({ message: 'Recolección actualizada exitosamente', color: 'success' })
    } else {
      await add(payload)
      notify({ message: 'Recolección creada exitosamente', color: 'success' })
    }
  } catch (e: any) {
    notify({ message: e.message || 'Error al guardar la recolección', color: 'danger' })
  }
}

const onPickupCancel = async (pickup: Pickup) => {
  try {
    await updateStatus(pickup, 'CANCELADO')
    notify({ message: `Recolección para "${pickup.client?.client_name}" ha sido cancelada.`, color: 'success' })
  } catch (e: any) {
    notify({ message: e.message || 'Error al cancelar la recolección', color: 'danger' })
  }
}

const onDeletePickup = async (pickup: Pickup) => {
  const isConfirmed = await confirm({
    title: 'Eliminar Recolección',
    message: `¿Estás seguro de que deseas eliminar permanentemente la recolección para "${pickup.client?.client_name}"? Esta acción no se puede deshacer y solo se permitirá si la recolección no tiene paquetes.`,
    okText: 'Eliminar',
    cancelText: 'Cancelar',
    size: 'small',
  })

  if (isConfirmed) {
    try {
      await remove(pickup)
      notify({ message: 'Recolección eliminada exitosamente', color: 'success' })
    } catch (e: any) {
      // Si el backend devuelve un error (ej. tiene paquetes), se mostrará aquí
      notify({
        message: e.response?.data?.error || e.message || 'Error al eliminar la recolección',
        color: 'danger',
        duration: 5000,
      })
    }
  }
}
</script>

<template>
  <h1 class="page-title">Gestión de Recolecciones</h1>
  <VaCard>
    <VaCardContent>
      <div class="flex flex-col md:flex-row gap-2 mb-2 justify-between">
        <div class="flex flex-col md:flex-row gap-2 justify-start">
          <VaInput v-model="filters.search" placeholder="Buscar por cliente, driver o #ID...">
            <template #prependInner>
              <FontAwesomeIcon icon="search" style="color: #6c757d; font-size: 1rem; margin-right: 4px" />
            </template>
          </VaInput>
        </div>
        <VaButton v-if="userStore.isAdmin || userStore.isWarehouseStaff" @click="showModal(null)">
          Crear Recolección
        </VaButton>
      </div>
      <div class="table-wrapper">
        <PickupsTable
          :pickups="pickups"
          :loading="isLoading"
          :pagination="pagination"
          @editPickup="showModal"
          @deletePickup="onDeletePickup"
        />
      </div>

      <div v-if="pagination.total > pagination.perPage" class="flex justify-center mt-4">
        <VaPagination
          v-model="pagination.page"
          :pages="Math.ceil(pagination.total / pagination.perPage)"
          :visible-pages="5"
          buttons-preset="secondary"
        />
      </div>
    </VaCardContent>
  </VaCard>

  <VaModal v-model="doShowModal" size="small" close-button hide-default-actions>
    <h1 class="va-h5">{{ pickupToEdit ? 'Editar' : 'Nueva' }} Recolección</h1>
    <EditPickupForm
      :key="`pickup-form-${pickupToEdit?.pickup_id || 'new'}`"
      :pickup="pickupToEdit"
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
