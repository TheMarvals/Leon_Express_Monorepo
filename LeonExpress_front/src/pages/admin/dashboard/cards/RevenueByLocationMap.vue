<template>
  <VaCard class="flex flex-col">
    <VaCardTitle class="flex items-center justify-between">
      <h1 class="card-title text-secondary font-bold uppercase">Revenue by location</h1>
    </VaCardTitle>
    <VaCardContent class="flex-1 flex overflow-hidden">
      <VaAspectRatio class="w-full md:min-h-72 overflow-hidden relative flex items-center">
        <Map v-if="geoJson" :data="data" class="dashboard-map flex-1 h-full" />
        <VaProgressCircle v-else indeterminate class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      </VaAspectRatio>
    </VaCardContent>
  </VaCard>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue'
import { VaCard } from 'vuestic-ui'
import api from '@/services/api'
import Map from '../../../../components/va-charts/chart-types/Map.vue'
import type { ChartData } from 'chart.js'
import { detectComunaFromAddress } from '@/data/comunas'

const getRevenue = (countryName: string) => {
  if (['United States of America', 'Canada', 'United Kingdom', 'China', 'Japan'].includes(countryName)) {
    return 10
  }

  if (['Antarctica', 'Greenland'].includes(countryName)) {
    return 0
  }

  return Math.random() * 10
}

const geoJson = ref<any | null>(null)
const ingresosPorComuna = ref<{ [comuna: string]: number }>({})
onMounted(async () => {
  geoJson.value = await (await fetch('/data/chile_comunas.geo.json')).json()
  console.log('GeoJSON cargado:', geoJson.value)
  // Obtener packages y agrupar ingresos por comuna
  const { data } = await api.getPackages({ page: 1, perPage: 1000 })
  const agrupado: { [comuna: string]: number } = Object.fromEntries(
    (geoJson.value?.features || [])
      .map((feature: any) => feature.properties?.comuna)
      .filter(Boolean)
      .map((comuna: string) => [comuna, 0]),
  )

  data.packages.forEach((pkg: any) => {
    const direccion = pkg.destination_address || pkg.client?.address || pkg.client?.billing_address || ''

    let comuna = detectComunaFromAddress(direccion)

    if (!comuna && geoJson.value) {
      const normalizedAddress = direccion
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()

      const featureMatch = geoJson.value.features.find((f: any) =>
        normalizedAddress.includes(
          (f.properties?.comuna || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase(),
        ),
      )

      if (featureMatch) {
        comuna = featureMatch.properties.comuna
      }
    }

    if (comuna) {
      agrupado[comuna] = (agrupado[comuna] || 0) + Number(pkg.client_price || 0)
    }
  })
  ingresosPorComuna.value = agrupado
  console.log('Ingresos por comuna:', ingresosPorComuna.value)
})

const data = computed<ChartData<'choropleth', { feature: any; value: number }[], string>>(() => {
  if (!geoJson.value) {
    return {
      labels: [],
      datasets: [],
    }
  }

  return {
    labels: geoJson.value.features.map((d: any) => d.properties.comuna),
    datasets: [
      {
        label: 'Comunas',
        data: geoJson.value.features.map((d: any) => ({
          feature: d,
          value: ingresosPorComuna.value[d.properties.comuna] || 0,
        })),
      },
    ],
  }
})
</script>

<style lang="scss" scoped>
.va-card--flex {
  display: flex;
  flex-direction: column;
}
</style>
