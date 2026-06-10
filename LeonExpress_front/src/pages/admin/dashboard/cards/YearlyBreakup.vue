<template>
  <VaCard>
    <VaCardTitle class="pb-0!">
      <h1 class="card-title text-secondary font-bold uppercase">Resumen anual</h1>
    </VaCardTitle>
    <VaCardContent class="flex flex-row gap-1">
      <section class="w-1/2">
        <div class="text-xl font-bold mb-2">{{ formatMoney(totalEarnings) }}</div>
        <p class="text-xs text-success whitespace-nowrap">
          <FontAwesomeIcon icon="arrow-up" style="color: #16a34a; margin-right: 4px" />
          {{ percentChange }}%
          <span class="text-secondary"> respecto al año pasado</span>
        </p>
        <div class="my-4 gap-2 flex flex-col">
          <div class="flex items-center">
            <span class="inline-block w-2 h-2 mr-2" :style="{ backgroundColor: earningsBackground }"></span>
            <span class="text-secondary">Ingresos</span>
          </div>
          <div class="flex items-center">
            <span class="inline-block w-2 h-2 mr-2" :style="{ backgroundColor: profitBackground }"></span>
            <span class="text-secondary">Utilidad</span>
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
import { ref, computed, onMounted } from 'vue'
import { VaCard } from 'vuestic-ui'
import VaChart from '../../../../components/va-charts/VaChart.vue'
import { profitBackground, earningsBackground } from '../../../../data/charts/doughnutChartData'
import { doughnutConfig } from '../../../../components/va-charts/vaChartConfigs'
import { ChartOptions } from 'chart.js'
import { externalTooltipHandler } from '../../../../components/va-charts/external-tooltip'
import api from '@/services/api'
import { formatMoney } from '../../../../data/charts/revenueChartData'

const currentYear = new Date().getFullYear()
const lastYear = currentYear - 1

const totalEarnings = ref(0)
const totalExpenses = ref(0)
const totalProfit = computed(() => totalEarnings.value - totalExpenses.value)
const lastYearProfit = ref(0)

const percentChange = computed(() => {
  if (lastYearProfit.value === 0) return '0.0'
  return (((totalProfit.value - lastYearProfit.value) / lastYearProfit.value) * 100).toFixed(2)
})

const chartData = ref({
  labels: ['Utilidad', 'Gastos'],
  datasets: [
    {
      label: 'Resumen anual',
      backgroundColor: [profitBackground, earningsBackground],
      data: [0, 0],
    },
  ],
})

const options: ChartOptions<'doughnut'> = {
  ...doughnutConfig,
  plugins: {
    ...doughnutConfig.plugins,
    tooltip: {
      enabled: false,
      position: 'nearest',
      external: externalTooltipHandler,
    },
  },
}

onMounted(async () => {
  // Obtener facturas y payouts del año actual y anterior
  const [{ data: invoiceData }, { data: payoutData }] = await Promise.all([
    api.getClientInvoices({ page: 1, pageSize: 1000 }),
    api.getDriverPayouts({ page: 1, pageSize: 1000 }),
  ])
  let earnings = 0,
    expenses = 0,
    lastProfit = 0
  invoiceData.invoices.forEach((f: any) => {
    const date = new Date(f.invoice_date)
    if (date.getFullYear() === currentYear) earnings += Number(f.total_amount)
    if (date.getFullYear() === lastYear) lastProfit += Number(f.total_amount)
  })
  payoutData.payouts?.forEach((p: any) => {
    const date = new Date(p.paid_at || p.created_at)
    if (date.getFullYear() === currentYear) expenses += Number(p.total_amount || p.amount || 0)
    if (date.getFullYear() === lastYear) lastProfit -= Number(p.total_amount || p.amount || 0)
  })
  totalEarnings.value = earnings
  totalExpenses.value = expenses
  lastYearProfit.value = lastProfit
  chartData.value = {
    labels: ['Profit', 'Expenses'],
    datasets: [
      {
        label: 'Yearly Breakdown',
        backgroundColor: [profitBackground, earningsBackground],
        data: [earnings - expenses, expenses],
      },
    ],
  }
})
</script>
