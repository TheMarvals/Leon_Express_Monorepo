<template>
  <VaCard class="flex flex-col">
    <VaCardTitle class="flex items-start justify-between">
      <h1 class="card-title text-secondary font-bold uppercase">Revenue Report</h1>
      <div class="flex gap-2">
        <VaSelect v-model="selectedMonth" preset="small" :options="monthsWithCurrentYear" class="w-24" />
        <VaButton class="h-2" size="small" preset="primary" @click="exportAsCSV">Export</VaButton>
      </div>
    </VaCardTitle>
    <VaCardContent class="flex flex-col-reverse md:flex-row md:items-center justify-between gap-5 h-full">
      <section
        :key="selectedMonth"
        class="flex flex-col items-start w-full sm:w-1/3 md:w-2/5 lg:w-1/4 gap-2 md:gap-8 pl-4"
      >
        <div>
          <p class="text-xl font-semibold">{{ formatMoney(totalEarnings) }}</p>
          <p class="whitespace-nowrap mt-2">Utilidad neta</p>
        </div>
        <div class="flex flex-col sm:flex-col gap-2 md:gap-8 w-full">
          <div>
            <div class="flex items-center">
              <span class="inline-block w-2 h-2 mr-2 -ml-4" :style="{ backgroundColor: earningsColor }"></span>
              <span class="text-secondary">Ingresos del mes</span>
            </div>
            <div class="mt-2 text-xl font-semibold">{{ formatMoney(earningsForSelectedMonth.earning) }}</div>
          </div>
          <div>
            <div class="flex items-center">
              <span class="inline-block w-2 h-2 mr-2 -ml-4" :style="{ backgroundColor: expensesColor }"></span>
              <span class="text-secondary">Gastos del mes</span>
            </div>
            <div class="mt-2 text-xl font-semibold">{{ formatMoney(earningsForSelectedMonth.expenses) }}</div>
          </div>
        </div>
      </section>
      <RevenueReportChart
        class="w-2/3 md:w-3/5 lg:w-3/4 h-full min-h-72 sm:min-h-32 pt-4"
        :revenues="revenues"
        :months="months"
      />
    </VaCardContent>
  </VaCard>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue'
import { VaCard } from 'vuestic-ui'
import RevenueReportChart from './RevenueReportChart.vue'
import { downloadAsCSV } from '../../../../services/toCSV'
import { earningsColor, expensesColor, months, formatMoney } from '../../../../data/charts/revenueChartData'
import api from '@/services/api'

type Revenues = { month: string; earning: number; expenses: number }

const revenues = ref<Revenues[]>([])
const currentYear = new Date().getFullYear()
const monthsWithCurrentYear = months.map((month) => `${month} ${currentYear}`)
const selectedMonth = ref(monthsWithCurrentYear[new Date().getMonth()])

const fetchRevenues = async () => {
  // Obtener todas las facturas del año actual
  const { data: invoiceData } = await api.getClientInvoices({ page: 1, pageSize: 1000 })
  // Obtener todos los pagos a drivers del año actual
  const { data: payoutData } = await api.getDriverPayouts({ page: 1, pageSize: 1000 })

  // Agrupar por mes
  const monthly: Record<string, { earning: number; expenses: number }> = {}
  months.forEach((m) => (monthly[m] = { earning: 0, expenses: 0 }))

  invoiceData.invoices.forEach((f: any) => {
    // Evitar problema de timezone agregando hora intermedia
    const dateStr = f.invoice_date.length === 10 ? `${f.invoice_date}T12:00:00` : f.invoice_date
    const date = new Date(dateStr)

    if (date.getFullYear() === currentYear) {
      const month = months[date.getMonth()]
      monthly[month].earning += Number(f.total_amount)
    }
  })

  payoutData.payouts?.forEach((p: any) => {
    // Priorizar payout_date (fecha de corte) sobre created_at
    const rawDate = p.payout_date || p.paid_at || p.created_at
    const dateStr = rawDate && rawDate.length === 10 ? `${rawDate}T12:00:00` : rawDate
    const date = new Date(dateStr)

    if (date.getFullYear() === currentYear) {
      const month = months[date.getMonth()]
      monthly[month].expenses += Number(p.total_amount || p.amount || 0)
    }
  })

  revenues.value = months.map((m) => ({ month: m, earning: monthly[m].earning, expenses: monthly[m].expenses }))
}

onMounted(fetchRevenues)

const earningsForSelectedMonth = computed(() => {
  const month = selectedMonth.value.split(' ')[0]
  return revenues.value.find((r) => r.month === month) || { month, earning: 0, expenses: 0 }
})
const totalEarnings = computed(() => earningsForSelectedMonth.value.earning - earningsForSelectedMonth.value.expenses)

const exportAsCSV = () => {
  downloadAsCSV(revenues.value, 'revenue-report')
}
</script>
