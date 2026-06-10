<script setup lang="ts">
import { defineProps } from 'vue'
import DriverStatsSection from './DriverStatsSection.vue'
import RevenueUpdates from './cards/RevenueReport.vue'
import ProjectTable from './cards/ProjectTable.vue'
import RevenueByComuna from './cards/RegionRevenue.vue'
import DataSection from './DataSection.vue'
import YearlyBreakup from './cards/YearlyBreakup.vue'
import MonthlyEarnings from './cards/MonthlyEarnings.vue'
import DailyEarnings from './cards/DailyEarnings.vue'
import RegionRevenue from './cards/RegionRevenue.vue'
import Timeline from './cards/Timeline.vue'
import PendingPickups from './cards/PendingPickups.vue'

const props = defineProps({
  userId: {
    type: String,
    required: true,
    validator: (val: string) => !!val && val !== 'string',
  },
})
</script>

<template>
  <h1 class="page-title font-bold">Dashboard</h1>
  <section class="flex flex-col gap-4">
    <DriverStatsSection :user-id="userId" />
    <div class="flex flex-col sm:flex-row gap-4">
      <div class="w-full sm:w-[70%] flex flex-col gap-4">
        <RevenueUpdates :user-id="userId" />
      </div>
      <div class="flex flex-col gap-4 w-full sm:w-[30%]">
        <YearlyBreakup :user-id="userId" />
        <MonthlyEarnings :user-id="userId" />
        <DailyEarnings :user-id="userId" />
      </div>
    </div>
    <div class="flex flex-col md:flex-row gap-4">
      <PendingPickups :user-id="userId" class="w-full" />
      <Timeline :user-id="userId" class="w-full" />
    </div>
  </section>
</template>
<style scoped>
.page-title {
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 1rem;
}
</style>
