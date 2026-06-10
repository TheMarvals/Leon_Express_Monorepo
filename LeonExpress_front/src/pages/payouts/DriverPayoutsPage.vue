<script setup lang="ts">
import PayoutsTable from './widgets/PayoutsTable.vue'
import { usePayouts } from './composables/usePayouts'

const { payouts, isLoading, filters, pagination } = usePayouts()

const statusOptions = [
  { value: 'PENDIENTE', text: 'Pendiente' },
  { value: 'PAGADO', text: 'Pagado' },
  { value: 'CANCELADO', text: 'Cancelado' },
]
</script>

<template>
  <h1 class="page-title">Liquidaciones de Conductores</h1>
  <VaCard class="full-width-card">
    <VaCardContent>
      <div class="flex flex-col md:flex-row gap-2 mb-2 justify-between">
        <div class="flex flex-col md:flex-row gap-2 justify-start">
          <!-- <VaInput v-model="filters.search" placeholder="Buscar...">
                        <template #prependInner>
                            <font-awesome-icon icon="search" style="color: #6c757d; font-size: 1rem; margin-right: 4px;" />
                        </template>
                    </VaInput> -->
          <VaSelect
            v-model="filters.status"
            placeholder="Filtrar por estado"
            :options="statusOptions"
            text-by="text"
            value-by="value"
            clearable
          />
        </div>
      </div>
      <PayoutsTable :payouts="payouts" :loading="isLoading" />
      <div class="flex flex-col-reverse md:flex-row gap-2 justify-between items-center py-2">
        <div>
          <b>{{ pagination.total }} resultados.</b>
          Resultados por página
          <VaSelect
            v-model="pagination.perPage"
            class="!w-20"
            :options="[10, 50, 100]"
            placeholder="Resultados por página"
          />
        </div>
      </div>
    </VaCardContent>
  </VaCard>
</template>

<style scoped>
.page-title {
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 1rem;
}

.full-width-card {
  width: 100%;
  max-width: 100%;
  display: block;
}
</style>
