<script setup lang="ts">
import { ref, computed } from 'vue'
import { useModal, useToast } from 'vuestic-ui'
import api from '../../services/api'
import PackagesTable from './widgets/PackagesTable.vue'
import EditPackageForm from './widgets/EditPackageForm.vue'
import ChangeManagementModal from './widgets/ChangeManagementModal.vue'
import { Package } from './types'
import { usePackages } from './composables/usePackages'

const { packages, isLoading, filters, sorting, pagination, remove, add, update, fetch } = usePackages()

const showPendingChanges = computed({
  get: () => filters.value.changeFilter === 'pending_changes',
  set: (val: boolean) => {
    filters.value.changeFilter = val ? 'pending_changes' : undefined
  },
})

const doShowModal = ref(false)
const packageToEdit = ref<Package | null>(null)
const doShowChangeModal = ref(false)
const packageForChangeManagement = ref<Package | null>(null)
const { init: notify } = useToast()

const resetPagination = () => {
  pagination.value.page = 1
}

const onSearchInput = (val: string) => {
  filters.value.search = val
  resetPagination()
}

const showModal = (pkg: Package | null) => {
  packageToEdit.value = pkg
  doShowModal.value = true
}

const openChangeModal = (pkg: Package) => {
  packageForChangeManagement.value = pkg
  doShowChangeModal.value = true
}

const handleChangeUpdated = async () => {
  // Recargar la lista de paquetes después de marcar el cambio como recibido
  await fetch()
}

const onFormSave = async (payload: any) => {
  doShowModal.value = false
  try {
    if (packageToEdit.value) {
      await update({ ...packageToEdit.value, ...payload })
      notify({ message: 'Paquete actualizado', color: 'success' })
    } else {
      await add({ ...payload, status: 'RECOLECTADO_EN_ORIGEN' })
      notify({ message: 'Paquete creado', color: 'success' })
    }
  } catch (e: any) {
    notify({ message: e.message || 'Error al guardar el paquete', color: 'danger' })
  }
}

const onPackageDelete = async (pkg: Package) => {
  try {
    await remove(pkg)
    notify({ message: `Paquete ${pkg.tracking_code} eliminado`, color: 'success' })
  } catch (e: any) {
    notify({ message: e.message || 'Error al eliminar', color: 'danger' })
  }
}

const handleConfirmReception = async (packageId: string) => {
  if (!confirm('¿Confirmas que has recibido físicamente este paquete en el almacén?')) {
    return
  }
  try {
    await api.receivePackageAtWarehouse(packageId)
    notify({ message: 'Recepción en almacén confirmada y removido de rutas viejas.', color: 'success' })
    await fetch()
  } catch (error: any) {
    const errorMessage = error.response?.data?.error || 'Error al confirmar la recepción.'
    notify({ message: errorMessage, color: 'danger' })
  }
}

const statusOptions = [
  { text: 'Todos los estados', value: undefined },
  { text: 'Recolectado en Origen', value: 'RECOLECTADO_EN_ORIGEN' },
  { text: 'Recibido en Almacén', value: 'RECIBIDO_EN_ALMACEN' },
  { text: 'Asignado a Ruta', value: 'ASIGNADO_A_RUTA' },
  { text: 'En Ruta de Entrega', value: 'EN_RUTA_ENTREGA' },
  { text: 'Entregado', value: 'ENTREGADO' },
  { text: 'Incidencia en Entrega', value: 'INCIDENCIA_ENTREGA' },
  { text: 'Reprogramado', value: 'REPROGRAMADO' },
  { text: 'Devuelto a Almacén', value: 'DEVUELTO_ALMACEN' },
  { text: 'En Ruta de Devolución', value: 'EN_RUTA_DEVOLUCION' },
  { text: 'Devuelto al Cliente', value: 'DEVUELTO_A_CLIENTE' },
  { text: 'Cancelado', value: 'CANCELADO' },
]
</script>

<template>
  <h1 class="page-title">Gestión de Paquetes</h1>
  <VaCard>
    <VaCardContent>
      <div class="flex flex-col md:flex-row gap-2 mb-2 justify-between">
        <div class="flex flex-col md:flex-row gap-2 justify-start items-center">
          <VaInput
            v-model="filters.search"
            placeholder="Buscar por código o destinatario..."
            clearable
            @update:modelValue="onSearchInput"
          >
            <template #prependInner>
              <FontAwesomeIcon icon="search" style="color: #6c757d; font-size: 1rem; margin-right: 4px" />
            </template>
          </VaInput>
          <VaSelect
            v-model="filters.status"
            :options="statusOptions"
            value-by="value"
            text-by="text"
            placeholder="Filtrar por estado"
            clearable
            @update:modelValue="resetPagination"
          />
          <VaCheckbox
            v-model="showPendingChanges"
            label="Ver cambios pendientes"
            class="ml-2 whitespace-nowrap flex-shrink-0"
            @change="resetPagination"
          />
        </div>
        <VaButton @click="showModal(null)">Crear Paquete</VaButton>
      </div>

      <div class="table-wrapper">
        <PackagesTable
          v-model:sort-by="sorting.sortBy"
          v-model:sorting-order="sorting.sortOrder"
          :packages="packages"
          :loading="isLoading"
          :pagination="pagination"
          @editPackage="showModal"
          @deletePackage="onPackageDelete"
          @openChangeModal="openChangeModal"
          @confirmReception="handleConfirmReception"
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

  <VaModal v-model="doShowModal" size="large" close-button hide-default-actions>
    <template #header>
      <h1 class="va-h5">{{ packageToEdit ? 'Editar' : 'Nuevo' }} Paquete</h1>
    </template>
    <EditPackageForm :pkg="packageToEdit" @close="doShowModal = false" @save="onFormSave" />
  </VaModal>

  <!-- Modal de Gestión de Cambios -->
  <ChangeManagementModal
    :pkg="packageForChangeManagement"
    :visible="doShowChangeModal"
    @close="doShowChangeModal = false"
    @updated="handleChangeUpdated"
  />
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
