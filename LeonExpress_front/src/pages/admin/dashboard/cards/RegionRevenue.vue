<template>
  <VaCard>
    <VaCardTitle class="flex justify-between">
      <h1 class="card-title text-secondary font-bold uppercase">Ingresos por Comuna</h1>
    </VaCardTitle>
    <VaCardContent>
      <table class="w-full text-left">
        <thead>
          <tr>
            <th>Comuna</th>
            <th>Ingresos</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in topComunas" :key="item.comuna">
            <td>{{ item.comuna }}</td>
            <td>{{ formatMoney(item.total) }}</td>
          </tr>
        </tbody>
      </table>
    </VaCardContent>
  </VaCard>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/services/api'
import { formatMoney } from '../../../../data/charts/revenueChartData'
import { detectComunaFromAddress, SANTIAGO_COMUNAS } from '@/data/comunas'

const ingresosPorComuna = ref<{ [comuna: string]: number }>({})
const topComunas = ref<{ comuna: string; total: number }[]>([])

onMounted(async () => {
  const { data } = await api.getPackages({ page: 1, perPage: 1000 })
  const agrupado: { [comuna: string]: number } = Object.fromEntries(SANTIAGO_COMUNAS.map((comuna) => [comuna, 0]))

  data.packages.forEach((pkg: any) => {
    const direccion = pkg.destination_address || pkg.client?.address || pkg.client?.billing_address || ''
    const comuna = detectComunaFromAddress(direccion)
    if (comuna) {
      agrupado[comuna] = (agrupado[comuna] || 0) + Number(pkg.client_price || 0)
    }
  })

  ingresosPorComuna.value = agrupado
  topComunas.value = Object.entries(agrupado)
    .map(([comuna, total]) => ({ comuna, total }))
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
})
</script>

<style lang="scss" scoped>
table {
  border-collapse: collapse;
}
th,
td {
  padding: 0.5rem 1rem;
  border-bottom: 1px solid #eee;
}
th {
  background: #f5f5f5;
}
</style>
