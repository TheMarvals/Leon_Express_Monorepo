<template>
  <VaModal
    v-model="isOpen"
    title="Fusionar Cuentas de Clientes"
    hide-default-actions
    size="medium"
    :no-dismiss="isMerging"
  >
    <div class="flex flex-col gap-4 py-1">
      <VaAlert color="warning" dense>
        Esta acción unifica dos clientes en uno solo. Todos los paquetes, colectas, tiendas de Mercado Libre y usuarios del cliente origen se transferirán al cliente principal, y el cliente origen quedará desactivado.
      </VaAlert>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <VaSelect
            v-model="sourceClientId"
            :options="sourceClientOptions"
            value-by="value"
            text-by="text"
            label="Cliente Duplicado (Origen)"
            placeholder="Selecciona el cliente a vaciar"
            searchable
            clearable
            :disabled="isMerging"
            @update:modelValue="onClientsChange"
          />
          <span class="text-xs text-secondary mt-1 block">
            Este cliente será vaciado y desactivado.
          </span>
        </div>

        <div>
          <VaSelect
            v-model="targetClientId"
            :options="targetClientOptions"
            value-by="value"
            text-by="text"
            label="Cliente Principal (Destino)"
            placeholder="Selecciona el cliente que conservará todo"
            searchable
            clearable
            :disabled="isMerging || !sourceClientId"
            @update:modelValue="onClientsChange"
          />
          <span class="text-xs text-secondary mt-1 block">
            Este cliente absorberá todos los registros.
          </span>
        </div>
      </div>

      <!-- Preview de Fusión -->
      <div v-if="isLoadingPreview" class="p-4 flex items-center justify-center gap-2 border rounded-lg bg-gray-50">
        <VaProgressCircle indeterminate size="small" />
        <span class="text-sm text-secondary">Calculando registros a transferir...</span>
      </div>

      <div
        v-else-if="previewData"
        class="border rounded-lg p-3 bg-gray-50 flex flex-col gap-2"
      >
        <div class="text-sm font-bold text-gray-700 border-b pb-1">
          Resumen de la transferencia:
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
          <div class="bg-white p-2 rounded border">
            <div class="text-xs text-secondary">Paquetes</div>
            <div class="text-lg font-bold text-primary">{{ previewData.packages_count }}</div>
          </div>
          <div class="bg-white p-2 rounded border">
            <div class="text-xs text-secondary">Colectas</div>
            <div class="text-lg font-bold text-primary">{{ previewData.pickups_count }}</div>
          </div>
          <div class="bg-white p-2 rounded border">
            <div class="text-xs text-secondary">Cuentas ML</div>
            <div class="text-lg font-bold text-warning">{{ previewData.ml_accounts.length }}</div>
          </div>
          <div class="bg-white p-2 rounded border">
            <div class="text-xs text-secondary">Usuarios Portal</div>
            <div class="text-lg font-bold text-primary">{{ previewData.users_count }}</div>
          </div>
        </div>

        <div v-if="previewData.ml_accounts.length > 0" class="text-xs text-secondary mt-1">
          <strong>Tiendas de Mercado Libre vinculadas:</strong>
          <span
            v-for="acc in previewData.ml_accounts"
            :key="acc.id"
            class="inline-block bg-yellow-100 text-yellow-800 rounded px-2 py-0.5 ml-1 mt-1 font-medium"
          >
            {{ acc.nickname }}
          </span>
        </div>

        <div class="text-xs text-danger mt-1 bg-red-50 p-2 rounded border border-red-200">
          Al confirmar, <strong>{{ sourceClientName }}</strong> se renombrará a
          <strong>[FUSIONADO] {{ sourceClientName }}</strong> y quedará inactivo.
        </div>
      </div>

      <div class="flex justify-end gap-2 pt-2 border-t">
        <VaButton preset="secondary" :disabled="isMerging" @click="isOpen = false">
          Cancelar
        </VaButton>
        <VaButton
          color="warning"
          :loading="isMerging"
          :disabled="!sourceClientId || !targetClientId || sourceClientId === targetClientId"
          @click="handleMerge"
        >
          Confirmar Fusión
        </VaButton>
      </div>
    </div>
  </VaModal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useModal, useToast } from 'vuestic-ui'
