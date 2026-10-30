<script setup lang="ts">
import { computed, PropType } from 'vue'
import { defineVaDataTableColumns, useModal } from 'vuestic-ui'
import { Client } from '../types'
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

const totalPages = computed(() => {
  if (!props.pagination.perPage || !props.pagination.total) return 1
  return Math.ceil(props.pagination.total / props.pagination.perPage)
})

const emit = defineEmits<{
  (event: 'edit-client', client: Client): void
  (event: 'portal-access', client: Client): void
  (event: 'update:per-page', perPage: number): void
  (event: 'update:page', page: number): void
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
  <VaDataTable
    no-data-html="No se encontraron clientes."
    :columns="columns"
    :items="clients"
    :loading="loading"
    sticky-header
  >
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
          icon="login"
          aria-label="Acceso al portal"
          title="Acceso al portal"
          @click="$emit('portal-access', rowData as Client)"
        />
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
    <div class="flex items-center gap-2 text-sm">
      <b>{{ pagination.total }} resultados.</b>
      <span>Resultados por página</span>
      <VaSelect
        :model-value="pagination.perPage"
        class="!w-24"
        :options="[25, 50, 100, 200]"
        @update:modelValue="$emit('update:per-page', $event)"
      />
    </div>
    <VaPagination
      v-if="totalPages > 1"
      :model-value="pagination.page"
      :pages="totalPages"
      :visible-pages="5"
      buttons-preset="secondary"
      @update:modelValue="$emit('update:page', $event)"
    />
  </div>
</template>
