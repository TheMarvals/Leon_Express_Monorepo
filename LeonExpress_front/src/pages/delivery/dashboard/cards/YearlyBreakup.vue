<template>
  <VaCard>
    <VaCardTitle class="pb-0!">
      <h1 class="card-title text-secondary font-bold uppercase">Ganancias Anuales</h1>
    </VaCardTitle>
    <VaCardContent class="flex flex-row gap-1">
      <section class="w-1/2">
        <div class="text-xl font-bold mb-2">{{ formatMoney(yearlyEarnings) }}</div>
        <p class="text-xs text-success whitespace-nowrap">
          <FontAwesomeIcon :icon="percentChange >= 0 ? 'arrow-up' : 'arrow-down'" style="margin-right: 4px" />
          {{ percentChange }}%
          <span class="text-secondary"> respecto al año pasado</span>
        </p>
        <div class="my-4 gap-2 flex flex-col">
          <div class="flex items-center">
            <span class="inline-block w-2 h-2 mr-2" :style="{ backgroundColor: earningsBackground }"></span>
            <span class="text-secondary">Este año</span>
          </div>
          <div class="flex items-center">
            <span class="inline-block w-2 h-2 mr-2" :style="{ backgroundColor: profitBackground }"></span>
            <span class="text-secondary">Año pasado</span>
          </div>
        </div>
      </section>
      <div class="w-1/2 flex items-center h-full flex-1 lg:pl-16 pl-2 -mr-1">
        <VaChart
          v-if="chartData"
          :data="chartData"
          class="chart chart--donut h-[90px] w-[90px]"
          type="doughnut"
          :options="options"
        />
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup lang="ts">
import { VaCard } from 'vuestic-ui'
import VaChart from '../../../../components/va-charts/VaChart.vue'
import { doughnutChartData, profitBackground, earningsBackground } from '../../../../data/charts/doughnutChartData'
import { doughnutConfig } from '../../../../components/va-charts/vaChartConfigs'
import { ChartOptions } from 'chart.js'
import { externalTooltipHandler } from '../../../../components/va-charts/external-tooltip'
import { ref, computed, onMounted } from 'vue'
import api from '@/services/api'

const props = defineProps({
  userId: {
    type: String,
    required: true,
  },
})

const yearlyEarnings = ref(0)
const lastYearEarnings = ref(0)
const loading = ref(true)

const formatMoney = (value: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

onMounted(async () => {
  loading.value = true
  try {
    const { data } = await api.getDriverPayouts({ userId: props.userId, pageSize: 1000 })
    const currentYear = new Date().getFullYear()
    const previousYear = currentYear - 1

    let earningsThisYear = 0
    let earningsLastYear = 0

    data.payouts.forEach((p: any) => {
      const year = new Date(p.payout_date || p.created_at).getFullYear()
      const amount = Number(p.total_amount || 0)
      if (year === currentYear) {
        earningsThisYear += amount
      } else if (year === previousYear) {
        earningsLastYear += amount
      }
    })

    yearlyEarnings.value = earningsThisYear
    lastYearEarnings.value = earningsLastYear
  } catch (error) {
    console.error('Error fetching yearly earnings:', error)
  } finally {
    loading.value = false
  }
})

const percentChange = computed(() => {
  if (lastYearEarnings.value === 0) {
    return yearlyEarnings.value > 0 ? 100 : 0
  }
  return ((yearlyEarnings.value - lastYearEarnings.value) / lastYearEarnings.value) * 100
})

const chartData = computed(() => ({
  labels: ['Este año', 'Año pasado'],
  datasets: [
    {
      data: [yearlyEarnings.value, lastYearEarnings.value],
      backgroundColor: [earningsBackground, profitBackground],
    },
  ],
}))

const options: ChartOptions<'doughnut'> = {
  ...doughnutConfig,
  plugins: {
    ...doughnutConfig.plugins,
    tooltip: {
      // Chart to small to show tooltips
      enabled: false,
      position: 'nearest',
      external: externalTooltipHandler,
    },
  },
}
</script>
