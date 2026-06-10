<template>
  <canvas ref="canvas" style="max-width: 100%" />
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { Chart as ChartJS, Title, Tooltip, Legend, ArcElement, CategoryScale, ChartOptions } from 'chart.js'
import { ChoroplethController, ProjectionScale, ColorScale, GeoFeature } from 'chartjs-chart-geo'
import { watchEffect } from 'vue'
import { ChartData } from 'chart.js'

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  ArcElement,
  CategoryScale,
  ChoroplethController,
  ProjectionScale,
  ColorScale,
  GeoFeature,
)

const canvas = ref<HTMLCanvasElement | null>(null)

function getColor(revenue: number) {
  return revenue >= 0.9 ? '#63A6F8' : revenue > 0.4 ? '#8FC0FA' : '#EDF0F1'
}

const props = defineProps<{
  options?: ChartOptions<'choropleth'>
  data: ChartData<'choropleth', { feature: any; value: number }[], string>
}>()

watchEffect(() => {
  if (canvas.value === null) {
    return
  }
  new ChartJS(canvas.value.getContext('2d')!, {
    type: 'choropleth',
    data: props.data,
    options: {
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            title: (items) => {
              const item = items[0]
              return item.raw?.feature?.properties?.comuna || ''
            },
            label: (item) => {
              return `Ingresos: $${item.raw?.value?.toLocaleString()}`
            },
          },
        },
      },
      scales: {
        projection: {
          axis: 'x',
          projection: 'mercator',
          projectionScale: 10,
        },
        color: {
          axis: 'x',
          quantize: 5,
          display: false,
          interpolate: getColor,
        },
      },
      animation: false,
    },
  })
})
</script>
