<script setup lang="ts">
import { ref } from 'vue'
import { useModal, useToast } from 'vuestic-ui'
import RoutesTable from './widgets/RoutesTable.vue'
import EditRouteForm from './widgets/EditRouteForm.vue'
import { Route } from './types'
import { useRoutes } from './composables/useRoutes'
import { useUserStore } from '../../stores/user-store'
import { computed } from 'vue'

const userStore = useUserStore()
const isDriver = computed(() => userStore.isDriver)
const { routes, isLoading, filters, sorting, pagination, remove, add, update } = useRoutes()

const doShowModal = ref(false)
const routeToEdit = ref<Route | null>(null)
const { init: notify } = useToast()

const showModal = (route: Route | null) => {
  routeToEdit.value = route
  doShowModal.value = true
}

const onFormSave = async (payload: Omit<Route, 'route_id'>) => {
  doShowModal.value = false
  try {
    if (routeToEdit.value) {
      await update({ ...routeToEdit.value, ...payload })
      notify({ message: 'Ruta actualizada', color: 'success' })
    } else {
      await add(payload)
      notify({ message: 'Ruta creada', color: 'success' })
    }
  } catch (e: any) {
    notify({ message: e.message || 'Error al guardar la ruta', color: 'danger' })
  }
}

const onRouteDelete = async (route: Route) => {
  try {
    await remove(route)
    notify({ message: `Ruta eliminada`, color: 'success' })
  } catch (e: any) {
    notify({ message: e.message || 'Error al eliminar', color: 'danger' })
  }
}
</script>

<template>
  <h1 class="page-title">Gestión de Rutas</h1>
  <VaCard>
    <VaCardContent>
      <div class="flex flex-col md:flex-row gap-2 mb-2 justify-between">
        <div class="flex flex-col md:flex-row gap-2 justify-start">
          <VaInput v-model="filters.search" placeholder="Buscar por conductor, vehículo...">
            <template #prependInner>
              <FontAwesomeIcon icon="search" style="color: #6c757d; font-size: 1rem; margin-right: 4px" />
            </template>
          </VaInput>
        </div>
        <VaButton v-if="!isDriver" @click="showModal(null)">Crear Ruta</VaButton>
      </div>

      <div class="table-wrapper">
        <RoutesTable
          v-model:sort-by="sorting.sortBy"
          v-model:sorting-order="sorting.sortOrder"
          :routes="routes"
          :loading="isLoading"
          :pagination="pagination"
          @editRoute="showModal"
          @deleteRoute="onRouteDelete"
        />
      </div>
    </VaCardContent>
  </VaCard>

  <VaModal v-model="doShowModal" size="large" close-button hide-default-actions>
    <template #header>
      <h1 class="va-h5">{{ routeToEdit ? 'Editar' : 'Nueva' }} Ruta</h1>
    </template>
    <EditRouteForm :route="routeToEdit" @close="doShowModal = false" @save="onFormSave" />
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
