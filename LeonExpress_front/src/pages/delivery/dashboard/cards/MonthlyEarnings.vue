<template>
  <VaCard>
    <VaCardTitle>
      <h1 class="card-title text-tag text-secondary font-bold uppercase">Ganancias del Mes</h1>
    </VaCardTitle>
    <VaCardContent>
      <div class="p-1 bg-black rounded absolute right-4 top-4">
        <FontAwesomeIcon icon="money-bill" style="color: #fff; font-size: 2rem" />
      </div>
      <section>
        <div class="text-xl font-bold mb-2">{{ formatMoney(monthlyEarnings) }}</div>
        <p class="text-xs text-success">
          <FontAwesomeIcon :icon="percentChange >= 0 ? 'arrow-up' : 'arrow-down'" style="margin-right: 4px" />
          {{ percentChange }}%
          <span class="text-secondary"> respecto al mes pasado</span>
        </p>
      </section>
      <div>
        <VaChart :key="chartKey" :data="chartData" class="va-chart" type="line" :options="options" />
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup lang="ts">
import { VaCard } from 'vuestic-ui'
import VaChart from '../../../../components/va-charts/VaChart.vue'
import { ChartOptions } from 'chart.js'
import api from '@/services/api'
import { ref, computed, onMounted, watch } from 'vue'

const props = defineProps({
  userId: {
    type: String,
    required: true,
  },
})

const earningsPerMonth = ref<number[]>(Array(12).fill(0))
const loading = ref(true)

const formatMoney = (value: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

onMounted(async () => {
  loading.value = true
  try {
    const { data } = await api.getDriverPayouts({ userId: props.userId, pageSize: 1000 })
    const currentYear = new Date().getFullYear()
    const monthly: number[] = Array(12).fill(0)

    data.payouts.forEach((p: any) => {
      const payoutDate = new Date(p.payout_date || p.created_at)
      if (payoutDate.getFullYear() === currentYear) {
        const monthIndex = payoutDate.getMonth()
        monthly[monthIndex] += Number(p.total_amount || 0)
      }
    })

    earningsPerMonth.value = monthly
  } catch (error) {
    console.error('Error fetching monthly earnings:', error)
  } finally {
    loading.value = false
  }
})

const currentMonthIndex = new Date().getMonth()
const monthlyEarnings = computed(() => {
  const value = earningsPerMonth.value[currentMonthIndex]
  return isNaN(value) || value == null ? 0 : value
})
const prevMonthEarnings = computed(() => {
  const value = earningsPerMonth.value[currentMonthIndex - 1]
  return isNaN(value) || value == null ? 0 : value
})

const percentChange = computed(() => {
  if (prevMonthEarnings.value === 0) {
    return monthlyEarnings.value > 0 ? 100 : 0
  }
  return ((monthlyEarnings.value - prevMonthEarnings.value) / prevMonthEarnings.value) * 100
})

const chartData = computed(() => ({
  labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
  datasets: [
    {
      data: earningsPerMonth.value.map((v) => (isNaN(v) || v == null ? 0 : v)).slice(0, 12),
    },
  ],
}))

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
  scales: {
    x: {
      display: false,
      grid: {
        display: false, // Disable X-axis grid lines ("net")
      },
    },
    y: {
      display: false,
      grid: {
        display: false, // Disable Y-axis grid lines ("net")
      },
      ticks: {
        display: false, // Hide Y-axis values
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
    },
  },
}
</script>

<style scoped>
.va-chart,
.va-chart canvas {
  height: 120px !important;
  max-height: 120px !important;
  min-height: 80px;
  width: 100% !important;
}
</style>
