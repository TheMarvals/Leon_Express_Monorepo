<script setup lang="ts">
import { defineVaDataTableColumns, useModal } from 'vuestic-ui'
import { Client } from '../types'
import { PropType, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Pagination } from '../../../data/pages/clients'

const columns = defineVaDataTableColumns([
  { label: 'Nombre', key: 'client_name', sortable: true },
  { label: 'Correo', key: 'email', sortable: true },
  { label: 'Teléfono', key: 'phone', sortable: true },
  { label: 'Dirección', key: 'address', sortable: true },
  { label: ' ', key: 'actions', align: 'right' },
])

const props = defineProps({
  clients: {
    type: Array as PropType<Client[]>,
    required: true,
  },
  loading: { type: Boolean, default: false },
  pagination: { type: Object as PropType<Pagination>, required: true },
})

const emit = defineEmits<{
  (event: 'edit-client', client: Client): void
  (event: 'delete-client', client: Client): void
}>()

const { confirm } = useModal()

const onClientDelete = async (client: Client) => {
  const agreed = await confirm({
    title: 'Eliminar cliente',
    message: `¿Estás seguro de eliminar a ${client.client_name}?`,
    okText: 'Eliminar',
    cancelText: 'Cancelar',
    size: 'small',
    maxWidth: '380px',
  })

  if (agreed) {
    emit('delete-client', client)
  }
}
</script>

<template>
  <VaDataTable :columns="columns" :items="clients" :loading="loading" :per-page="100" sticky-header>
    <template #cell(client_name)="{ rowData }">
      <div class="max-w-[200px] ellipsis">
        {{ rowData.client_name }}
      </div>
    </template>

    <template #cell(email)="{ rowData }">
      <div class="ellipsis max-w-[200px]">
        {{ rowData.email || 'N/A' }}
      </div>
    </template>

    <template #cell(phone)="{ rowData }">
      <div class="ellipsis max-w-[150px]">
        {{ rowData.phone || 'N/A' }}
      </div>
    </template>

    <template #cell(address)="{ rowData }">
      <div class="ellipsis max-w-[300px]">
        {{ rowData.address || 'N/A' }}
      </div>
    </template>

    <template #cell(actions)="{ rowData }">
      <div class="flex gap-2 justify-end">
        <VaButton
          preset="primary"
          size="small"
          icon="fa4-edit"
          aria-label="Editar cliente"
          @click="$emit('edit-client', rowData as Client)"
        />

        <RouterLink :to="{ name: 'client-pricing', params: { id: rowData.client_id } }">
          <VaButton preset="primary" size="small" icon="fa4-money-bill" aria-label="Ver Precios" />
        </RouterLink>

        <VaButton
          preset="primary"
          size="small"
          icon="fa4-trash"
          color="danger"
          aria-label="Eliminar cliente"
          @click="onClientDelete(rowData as Client)"
        />
      </div>
    </template>
  </VaDataTable>

  <div class="flex flex-col-reverse md:flex-row gap-2 justify-between items-center py-2">
    <div>
      <b>{{ pagination.total }} resultados.</b>
      Resultados por página
      <VaSelect v-model="pagination.perPage" class="!w-20" :options="[10, 50, 100]" />
    </div>
  </div>
</template>
