<script setup lang="ts">
import { ref } from 'vue'
import InvoicesTable from './widgets/InvoicesTable.vue'
import { useInvoices } from './composables/useInvoices'

// Usamos el nuevo composable para obtener los datos y la lógica
const { invoices, isLoading, filters, pagination } = useInvoices()

const statusOptions = [
  { value: 'PENDIENTE', text: 'Pendiente' },
  { value: 'PAGADA', text: 'Pagada' },
  { value: 'VENCIDA', text: 'Vencida' },
  { value: 'CANCELADA', text: 'Cancelada' },
]
</script>

<template>
  <h1 class="page-title">Facturación de Clientes</h1>
  <VaCard>
    <VaCardContent>
      <div class="flex flex-col md:flex-row gap-4 mb-4 justify-between">
        <div class="flex flex-col md:flex-row gap-4 justify-start">
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

      <InvoicesTable :invoices="invoices" :loading="isLoading" />

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
        <VaPagination v-model="pagination.page" :total="pagination.total" :page-size="pagination.perPage" />
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
</style>
