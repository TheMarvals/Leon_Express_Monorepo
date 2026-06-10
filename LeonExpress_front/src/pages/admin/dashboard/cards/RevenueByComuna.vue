<template>
  <VaCard class="mt-6">
    <VaCardTitle>Paquetes Entregados por Comuna</VaCardTitle>
    <VaCardContent>
      <table class="w-full text-left">
        <thead>
          <tr>
            <th>Comuna</th>
            <th>Paquetes Entregados</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="topComunas.length === 0">
            <td colspan="2" class="text-center text-gray-500 py-4">No hay datos de paquetes por comuna disponibles</td>
          </tr>
          <tr v-for="item in topComunas" :key="item.comuna">
            <td>{{ item.comuna }}</td>
            <td>{{ item.total }} paquetes</td>
          </tr>
        </tbody>
      </table>
    </VaCardContent>
  </VaCard>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/services/api'

import { comunasService, SANTIAGO_COMUNAS } from '../../../../data/comunas'

const paquetesPorComuna = ref<{ [comuna: string]: number }>({})
const topComunas = ref<{ comuna: string; total: number }[]>([])

onMounted(async () => {
  try {
    // Intentar usar facturas primero
    console.log('Obteniendo facturas para ingresos por comuna...')
    const invoicesResponse = await api.getClientInvoices({ page: 1, pageSize: 1000 })
    console.log('Facturas obtenidas:', invoicesResponse.data)

    const agrupado: { [comuna: string]: number } = Object.fromEntries(SANTIAGO_COMUNAS.map((comuna) => [comuna, 0]))

    // Cambiar lógica: mostrar número de paquetes entregados por comuna
    console.log('Usando paquetes para contar entregas por comuna...')
    const packagesResponse = await api.getPackages({ page: 1, perPage: 1000 })
    console.log('Paquetes obtenidos:', packagesResponse.data)

    for (const pkg of packagesResponse.data.packages || []) {
      const direccion = pkg.destination_address || pkg.pickup_address || ''
      console.log('Procesando paquete ID:', pkg.package_id)
      console.log('Dirección completa:', direccion)
      console.log('Estado del paquete:', pkg.status)

      if (direccion) {
        const comuna = await comunasService.detectComunaFromAddress(direccion)
        console.log('Comuna detectada:', comuna)

        if (comuna) {
          // Contar paquetes en lugar de sumar dinero
          agrupado[comuna] = (agrupado[comuna] || 0) + 1
          console.log('Contador para', comuna, ':', agrupado[comuna])
        }
      } else {
        console.log('Paquete sin dirección válida')
      }
    }

    console.log('Paquetes agrupados por comuna:', agrupado)

    paquetesPorComuna.value = agrupado
    topComunas.value = Object.entries(agrupado)
      .map(([comuna, total]) => ({ comuna, total }))
      .filter((item) => item.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)

    console.log('Top comunas:', topComunas.value)
  } catch (error) {
    console.error('Error cargando datos de ingresos por comuna:', error)
  }
})
</script>

<style scoped>
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
