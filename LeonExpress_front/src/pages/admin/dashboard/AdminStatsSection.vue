<template>
  <section class="grid gap-4 md:grid-cols-3">
    <VaCard v-if="cargando" class="col-span-full flex h-28 items-center justify-center">
      <span class="text-secondary">Cargando métricas...</span>
    </VaCard>
    <template v-else>
      <VaCard v-for="stat in stats" :key="stat.id" class="flex flex-col gap-2">
        <VaCardTitle class="uppercase text-secondary text-xs font-semibold">
          {{ stat.title }}
        </VaCardTitle>
        <VaCardContent class="flex flex-col gap-1">
          <span class="text-2xl font-bold">{{ stat.value }}</span>
          <span v-if="stat.subtitle" class="text-xs text-secondary">{{ stat.subtitle }}</span>
        </VaCardContent>
      </VaCard>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { VaCard, VaCardTitle, VaCardContent } from 'vuestic-ui'
import api from '@/services/api'

const totalFacturado = ref(0)
const facturasPendientes = ref(0)
const clientesActivos = ref(0)
const cargando = ref(true)

const formatCurrency = (value: number) =>
  value.toLocaleString('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  })

const stats = computed(() => [
  {
    id: 'facturacionTotal',
    title: 'Facturación total',
    value: formatCurrency(totalFacturado.value),
  },
  {
    id: 'facturasPendientes',
    title: 'Facturas pendientes',
    value: facturasPendientes.value.toString(),
    subtitle: 'Incluye facturas con estado pendiente',
  },
  {
    id: 'clientesActivos',
    title: 'Clientes activos',
    value: clientesActivos.value.toString(),
    subtitle: 'Cantidad de clientes con facturas registradas',
  },
])

onMounted(async () => {
  cargando.value = true
  try {
    const { data } = await api.getClientInvoices({ page: 1, pageSize: 1000 })
    const invoices = Array.isArray(data.invoices)
      ? (data.invoices as Array<{ total_amount?: number | string; status?: string }>)
      : []
    totalFacturado.value = invoices.reduce((sum: number, invoice) => sum + Number(invoice.total_amount ?? 0), 0)
    facturasPendientes.value = invoices.filter((invoice) => invoice.status === 'PENDIENTE').length
  } catch (e) {
    // Manejo de error (opcionalmente podrías mostrar una notificación)
  }
  try {
    const { data } = await api.getClients({ page: 1, perPage: 1000 })
    clientesActivos.value = data.clients.length
  } catch (e) {
    // Manejo de error (opcionalmente podrías mostrar una notificación)
  }
  cargando.value = false
})
</script>

<style scoped>
section {
  width: 100%;
}
</style>
