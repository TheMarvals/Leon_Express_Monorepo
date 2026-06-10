// src/pages/users/UsersPage.vue
<script setup lang="ts">
import { ref } from 'vue'
import { useModal, useToast } from 'vuestic-ui'
import UsersTable from './widgets/UsersTable.vue'
import EditUserForm from './widgets/EditUserForm.vue'
import { User } from './types'
import { useUsers } from './composables/useUsers'

const { users, isLoading, filters, sorting, pagination, remove, add, update, reactivate } = useUsers()

const doShowModal = ref(false)
const userToEdit = ref<User | null>(null)
const { init: notify } = useToast()

const showModal = (user: User | null) => {
  userToEdit.value = user
  doShowModal.value = true
}

const onFormSave = async (payload: any) => {
  doShowModal.value = false
  try {
    if (userToEdit.value) {
      await update({ ...userToEdit.value, ...payload })
      notify({ message: 'Usuario actualizado', color: 'success' })
    } else {
      await add(payload)
      notify({ message: 'Usuario creado', color: 'success' })
    }
  } catch (e: any) {
    const errorMsg =
      e.response?.data?.errors?.[0]?.msg || // Error de validación (express-validator)
      e.response?.data?.error || // Error manual del backend
      e.message || // Error de red/axios
      'Error al guardar el usuario'
    notify({ message: errorMsg, color: 'danger' })
  }
}

const onUserReactivate = async (user: User) => {
  try {
    await reactivate(user)
    notify({ message: `"${user.fullname}" ha sido reactivado`, color: 'success' })
  } catch (e: any) {
    const errorMsg = e.response?.data?.error || e.message || 'Error al reactivar'
    notify({ message: errorMsg, color: 'danger' })
  }
}

const onUserDelete = async (user: User) => {
  try {
    await remove(user)
    notify({ message: `"${user.fullname}" desactivado`, color: 'success' })
  } catch (e: any) {
    const errorMsg = e.response?.data?.error || e.message || 'Error al desactivar'
    notify({ message: errorMsg, color: 'danger' })
  }
}
</script>

<template>
  <h1 class="page-title">Usuarios</h1>
  <VaCard>
    <VaCardContent>
      <div class="flex flex-col md:flex-row gap-2 mb-2 justify-between">
        <div class="flex flex-col md:flex-row gap-2 justify-start">
          <VaButtonToggle
            v-model="filters.isActive"
            color="background-element"
            border-color="background-element"
            :options="[
              { label: 'Todos', value: undefined },
              { label: 'Activos', value: true },
              { label: 'Inactivos', value: false },
            ]"
          />
          <VaInput v-model="filters.search" placeholder="Buscar por nombre...">
            <template #prependInner>
              <FontAwesomeIcon icon="search" style="color: #6c757d; font-size: 1rem; margin-right: 4px" />
            </template>
          </VaInput>
        </div>
        <VaButton @click="showModal(null)">Añadir Usuario</VaButton>
      </div>

      <div class="table-wrapper">
        <UsersTable
          v-model:sort-by="sorting.sortBy"
          v-model:sorting-order="sorting.sortOrder"
          :users="users"
          :loading="isLoading"
          :pagination="pagination"
          @editUser="showModal"
          @deleteUser="onUserDelete"
          @reactivateUser="onUserReactivate"
        />
      </div>
    </VaCardContent>
  </VaCard>

  <VaModal v-model="doShowModal" size="small" close-button hide-default-actions>
    <h1 class="va-h5">{{ userToEdit ? 'Editar' : 'Nuevo' }} Usuario</h1>
    <EditUserForm :user="userToEdit" @close="doShowModal = false" @save="onFormSave" />
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
