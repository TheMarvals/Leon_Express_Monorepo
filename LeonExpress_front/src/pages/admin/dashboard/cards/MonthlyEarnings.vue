<template>
  <VaCard>
    <VaCardTitle>
      <h1 class="card-title text-tag text-secondary font-bold uppercase">Ingresos mensuales</h1>
    </VaCardTitle>
    <VaCardContent>
      <div class="p-1 bg-black rounded absolute right-4 top-4">
        <FontAwesomeIcon icon="money-bill" style="color: #fff; font-size: 2rem" />
      </div>
      <section>
        <div class="text-xl font-bold mb-2">{{ formatMoney(thisMonthEarnings) }}</div>
        <p class="text-xs text-success">
          <FontAwesomeIcon icon="arrow-up" style="color: #16a34a; margin-right: 4px" />
          {{ percentChange }}%
          <span class="text-secondary"> respecto al mes pasado</span>
        </p>
      </section>
      <div class="w-full flex items-center">
        <VaChart :data="chartData" class="h-24" type="line" :options="options" />
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { VaCard } from 'vuestic-ui'
import VaChart from '../../../../components/va-charts/VaChart.vue'
import api from '@/services/api'
import { ChartOptions } from 'chart.js'
import { months, formatMoney } from '../../../../data/charts/revenueChartData'

const currentYear = new Date().getFullYear()
const monthlyEarnings = ref<number[]>(Array(12).fill(0))

const chartData = computed(() => ({
  labels: months,
  datasets: [
    {
      label: 'Ingresos mensuales',
      backgroundColor: 'rgba(75,192,192,0.4)',
      data: monthlyEarnings.value,
    },
  ],
}))

const options: ChartOptions<'line'> = {
  scales: {
    x: {
      display: false,
      grid: {
        display: false,
      },
    },
    y: {
      display: false,
      grid: {
        display: false,
      },
      ticks: {
        display: false,
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

const lastMonth = new Date().getMonth()
const thisMonthEarnings = computed(() => monthlyEarnings.value[lastMonth] || 0)
const prevMonthEarnings = computed(() => monthlyEarnings.value[lastMonth - 1] || 0)
const percentChange = computed(() => {
  if (prevMonthEarnings.value === 0) return '0.0'
  return (((thisMonthEarnings.value - prevMonthEarnings.value) / prevMonthEarnings.value) * 100).toFixed(2)
})

onMounted(async () => {
  const { data } = await api.getClientInvoices({ page: 1, pageSize: 1000 })
  const monthly: number[] = Array(12).fill(0)
  data.invoices.forEach((f: any) => {
    const date = new Date(f.invoice_date)
    if (date.getFullYear() === currentYear) {
      monthly[date.getMonth()] += Number(f.total_amount)
    }
  })
  monthlyEarnings.value = monthly
})
//
</script>