import api from '../../../services/api'
import { Client } from '../types'

interface Props {
  modelValue: boolean
  clients: Client[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'merged'): void
}>()

const { confirm } = useModal()
const { init: notify } = useToast()

const isOpen = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
})

const sourceClientId = ref<string>('')
const targetClientId = ref<string>('')
const isMerging = ref(false)
const isLoadingPreview = ref(false)
const clientList = ref<Client[]>([])
const isLoadingClients = ref(false)

const loadClients = async () => {
  isLoadingClients.value = true
  try {
    const res = await api.getClients({ perPage: 300, isActive: 'all' })
    const items = res.data?.clients || res.data || []
    clientList.value = items
  } catch (err) {
    clientList.value = props.clients || []
  } finally {
    isLoadingClients.value = false
  }
}

watch(isOpen, (newVal) => {
  if (newVal) {
    loadClients()
  }
})

const effectiveClients = computed(() => {
  return clientList.value.length > 0 ? clientList.value : props.clients
})

const previewData = ref<{
  packages_count: number
  pickups_count: number
  users_count: number
  invoices_count: number
  ml_accounts: Array<{ id: string; nickname: string }>
} | null>(null)

const sourceClientOptions = computed(() => {
  return effectiveClients.value.map((c) => ({
    value: c.client_id,
    text: `${c.client_name}${c.is_active === false ? ' (Inactivo)' : ''}`,
  }))
})

const targetClientOptions = computed(() => {
  return effectiveClients.value
    .filter((c) => c.client_id !== sourceClientId.value && c.is_active !== false)
    .map((c) => ({
      value: c.client_id,
      text: c.client_name,
    }))
})

const sourceClientName = computed(() => {
  const c = effectiveClients.value.find((item) => item.client_id === sourceClientId.value)
  return c ? c.client_name : ''
})

const targetClientName = computed(() => {
  const c = effectiveClients.value.find((item) => item.client_id === targetClientId.value)
  return c ? c.client_name : ''
})

const onClientsChange = async () => {
  previewData.value = null
  if (!sourceClientId.value || !targetClientId.value || sourceClientId.value === targetClientId.value) {
    return
  }

  isLoadingPreview.value = true
  try {
    const res = await api.getClientMergePreview(sourceClientId.value, targetClientId.value)
    previewData.value = res.data.preview
  } catch (err: any) {
    notify({
      message: err.response?.data?.error || 'Error al obtener vista previa de fusión',
      color: 'danger',
    })
  } finally {
    isLoadingPreview.value = false
  }
}

const handleMerge = async () => {
  if (!sourceClientId.value || !targetClientId.value) return

  const ok = await confirm({
    title: 'Confirmar Fusión Definitiva',
    message: `¿Estás completamente seguro de fusionar "${sourceClientName.value}" en "${targetClientName.value}"? Esta acción transferirá todos los paquetes, colectas y cuentas de ML, y desactivará al cliente origen.`,
    okText: 'Sí, fusionar clientes',
    cancelText: 'Cancelar',
  })
  if (!ok) return

  isMerging.value = true
  try {
    const res = await api.mergeClients(sourceClientId.value, targetClientId.value)
    notify({
      message: res.data.message || 'Clientes fusionados exitosamente',
      color: 'success',
      duration: 5000,
    })
    isOpen.value = false
    sourceClientId.value = ''
    targetClientId.value = ''
    previewData.value = null
    emit('merged')
  } catch (err: any) {
    notify({
      message: err.response?.data?.error || 'Error al fusionar clientes',
      color: 'danger',
      duration: 6000,
    })
  } finally {
    isMerging.value = false
  }
}
</script>
