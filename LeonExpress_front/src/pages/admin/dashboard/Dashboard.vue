<script lang="ts" setup>
import AdminStatsSection from './AdminStatsSection.vue'
import RevenueReport from './cards/RevenueReport.vue'
import YearlyBreakup from './cards/YearlyBreakup.vue'
import MonthlyEarnings from './cards/MonthlyEarnings.vue'
import RevenueByComuna from './cards/RevenueByComuna.vue'
import Timeline from './cards/Timeline.vue'
</script>

<template>
  <section class="flex flex-col gap-6">
    <header>
      <h1 class="page-title">Dashboard administrativo</h1>
      <p class="page-subtitle">Resumen operativo y financiero de Leon Express</p>
    </header>
    <AdminStatsSection />
    <div class="flex flex-col gap-4 lg:flex-row">
      <RevenueReport class="w-full lg:w-2/3 flex-1" />
      <div class="flex w-full flex-col gap-4 lg:w-1/3">
        <YearlyBreakup />
        <MonthlyEarnings />
      </div>
    </div>
    <div class="flex flex-col gap-4 md:flex-row">
      <RevenueByComuna class="w-full md:w-2/3" />
      <Timeline class="w-full md:w-1/3" />
    </div>
  </section>
</template>

<style scoped>
.page-title {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0;
}

.page-subtitle {
  color: var(--va-on-background-secondary, #64748b);
  margin-top: 0.25rem;
  font-size: 0.875rem;
}
</style>
