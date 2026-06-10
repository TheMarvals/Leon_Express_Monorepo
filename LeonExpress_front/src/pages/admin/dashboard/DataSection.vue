<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
    <DataSectionItem
      v-for="metric in dashboardMetrics"
      :key="metric.id"
      :title="metric.title"
      :value="metric.value"
      :change-text="metric.changeText"
      :up="metric.changeDirection === 'up'"
      :icon-background="metric.iconBackground"
      :icon-color="metric.iconColor"
    >
      <template #icon>
        <FontAwesomeIcon
          :icon="metric.icon"
          :style="{
            fontSize: '2rem',
            color: metric.iconColor || '#333',
            background: metric.iconBackground || 'transparent',
            borderRadius: '50%',
            padding: '0.25rem',
          }"
        />
      </template>
    </DataSectionItem>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useColors } from 'vuestic-ui'
import DataSectionItem from './DataSectionItem.vue'

interface DashboardMetric {
  id: string
  title: string
  value: string
  icon: string
  changeText: string
  changeDirection: 'up' | 'down'
  iconBackground: string
  iconColor: string
}

const { getColor } = useColors()

import { ref, onMounted } from 'vue'
import api from '@/services/api'

const totalFacturado = ref(0)
const facturasPendientes = ref(0)
const clientesActivos = ref(0)
const cargando = ref(true)

onMounted(async () => {
  cargando.value = true
  try {
    const { data } = await api.getClientInvoices({ page: 1, pageSize: 1000 })
    totalFacturado.value = data.invoices.reduce((sum, f) => sum + Number(f.total_amount), 0)
    facturasPendientes.value = data.invoices.filter((f) => f.status === 'PENDIENTE').length
  } catch (e) {}
  try {
    const { data } = await api.getClients({ page: 1, perPage: 1000 })
    clientesActivos.value = data.clients.length
  } catch (e) {}
  cargando.value = false
})

const dashboardMetrics = computed<DashboardMetric[]>(() => [
  {
    id: 'facturacionTotal',
    title: 'Facturación total',
    value: totalFacturado.value.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' }),
    icon: 'money-bill', // dinero
    changeText: '',
    changeDirection: 'up',
    iconBackground: getColor('success'),
    iconColor: getColor('on-success'),
  },
  {
    id: 'facturasPendientes',
    title: 'Facturas pendientes',
    value: String(facturasPendientes.value),
    icon: 'file-invoice', // recibo largo
    changeText: '',
    changeDirection: 'down',
    iconBackground: getColor('info'),
    iconColor: getColor('on-info'),
  },
  {
    id: 'clientesActivos',
    title: 'Clientes activos',
    value: String(clientesActivos.value),
    icon: 'users', // grupo de personas
    changeText: '',
    changeDirection: 'up',
    iconBackground: getColor('danger'),
    iconColor: getColor('on-danger'),
  },
])
</script>
