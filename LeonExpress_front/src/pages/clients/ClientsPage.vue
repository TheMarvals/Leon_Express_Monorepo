<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useModal, useToast } from 'vuestic-ui'
import ClientsTable from './widgets/ClientsTable.vue'
import EditClientForm from './widgets/EditClientForm.vue'
import InviteClientModal from './widgets/InviteClientModal.vue'
import ClientPortalAccessModal from './widgets/ClientPortalAccessModal.vue'
import { Client } from './types'
import { useClients } from './composables/useClients'

const doShowEditClientModal = ref(false)
const doShowInviteModal = ref(false)
const portalClient = ref<Client | null>(null)
const doShowPortalAccess = ref(false)
const showPortalAccess = (client: Client) => {
  portalClient.value = client
  doShowPortalAccess.value = true
}
const clientToEdit = ref<Client | null>(null)
const {
  clients,
  isLoading,
  filters,
  pagination,
  error,
  fetch: debouncedFetch,
  remove,
} = useClients({
  filters: ref({ search: '' }),
})

const { init: notify } = useToast()

watchEffect(() => {
  if (error.value) {
    notify({
      message: error.value,
      color: 'danger',
    })
    error.value = null // Reset error after showing
  }
})

const showEditClientModal = (client: Client) => {
  clientToEdit.value = client
  doShowEditClientModal.value = true
}

const onClientSaved = async () => {
  doShowEditClientModal.value = false
  await debouncedFetch()
}

const onClientDelete = async (client: Client) => {
  try {
    await remove(client)
    notify({
      message: `${client.client_name} eliminado`,
      color: 'success',
    })
    await debouncedFetch()
  } catch (e: any) {
    notify({
      message: e.message || 'Error al eliminar cliente',
      color: 'danger',
    })
  }
}

const editFormRef = ref()
const { confirm } = useModal()

const beforeEditFormModalClose = async (hide: () => void) => {
  if (editFormRef.value?.isFormHasUnsavedChanges) {
    const agreed = await confirm({
      maxWidth: '380px',
      message: 'Hay cambios sin guardar. ¿Seguro que quieres cerrar?',
      size: 'small',
    })
    if (agreed) hide()
  } else {
    hide()
  }
}
</script>

<template>
  <h1 class="page-title">Partners</h1>

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
          <VaInput v-model="filters.search" placeholder="Buscar por nombre">
            <template #prependInner>
              <FontAwesomeIcon icon="search" style="color: #6c757d; font-size: 1rem; margin-right: 4px" />
            </template>
          </VaInput>
        </div>
        <div class="flex items-center gap-2">
          <VaButton color="primary" icon="mail" @click="doShowInviteModal = true"> Invitar Cliente </VaButton>
        </div>
      </div>

      <p class="text-sm text-secondary mb-4">
        Invita a los nuevos clientes. Los clientes existentes acceden al portal con su correo registrado y un código de
        acceso.
      </p>

      <div class="table-wrapper">
        <ClientsTable
          :clients="clients"
          :loading="isLoading"
          :pagination="pagination"
          @editClient="showEditClientModal"
          @deleteClient="onClientDelete"
          @portal-access="showPortalAccess"
          @update:per-page="pagination.perPage = $event"
        />
      </div>
    </VaCardContent>
  </VaCard>

  <VaModal
    v-slot="{ cancel }"
    v-model="doShowEditClientModal"
    size="small"
    mobile-fullscreen
    close-button
    hide-default-actions
    :before-cancel="beforeEditFormModalClose"
  >
    <h1 class="va-h5">Editar cliente</h1>
    <EditClientForm
      v-if="clientToEdit"
      ref="editFormRef"
      :client="clientToEdit"
      @close="cancel"
      @success="onClientSaved"
    />
  </VaModal>

  <ClientPortalAccessModal v-model="doShowPortalAccess" :client="portalClient" />

  <InviteClientModal v-model="doShowInviteModal" @created="debouncedFetch" />
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
