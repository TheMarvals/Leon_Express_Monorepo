<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useToast, defineVaDataTableColumns } from 'vuestic-ui'
import api from '../../services/api'

// Interfaz para el objeto Payout que recibimos
interface Payout {
  payout_id: string
  payout_date: string
  total_amount: number
  status: 'PENDIENTE' | 'PAGADO' | 'CANCELADO'
  user: {
    user_id: string
    full_name: string
  }
}

const { init: notify } = useToast()

const payouts = ref<Payout[]>([])
const isLoading = ref(true)
const totalPayouts = ref(0)
const currentPage = ref(1)
const pageSize = ref(10)

// Columnas para la tabla
const columns = defineVaDataTableColumns([
  { label: 'Conductor', key: 'user.full_name', sortable: true },
  { label: 'Fecha de Pago', key: 'payout_date', sortable: true },
  { label: 'Monto Total', key: 'total_amount', sortable: true, align: 'right' },
  { label: 'Estado', key: 'status', sortable: true },
  { label: ' ', key: 'actions', align: 'right' },
])

// Cargar datos desde la API
const fetchData = async () => {
  isLoading.value = true
  try {
    const { data } = await api.getDriverPayouts({
      page: currentPage.value,
      pageSize: pageSize.value,
    })
    payouts.value = data.payouts
    totalPayouts.value = data.total
  } catch (error) {
    notify({ message: 'Error al cargar las liquidaciones', color: 'danger' })
  } finally {
    isLoading.value = false
  }
}

onMounted(fetchData)

// Helper para formatear fechas
const formatDate = (dateString: string) => {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleDateString('es-CL')
}

// Helper para formatear moneda
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(value)
}

// Helper para el color del badge de estado
const getStatusColor = (status: string) => {
  if (status === 'PAGADO') return 'success'
  if (status === 'PENDIENTE') return 'warning'
  if (status === 'CANCELADO') return 'danger'
  return 'secondary'
}
</script>

<template>
  <div>
    <h1 class="page-title">Listado de Liquidaciones</h1>

    <VaCard>
      <VaCardContent>
        <div class="table-wrapper">
          <VaDataTable
            :columns="columns"
            :items="payouts"
            :loading="isLoading"
            :per-page="100"
            sticky-header
            no-items-text="No se encontraron liquidaciones"
          >
            <template #cell(payout_date)="{ value }">
              {{ formatDate(value) }}
            </template>
            <template #cell(total_amount)="{ value }">
              <strong>{{ formatCurrency(value) }}</strong>
            </template>
            <template #cell(status)="{ value }">
              <VaBadge :text="value" :color="getStatusColor(value)" />
            </template>
            <template #cell(actions)="{ rowData }">
              <VaButton
                preset="primary"
                size="small"
                :to="{ name: 'payout-details', params: { id: rowData.payout_id } }"
              >
                Ver Detalles
              </VaButton>
            </template>
          </VaDataTable>
        </div>

        <div class="flex justify-center mt-4">
          <VaPagination
            v-model="currentPage"
            :pages="Math.ceil(totalPayouts / pageSize)"
            @update:modelValue="fetchData"
          />
        </div>
      </VaCardContent>
    </VaCard>
  </div>
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
