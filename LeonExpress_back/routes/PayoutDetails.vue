<template>
  <div v-if="loading" class="text-center py-12">Cargando detalles del pago...</div>
  <div v-else-if="!payout" class="text-center py-12 text-danger">No se encontró el pago.</div>
  <div v-else>
    <h1 class="page-title font-bold">Detalle de Pago</h1>

    <!-- Resumen del Pago -->
    <VaCard class="mb-6">
      <VaCardTitle>Resumen</VaCardTitle>
      <VaCardContent>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div class="text-secondary">Conductor</div>
            <div class="font-bold">{{ payout.user.full_name }}</div>
          </div>
          <div>
            <div class="text-secondary">Fecha de Pago</div>
            <div class="font-bold">{{ new Date(payout.payout_date).toLocaleDateString() }}</div>
          </div>
          <div>
            <div class="text-secondary">Monto Total</div>
            <div class="font-bold text-lg text-primary">{{ formatMoney(payout.total_amount) }}</div>
          </div>
          <div>
            <div class="text-secondary">Estado</div>
            <VaChip :color="getStatusColor(payout.status)">{{ payout.status }}</VaChip>
          </div>
        </div>
      </VaCardContent>
    </VaCard>

    <!-- Desglose de Items -->
    <VaCard>
      <VaCardTitle>Desglose</VaCardTitle>
      <VaCardContent>
        <VaDataTable :items="payout.payoutItems" :columns="columns" :no-data-label="'No hay ítems en este pago.'">
          <template #cell(amount)="{ value }">
            <span :class="value >= 0 ? 'text-success' : 'text-danger'">
              {{ formatMoney(value) }}
            </span>
          </template>
          <template #cell(created_at)="{ value }">
            {{ new Date(value).toLocaleString() }}
          </template>
        </VaDataTable>
      </VaCardContent>
    </VaCard>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { defineVaDataTableColumns } from 'vuestic-ui';
import { formatMoney } from '@/utils/formatters';

const route = useRoute();
const payout = ref<any>(null);
const loading = ref(true);

const columns = defineVaDataTableColumns([
  { label: 'Fecha', key: 'created_at', sortable: true },
  { label: 'Descripción', key: 'item_description', sortable: true },
  { label: 'Monto', key: 'amount', sortable: true, align: 'right' },
]);

onMounted(async () => {
  const payoutId = route.params.id as string;
  loading.value = true;
  try {
    const { data } = await api.getPayoutDetails(payoutId);
    payout.value = data;
  } catch (error) {
    console.error('Error fetching payout details:', error);
  } finally {
    loading.value = false;
  }
});

const getStatusColor = (status: string) => {
  switch (status) {
    case 'PAGADO': return 'success';
    case 'PENDIENTE': return 'warning';
    case 'CANCELADO': return 'danger';
    default: return 'secondary';
  }
};
</script>