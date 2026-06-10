<template>
  <VaCard>
    <VaCardTitle class="flex justify-between">
      <h1 class="card-title text-secondary font-bold uppercase">Recolecciones Pendientes</h1>
    </VaCardTitle>
    <VaCardContent>
      <div v-if="loading" class="text-center py-8">Cargando...</div>
      <div v-else-if="pickups.length === 0" class="text-center py-4 text-secondary">
        No tienes recolecciones pendientes.
      </div>
      <div v-else class="max-h-96 overflow-y-auto">
        <VaDataTable :items="pickups" :columns="columns" hoverable class="cursor-pointer" @row:click="goToPickup">
          <template #cell(pickup_scheduled_date)="{ value }">
            {{ new Date(value).toLocaleString() }}
          </template>
        </VaDataTable>
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'
import { defineVaDataTableColumns } from 'vuestic-ui'

const props = defineProps({
  userId: {
    type: String,
    required: true,
  },
})

const router = useRouter()
const pickups = ref<any[]>([])
const loading = ref(true)

const columns = defineVaDataTableColumns([
  { label: 'Cliente', key: 'client.client_name', sortable: true },
  { label: 'Fecha Programada', key: 'pickup_scheduled_date', sortable: true },
  { label: 'Estado', key: 'status', sortable: true },
])

onMounted(async () => {
  try {
    const { data } = await api.getPickups({
      userId: props.userId,
      status: 'ASIGNADO_A_RECOLECTOR',
      perPage: 10,
      sortBy: 'pickup_scheduled_date',
      sortOrder: 'ASC',
    })
    pickups.value = data.pickups
  } catch (error) {
    console.error('Error fetching pending pickups:', error)
  } finally {
    loading.value = false
  }
})

const goToPickup = (event: any) => {
  const pickupId = event.item.pickup_id
  router.push({ name: 'pickup-details', params: { id: pickupId } })
}
</script>
