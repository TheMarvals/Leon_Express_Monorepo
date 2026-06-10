<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast, defineVaDataTableColumns } from 'vuestic-ui'
import api from '../../services/api'
import { Client, ClientPricing } from './types'
import EditClientPricingForm from './widgets/EditClientPricingForm.vue'

const route = useRoute()
const router = useRouter()
const { init: notify } = useToast()

const client = ref<Client | null>(null)
const pricingHistory = ref<ClientPricing[]>([])
const isLoading = ref(true)
const doShowModal = ref(false)
const pricingToEdit = ref<ClientPricing | null>(null) // Para guardar el precio a editar

const clientId = route.params.id as string

const columns = defineVaDataTableColumns([
  { label: 'Precio Base', key: 'base_price', sortable: true },
  { label: 'Válido Desde', key: 'valid_from', sortable: true },
  { label: 'Válido Hasta', key: 'valid_to', sortable: true },
  { label: ' ', key: 'actions', align: 'right' }, // Columna para los botones de acción
])

const toggleFreePickup = async () => {
  try {
    const newStatus = !client.value?.has_free_pickups
    await api.updateClient(clientId, { has_free_pickups: newStatus })
    if (client.value) {
      client.value.has_free_pickups = newStatus
    }
    notify({
      message: `Recolección gratuita ${newStatus ? 'activada' : 'desactivada'} para este cliente`,
      color: 'success',
    })
  } catch (error) {
    notify({ message: 'Error al actualizar la configuración de recolección gratuita', color: 'danger' })
  }
}

const loadData = async () => {
  isLoading.value = true
  try {
    if (!clientId) {
      throw new Error('No se encontró el ID del cliente en la URL.')
    }

    const [clientRes, pricingRes] = await Promise.all([
      api.getClientById(clientId),
      api.getClientPricingHistory(clientId),
    ])

    client.value = clientRes.data.client
    pricingHistory.value = pricingRes.data.pricingHistory || []
  } catch (error: any) {
    notify({ message: error.message || 'Error al cargar los datos del cliente', color: 'danger' })
    // Si el cliente no se encuentra, redirige a la página de clientes
    router.push({ name: 'clients' })
  } finally {
    isLoading.value = false
  }
}

onMounted(loadData)

// Función para abrir el modal, ya sea para crear (pricing = null) o editar
const showModal = (pricing: ClientPricing | null) => {
  pricingToEdit.value = pricing
  doShowModal.value = true
}

// Función que se ejecuta al guardar el formulario
const onFormSave = async (payload: any) => {
  doShowModal.value = false
  try {
    if (pricingToEdit.value) {
      // Si estamos editando
      await api.updateClientPricing(clientId, pricingToEdit.value.pricing_id, payload)
      notify({ message: 'Política de precios actualizada', color: 'success' })
    } else {
      // Si estamos creando
      await api.createClientPricing(clientId, payload)
      notify({ message: 'Nueva política de precios guardada', color: 'success' })
    }
    await loadData() // Recarga la tabla con los datos actualizados
  } catch (e: any) {
    notify({ message: e.message || 'Error al guardar el precio', color: 'danger' })
  }
}
</script>

<template>
  <div v-if="isLoading" class="flex justify-center p-8">
    <VaProgressCircle indeterminate />
  </div>

  <div v-else-if="client">
    <h1 class="page-title">Historial de Precios para {{ client.client_name }}</h1>

    <VaCard>
      <VaCardContent>
        <div class="flex justify-between items-center mb-4">
          <VaButton :color="client.has_free_pickups ? 'success' : 'warning'" size="medium" @click="toggleFreePickup">
            {{ client.has_free_pickups ? 'Quitar' : 'Otorgar' }} Recolección Gratis
          </VaButton>
          <VaButton @click="showModal(null)">Añadir Nueva Política de Precios</VaButton>
        </div>
        <VaDataTable :columns="columns" :items="pricingHistory">
          <template #cell(base_price)="{ value }">${{ value }}</template>
          <template #cell(valid_from)="{ value }">{{ new Date(value).toLocaleDateString() }}</template>
          <template #cell(valid_to)="{ value }">{{ value ? new Date(value).toLocaleDateString() : 'Activo' }}</template>

          <template #cell(actions)="{ rowData }">
            <div class="flex justify-end">
              <VaButton
                preset="primary"
                size="small"
                icon="fa4-edit"
                aria-label="Editar precio"
                @click="showModal(rowData as ClientPricing)"
              />
            </div>
          </template>
        </VaDataTable>
      </VaCardContent>
    </VaCard>

    <VaModal v-model="doShowModal" size="small" close-button hide-default-actions>
      <h1 class="va-h5">{{ pricingToEdit ? 'Editar' : 'Nueva' }} Política de Precios</h1>
      <EditClientPricingForm :pricing="pricingToEdit" @close="doShowModal = false" @save="onFormSave" />
    </VaModal>
  </div>

  <div v-else>
    <h1 class="page-title">Error</h1>
    <VaAlert color="danger" class="p-4"> No se pudieron cargar los datos del cliente. </VaAlert>
  </div>
</template>

<style scoped>
.page-title {
  font-size: 1.5rem;
  font-weight: bold;
}

.va-card {
  margin-bottom: 1.5rem;
}
</style>
