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
      <section class="flex flex-col items-start w-full sm:w-1/3 md:w-2/5 lg:w-1/4 gap-2 md:gap-8 pl-4">
        <div>
          <p class="text-xl font-semibold">{{ formatMoney(totalEarnings) }}</p>
          <p class="whitespace-nowrap mt-2">Total earnings</p>
        </div>
        <div class="flex flex-col sm:flex-col gap-2 md:gap-8 w-full">
          <div>
            <div class="flex items-center">
              <span class="inline-block w-2 h-2 mr-2 -ml-4" :style="{ backgroundColor: earningsColor }"></span>
              <span class="text-secondary">Earnings this month</span>
            </div>
            <div class="mt-2 text-xl font-semibold">{{ formatMoney(earningsForSelectedMonth.earning) }}</div>
          </div>
          <div>
            <div class="flex items-center">
              <span class="inline-block w-2 h-2 mr-2 -ml-4" :style="{ backgroundColor: expensesColor }"></span>
              <span class="text-secondary">Expense this month</span>
            </div>
            <div class="mt-2 text-xl font-semibold">{{ formatMoney(earningsForSelectedMonth.expenses) }}</div>
          </div>
        </div>
      </section>
      <div class="revenue-chart-container">
        <RevenueReportChart :revenues="revenues" :months="months" />
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue'
import { VaCard } from 'vuestic-ui'
import api from '@/services/api'
import RevenueReportChart from './RevenueReportChart.vue'
import { downloadAsCSV } from '../../../../services/toCSV'

const props = defineProps({
  userId: {
    type: String,
    required: true,
  },
})

const revenues = ref<{ month: string; earning: number; expenses: number }[]>([])
const months = ref<string[]>([])
const loading = ref(true)
const selectedMonth = ref('')
const monthsWithCurrentYear = ref<string[]>([])

const earningsForSelectedMonth = computed(() => {
  const month = selectedMonth.value.split(' ')[0]
  return revenues.value.find((revenue) => revenue.month === month) || { earning: 0, expenses: 0 }
})

const totalEarnings = computed(() => {
  return earningsForSelectedMonth.value.earning + earningsForSelectedMonth.value.expenses
})

const fetchRevenues = async () => {
  try {
    const { data } = await api.getDriverPayouts({ userId: props.userId, pageSize: 1000 })
    const monthlyData: { [key: string]: { earning: number; expenses: number } } = {}

    data.payouts.forEach((payout: any) => {
      const date = new Date(payout.payout_date || payout.created_at)
      const monthKey = date.toLocaleString('en-US', { month: 'short' })

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { earning: 0, expenses: 0 }
      }

      monthlyData[monthKey].earning += Number(payout.total_amount || 0)
    })

    const currentYear = new Date().getFullYear()
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    months.value = monthNames
    monthsWithCurrentYear.value = monthNames.map((month) => `${month} ${currentYear}`)

    revenues.value = monthNames.map((month) => ({
      month,
      earning: monthlyData[month]?.earning || 0,
      expenses: monthlyData[month]?.expenses || 0,
    }))

    if (!selectedMonth.value && monthsWithCurrentYear.value.length > 0) {
      const currentMonth = new Date().toLocaleString('en-US', { month: 'short' })
      selectedMonth.value = `${currentMonth} ${currentYear}`
    }
  } catch (error) {
    console.error('Error fetching revenues:', error)
  } finally {
    loading.value = false
  }
}

const formatMoney = (value: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

const earningsColor = '#4caf50'
const expensesColor = '#f44336'

onMounted(fetchRevenues)

const exportAsCSV = () => {
  downloadAsCSV(revenues.value, 'revenue-report')
}
</script>

<style scoped>
.revenue-chart-container {
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  height: 340px;
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
