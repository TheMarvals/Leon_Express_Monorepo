<script setup lang="ts">
import { defineVaDataTableColumns } from 'vuestic-ui'
import { Delivery } from '../types'
import { PropType } from 'vue'

defineProps<{
  deliveries: Delivery[]
  loading: boolean
}>()

const statusColors: Record<string, string> = {
  ENTREGADO: 'success',
  NO_HAY_NADIE: 'danger',
  DIRECCION_INCORRECTA: 'danger',
  RECHAZADO_POR_CLIENTE: 'danger',
  REPROGRAMADO_POR_CLIENTE: 'info',
  OTRA_INCIDENCIA: 'danger',
}

const columns = defineVaDataTableColumns([
  { label: 'TRACKING', key: 'package.tracking_code', sortable: true },
  { label: 'CÓDIGO EXTERNO', key: 'package.external_tracking_code', sortable: true },
  { label: 'DESTINATARIO', key: 'package.recipient_name', sortable: true },
  { label: 'CONDUCTOR', key: 'user.full_name', sortable: true },
  { label: 'RESULTADO', key: 'status_at_delivery', sortable: true },
  { label: 'FECHA INTENTO', key: 'attempted_at', sortable: true },
])

const formatDate = (dateString: string) => new Date(dateString).toLocaleString('es-CL')
</script>

<template>
  <VaDataTable :columns="columns" :items="deliveries" :loading="loading" :per-page="100" sticky-header>
    <template #cell(status_at_delivery)="{ value }">
      <VaBadge :text="value.replace(/_/g, ' ')" :color="statusColors[value] || 'secondary'" />
    </template>
    <template #cell(attempted_at)="{ value }">
      {{ formatDate(value) }}
    </template>
  </VaDataTable>
</template>
