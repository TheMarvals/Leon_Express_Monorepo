<script setup lang="ts">
import DeliveriesTable from './widgets/DeliveriesTable.vue'
import { useDeliveries } from './composables/useDeliveries'

const { deliveries, isLoading, filters, sorting, pagination } = useDeliveries()
</script>

<template>
  <h1 class="page-title">Historial de Entregas</h1>
  <VaCard>
    <VaCardContent>
      <div class="flex flex-col md:flex-row gap-2 mb-2 justify-between">
        <VaInput v-model="filters.search" placeholder="Buscar por tracking o destinatario...">
          <template #prependInner>
            <FontAwesomeIcon icon="search" style="color: #6c757d; font-size: 1rem; margin-right: 4px" />
          </template>
        </VaInput>
      </div>

      <div class="table-wrapper">
        <DeliveriesTable
          v-model:sort-by="sorting.sortBy"
          v-model:sorting-order="sorting.sortingOrder"
          :deliveries="deliveries"
          :loading="isLoading"
          :pagination="pagination"
        />
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

/* Wrapper de la tabla con scroll */
.table-wrapper {
  width: 100%;
  max-height: 70vh;
  overflow: auto;
  position: relative;
}

/* Estilos para móvil */
@media (max-width: 768px) {
  .table-wrapper {
    max-height: 60vh;
  }
}

/* Mejorar el scroll */
.table-wrapper::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.table-wrapper::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 5px;
}

.table-wrapper::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 5px;
}

.table-wrapper::-webkit-scrollbar-thumb:hover {
  background: #555;
}

/* Para Firefox */
.table-wrapper {
  scrollbar-width: thin;
  scrollbar-color: #888 #f1f1f1;
}
</style>
