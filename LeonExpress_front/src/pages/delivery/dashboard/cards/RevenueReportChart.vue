<template>
  <div class="flex justify-center w-full h-full relative">
    <canvas ref="canvas" style="max-width: 100%"></canvas>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, nextTick, watch, computed } from 'vue'
import { Chart, registerables } from 'chart.js'

import type { Revenues } from '../../../../data/charts/revenueChartData'
import { earningsColor, expensesColor, formatMoney } from '../../../../data/charts/revenueChartData'

const props = defineProps<{
  months: string[]
  revenues: Revenues[]
}>()

Chart.register(...registerables)

const chartData = computed(() => {
  return props.months.map((month) => {
    const revenueData = props.revenues.find((r) => r.month === month)
    return revenueData ? revenueData.earning : 0
  })
})

const BR_THICKNESS = 4
const canvas = ref<HTMLCanvasElement | null>(null)
let chartInstance: Chart | null = null

const createChart = () => {
  if (chartInstance) {
    chartInstance.destroy()
  }
  if (canvas.value) {
    const ctx = canvas.value.getContext('2d')
    if (ctx) {
      chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: props.months, // Usar directamente los meses de los props
          datasets: [
            {
              label: 'Ganancias',
              data: chartData.value,
              backgroundColor: earningsColor,
              barThickness: BR_THICKNESS,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              callbacks: {
                label: function (context) {
                  let label = context.dataset.label || ''
                  if (label) {
                    label += ': '
                  }
                  if (context.parsed.y !== null) {
                    label += formatMoney(context.parsed.y)
                  }
                  return label
                },
              },
            },
          },
          scales: {
            x: {
              grid: { display: true },
              border: { display: true },
              ticks: {
                autoSkip: false, // Evitar que se salte etiquetas
                maxRotation: 45, // Rotar etiquetas si son muchas
              },
            },
            y: {
              display: true,
              grid: { display: true },
              beginAtZero: true,
              ticks: {
                callback: function (value) {
                  return formatMoney(Number(value))
                },
              },
            },
          },
        },
      })
    }
  }
}

// Función para actualizar el chart existente
const updateChart = () => {
  if (chartInstance) {
    // Actualizar labels y datos
    chartInstance.data.labels = props.months
    chartInstance.data.datasets[0].data = chartData.value

    // Actualizar el chart
    chartInstance.update('active')
  } else {
    createChart()
  }
}

onMounted(() => {
  createChart()
})

// Watch solo para cambios en props, no en chartData para evitar bucles
watch(
  [() => props.months, () => props.revenues],
  () => {
    nextTick(() => {
      updateChart()
    })
  },
  { deep: true },
)
</script>

<style lang="scss" scoped>
canvas {
  height: 100%;
  width: 100%;
  min-height: 300px; // Altura mínima para mejor visualización
}
</style>
