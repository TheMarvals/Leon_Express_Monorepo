<template>
  <div class="flex justify-center w-full h-full overflow-hidden relative">
    <canvas ref="canvas" style="max-width: 100%"></canvas>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, nextTick, watch } from 'vue'
import { Chart, registerables } from 'chart.js'

import type { Revenues } from '../../../../data/charts/revenueChartData'
import { earningsColor, expensesColor, formatMoney } from '../../../../data/charts/revenueChartData'

const { revenues, months } = defineProps<{
  months: string[]
  revenues: Revenues[]
}>()

Chart.register(...registerables)

const BR_THICKNESS = 2

Chart.register([
  {
    id: 'background-color',
    beforeDatasetDraw: function (chart) {
      const ctx = chart.ctx
      const config = chart.config

      config.data.datasets.forEach(function (dataset, datasetIndex) {
        const meta = chart.getDatasetMeta(datasetIndex)
        if (meta.type === 'bar') {
          // Todas las barras de fondo en gris claro
          meta.data.forEach(function (bar) {
            ctx.fillStyle = '#e0e0e0'
            ctx.fillRect(bar.x - BR_THICKNESS / 2, 0, BR_THICKNESS, chart.chartArea.bottom)
          })
        }
      })
    },
  },
])

const canvas = ref<HTMLCanvasElement | null>(null)
let chartInstance: Chart | null = null

function renderChart() {
  if (!canvas.value) return
  const ctx = canvas.value.getContext('2d')
  if (!ctx) return
  if (chartInstance) {
    chartInstance.destroy()
  }
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        {
          label: 'Ingresos',
          data: revenues.map(({ earning }) => earning),
          backgroundColor: revenues.map(({ earning }) => (earning > 0 ? '#0d47a1' : '#e0e0e0')),
          barThickness: BR_THICKNESS,
        },
        {
          label: 'Gastos',
          data: revenues.map(({ expenses }) => expenses),
          backgroundColor: '#e53935', // rojo sólido para expenses
          barThickness: BR_THICKNESS,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        x: {
          stacked: false,
          grid: {
            display: false,
          },
          border: {
            width: 0,
          },
        },
        y: {
          display: true,
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

onMounted(() => {
  renderChart()
})

watch(
  () => [revenues.map((r) => ({ ...r })), months.slice()],
  () => {
    renderChart()
  },
  { deep: true },
)
// No agregar nada después de este cierre
</script>

<style lang="scss" scoped>
canvas {
  position: absolute;
  height: 100%;
  width: 100%;
}
</style>
