<template>
  <VaCard>
    <VaCardTitle>
      <h1 class="card-title text-tag text-secondary font-bold uppercase">Ganancias Diarias</h1>
    </VaCardTitle>
    <VaCardContent>
      <div class="p-1 bg-black rounded absolute right-4 top-4">
        <FontAwesomeIcon icon="calendar-days" style="color: #fff; font-size: 2rem" />
      </div>
      <section v-if="loading" class="flex items-center justify-center py-8">
        <VaProgressCircle indeterminate />
      </section>
      <section v-else>
        <div class="text-xl font-bold mb-2">{{ formatMoney(todayEarnings) }}</div>
        <p v-if="todayEarnings > 0" class="text-xs text-success">
          <FontAwesomeIcon icon="check-circle" style="margin-right: 4px" />
          <span>Ganancias de hoy</span>
        </p>
        <p v-else class="text-xs text-secondary">
          <span>Sin ganancias registradas hoy</span>
        </p>
      </section>
      <div v-if="!loading && dailyEarnings.length > 0" class="mt-4">
        <VaChart :key="chartKey" :data="chartData" class="va-chart" type="line" :options="options" />
      </div>
      <div v-else-if="!loading" class="mt-4 text-center text-secondary text-sm py-4">
        No hay datos de ganancias diarias disponibles
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup lang="ts">
import { VaCard, VaProgressCircle } from 'vuestic-ui'
import VaChart from '../../../../components/va-charts/VaChart.vue'
import { ChartOptions } from 'chart.js'
import api from '@/services/api'
import { ref, computed, onMounted, watch } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

const props = defineProps({
  userId: {
    type: String,
    required: true,
  },
})

interface DailyEarning {
  date: string
  total_earnings: number
  delivery_earnings: number
  pickup_earnings: number
  credit_earnings: number
  deliveries_count: number
  pickups_count: number
}

const dailyEarnings = ref<DailyEarning[]>([])
const loading = ref(true)

const formatMoney = (value: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

const todayEarnings = computed(() => {
  const today = new Date().toISOString().split('T')[0]
  const todayData = dailyEarnings.value.find((d) => d.date === today)
  return todayData ? todayData.total_earnings : 0
})

const fetchDailyEarnings = async () => {
  if (!props.userId) return
  loading.value = true
  try {
    const { data } = await api.getDriverSummary({ userId: props.userId })
    if (data.daily_earnings && Array.isArray(data.daily_earnings)) {
      // Tomar los últimos 14 días para el gráfico
      dailyEarnings.value = data.daily_earnings.slice(0, 14).reverse()
    } else {
      dailyEarnings.value = []
    }
  } catch (error) {
    console.error('Error fetching daily earnings:', error)
    dailyEarnings.value = []
  } finally {
    loading.value = false
  }
}

onMounted(fetchDailyEarnings)

watch(() => props.userId, fetchDailyEarnings, { immediate: true })

const chartData = computed(() => {
  const labels = dailyEarnings.value.map((d) => formatDate(d.date))
  const data = dailyEarnings.value.map((d) => d.total_earnings || 0)

  return {
    labels,
    datasets: [
      {
        label: 'Ganancias',
        data,
        borderColor: '#4caf50',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        tension: 0.4,
        fill: true,
      },
    ],
  }
})

// Key reactiva para forzar el remount del chart
const chartKey = ref(0)
watch(
  chartData,
  () => {
    chartKey.value++
  },
  { deep: true },
)

const options: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      display: true,
      grid: {
        display: false,
      },
      ticks: {
        maxRotation: 45,
        minRotation: 45,
        font: {
          size: 10,
        },
      },
    },
    y: {
      display: true,
      grid: {
        display: true,
        color: 'rgba(0, 0, 0, 0.05)',
      },
      ticks: {
        callback: function (value) {
          return '$' + value
        },
        font: {
          size: 10,
        },
      },
    },
  },
  interaction: {
    intersect: false,
    mode: 'index',
  },
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      enabled: true,
      callbacks: {
        label: function (context) {
          const index = context.dataIndex
          const day = dailyEarnings.value[index]
          if (!day) return ''

          let tooltip = `Total: ${formatMoney(day.total_earnings)}\n`
          if (day.delivery_earnings > 0) {
            tooltip += `Entregas: ${formatMoney(day.delivery_earnings)} (${day.deliveries_count})\n`
          }
          if (day.pickup_earnings > 0) {
            tooltip += `Recolecciones: ${formatMoney(day.pickup_earnings)} (${day.pickups_count})\n`
          }
          if (day.credit_earnings > 0) {
            tooltip += `Créditos: ${formatMoney(day.credit_earnings)}`
          }
          return tooltip.trim()
        },
      },
    },
  },
}
</script>

<style scoped>
.va-chart,
.va-chart canvas {
  height: 200px !important;
  max-height: 200px !important;
  min-height: 150px;
  width: 100% !important;
}
</style>
