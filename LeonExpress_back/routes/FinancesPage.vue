<template>
  <h1 class="page-title font-bold">Finanzas</h1>

  <VaCard>
    <VaCardTitle class="flex justify-between">
      <h2 class="card-title text-lg font-bold">Historial de Pagos</h2>
    </VaCardTitle>
    <VaCardContent>
      <div v-if="loading" class="text-center py-8">Cargando...</div>
      <div v-else-if="payouts.length === 0" class="text-center py-4 text-secondary">No se encontraron pagos.</div>
      <VaDataTable
        v-else
        :items="payouts"
        :columns="columns"
        hoverable
        @row:click="goToDetails"
        class="cursor-pointer"
      >
        <template #cell(payout_date)="{ value }">
          {{ new Date(value).toLocaleDateString() }}
        </template>
        <template #cell(total_amount)="{ value }">
          <span class="font-semibold">{{ formatMoney(value) }}</span>
        </template>
        <template #cell(status)="{ value }">
          <VaChip :color="getStatusColor(value)">{{ value }}</VaChip>
        </template>
      </VaDataTable>
    </VaCardContent>
  </VaCard>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/services/api';
import { useUserStore } from '@/stores/user-store';
import { defineVaDataTableColumns } from 'vuestic-ui';
import { formatMoney } from '@/utils/formatters';

const router = useRouter();
const userStore = useUserStore();
const payouts = ref<any[]>([]);
const loading = ref(true);

const isAdmin = computed(() => userStore.role === 'ADMIN');

const columns = computed(() => defineVaDataTableColumns([
  ...(isAdmin.value ? [{ label: 'Conductor', key: 'user.full_name', sortable: true }] : []),
  { label: 'Fecha de Pago', key: 'payout_date', sortable: true },
  { label: 'Monto Total', key: 'total_amount', sortable: true, align: 'right' },
  { label: 'Estado', key: 'status', sortable: true, align: 'center' },
]));

onMounted(async () => {
  loading.value = true;
  try {
    const { data } = await api.getDriverPayouts({ pageSize: 50 });
    payouts.value = data.payouts;
  } catch (error) {
    console.error('Error fetching payouts:', error);
  } finally {
    loading.value = false;
  }
});

const goToDetails = (event: any) => {
  const payoutId = event.item.payout_id;
  router.push({ name: 'finance-details', params: { id: payoutId } });
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'PAGADO': return 'success';
    case 'PENDIENTE': return 'warning';
    case 'CANCELADO': return 'danger';
    default: return 'secondary';
  }
};
</script>