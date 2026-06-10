<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useToast, useModal, defineVaDataTableColumns } from 'vuestic-ui'
import mercadolibreService, { MlAccount, MlPendingShipment } from '../../services/mercadolibreService'
import { useClients } from '../clients/composables/useClients'
import api from '../../services/api'

// Toast & Modal
const { init: notify } = useToast()
const { confirm } = useModal()

// Data states
const accounts = ref<MlAccount[]>([])
const pendingShipments = ref<MlPendingShipment[]>([])
const totalShipments = ref(0)
const isLoading = ref(false)

// Selectors / Modal states
const showImportModal = ref(false)
const selectedIds = ref<Set<string>>(new Set())
const selectablePickups = ref<any[]>([])
const targetPickupId = ref<string>('')
const selectedAccountFilter = ref<string>('all')

// Search & Pagination
const searchQuery = ref('')
const perPage = ref(50)
const currentPage = ref(1)

// Debounce search
let searchTimer: ReturnType<typeof setTimeout> | null = null
const debouncedSearch = (val: string) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    currentPage.value = 1
    fetchShipments()
  }, 400)
}
watch(searchQuery, debouncedSearch)
watch(selectedAccountFilter, () => {
  currentPage.value = 1
  fetchShipments()
})
watch(perPage, () => {
  currentPage.value = 1
  fetchShipments()
})
watch(currentPage, fetchShipments)

// === Table columns ===
const shipmentColumns = defineVaDataTableColumns([
  { label: '', key: 'select', width: '40px' },
  { label: 'Tracking ML', key: 'ml_shipment_external_id', sortable: true },
  { label: 'Tipo', key: 'logistic_label', sortable: true },
  { label: 'Cliente', key: 'client_name', sortable: true },
  { label: 'Comprador', key: 'buyer_name', sortable: true },
  { label: 'Dirección', key: 'buyer_address', sortable: true },
  { label: 'Fecha ML', key: 'created_at', sortable: true },
])

const logisticTypeLabels: Record<string, string> = {
  self_service: 'Flex',
  xd_drop_off: 'Agencia / Drop-off',
  cross_docking: 'Colecta',
  default: 'Estándar',
}

// Form Generator
const showLinkModal = ref(false)
const { clients: localClients } = useClients({ filters: ref({ search: '' }) })
const selectedClientForLink = ref<string>('')
const generatedLink = ref<string>('')

// === Helper: resolve client name from account ===
const getClientName = (mlAccountId: string): string => {
  const acc = accounts.value.find((a) => a.ml_account_id === mlAccountId)
  if (!acc) return mlAccountId
  const client = localClients.value?.find((c: any) => c.client_id === acc.client_id)
  return client?.client_name || acc.ml_nickname || mlAccountId
}

// === Table items enriched ===
const tableItems = computed(() => {
  return pendingShipments.value.map((s) => ({
    ...s,
    client_name: getClientName(s.ml_account_id),
    logistic_label: logisticTypeLabels[s.logistic_type] || s.logistic_type || '—',
  }))
})

// === Filter options: show client names ===
const filterOptions = computed(() => {
  const opts = [{ value: 'all', label: 'Todos los Clientes' }]
  for (const acc of accounts.value) {
    const client = localClients.value?.find((c: any) => c.client_id === acc.client_id)
    opts.push({
      value: acc.ml_account_id,
      label: client?.client_name || acc.ml_nickname,
    })
  }
  return opts
})

// === Selection helpers ===
const isSelected = (shipmentId: string) => selectedIds.value.has(shipmentId)
const toggleSelection = (shipmentId: string) => {
  const newSet = new Set(selectedIds.value)
  if (newSet.has(shipmentId)) newSet.delete(shipmentId)
  else newSet.add(shipmentId)
  selectedIds.value = newSet
}
const allPageSelected = computed(() => {
  if (pendingShipments.value.length === 0) return false
  return pendingShipments.value.every((s) => selectedIds.value.has(s.ml_shipment_id))
})
const toggleSelectAll = () => {
  const newSet = new Set(selectedIds.value)
  if (allPageSelected.value) {
    pendingShipments.value.forEach((s) => newSet.delete(s.ml_shipment_id))
  } else {
    pendingShipments.value.forEach((s) => newSet.add(s.ml_shipment_id))
  }
  selectedIds.value = newSet
}
const selectedCount = computed(() => selectedIds.value.size)

// === Address Helper ===
const formatAddress = (rawJson: string) => {
  if (!rawJson) return '—'
  try {
    const addr = JSON.parse(rawJson)
    return `${addr.street_name || ''} ${addr.street_number || ''}, ${addr.city?.name || ''}`.trim() || '—'
  } catch (e) {
    return rawJson || '—'
  }
}

// === Data Fetching ===
async function fetchShipments() {
  isLoading.value = true
  try {
    const params: Record<string, any> = {
      limit: perPage.value,
      offset: (currentPage.value - 1) * perPage.value,
    }
    if (selectedAccountFilter.value !== 'all') params.ml_account_id = selectedAccountFilter.value
    if (searchQuery.value.trim()) params.search = searchQuery.value.trim()

    const data = await mercadolibreService.getPendingShipments(params)
    // Handle both response shapes: { total, shipments } or array
    if (Array.isArray(data)) {
      pendingShipments.value = data
      totalShipments.value = data.length
    } else {
      pendingShipments.value = (data as any).shipments || []
      totalShipments.value = (data as any).total || 0
    }
    lastUpdated.value = new Date()
  } catch (error: any) {
    notify({ message: 'Error al cargar envíos de MercadoLibre', color: 'danger' })
  } finally {
    isLoading.value = false
  }
}

const fetchAccounts = async () => {
  try {
    const accData = await mercadolibreService.getAccounts()
    accounts.value = accData
  } catch (error: any) {
    notify({ message: 'Error al cargar cuentas de MercadoLibre', color: 'danger' })
  }
}

const fetchData = async () => {
  await Promise.all([fetchAccounts(), fetchShipments()])
}

const forceManualSync = async () => {
  isLoading.value = true
  try {
    await mercadolibreService.forceSync()
    notify({ message: 'Sincronización manual forzada correctamente', color: 'success' })
    await fetchData()
  } catch (error: any) {
    notify({ message: 'No se pudo forzar la sincronización', color: 'danger' })
    isLoading.value = false
  }
}

const syncSpecificAccount = async (account: MlAccount) => {
  isLoading.value = true
  try {
    await mercadolibreService.forceSyncAccount(account.ml_account_id)
    notify({ message: `Sincronización manual iniciada para ${account.ml_nickname}`, color: 'success' })
    setTimeout(() => {
      fetchData()
    }, 2000)
  } catch (error: any) {
    notify({ message: `No se pudo forzar la sincronización para ${account.ml_nickname}`, color: 'danger' })
    isLoading.value = false
  }
}

const unlinkAccount = async (account: MlAccount) => {
  const ok = await confirm({
    title: 'Desvincular Cuenta',
    message: `¿Estás seguro de que deseas desvincular la cuenta "${account.ml_nickname}"? Esta acción revocará los tokens de acceso y desactivará la sincronización.`,
    okText: 'Sí, Desvincular',
    cancelText: 'Cancelar',
  })
  if (!ok) return

  try {
    await mercadolibreService.deleteAccount(account.ml_account_id)
    notify({ message: `Cuenta "${account.ml_nickname}" desvinculada exitosamente`, color: 'success' })
    await fetchData()
  } catch (e: any) {
    notify({ message: e.response?.data?.error || 'Error al desvincular la cuenta', color: 'danger' })
  }
}

// === Vincular Cuenta ===
const openLinkModal = () => {
  selectedClientForLink.value = ''
  generatedLink.value = ''
  showLinkModal.value = true
}

const generateLink = async () => {
  if (!selectedClientForLink.value) return notify({ message: 'Seleccione un cliente', color: 'warning' })
  try {
    const res = await mercadolibreService.generateLink(selectedClientForLink.value)
    generatedLink.value = res.link?.url || res.link || ''
    notify({ message: 'Enlace generado con éxito', color: 'success' })
  } catch (e) {
    notify({ message: 'Error generando enlace', color: 'danger' })
  }
}

const copyLink = () => {
  navigator.clipboard.writeText(generatedLink.value)
  notify({ message: 'Enlace copiado al portapapeles', color: 'info' })
}

// === Importar Envíos ===
const openImportModal = async () => {
  if (selectedIds.value.size === 0) {
    return notify({ message: 'Seleccione al menos un paquete para importar', color: 'warning' })
  }

  targetPickupId.value = ''

  try {
    // Resolve client_ids from the selected shipments' ML accounts
    const selectedShipments = pendingShipments.value.filter((s) => selectedIds.value.has(s.ml_shipment_id))
    const clientIds = new Set<string>()
    for (const ship of selectedShipments) {
      const acc = accounts.value.find((a) => a.ml_account_id === ship.ml_account_id)
      if (acc?.client_id) clientIds.add(acc.client_id)
    }

    const res = await api.getPickups({ pageSize: 100, status: 'ASIGNADO_A_RECOLECTOR,EN_PROCESO_RECOLECCION' })
    const allPickups = res.data.pickups || res.data
    const filtered = allPickups.filter((p: any) => clientIds.has(p.client_id))
    selectablePickups.value = filtered.map((p: any) => ({
      ...p,
      _label: `${p.client?.client_name || 'Cliente'} — ${p.user?.full_name || 'Driver'} — ${new Date(
        p.pickup_scheduled_date,
      ).toLocaleDateString()}`,
    }))
    if (selectablePickups.value.length === 0) {
      const clientNames = [...clientIds]
        .map((cid) => {
          const c = localClients.value?.find((cl: any) => cl.client_id === cid)
          return c?.client_name || cid.substring(0, 8)
        })
        .join(', ')
      return notify({
        message: `No hay recolecciones activas para el cliente: ${clientNames}. Cree una primero.`,
        color: 'warning',
      })
    }
    showImportModal.value = true
  } catch (e) {
    notify({ message: 'No se pudieron cargar los Pickups', color: 'danger' })
  }
}

const submitImport = async () => {
  if (!targetPickupId.value) return notify({ message: 'Seleccione un Pickup destino', color: 'warning' })

  try {
    isLoading.value = true
    const shipmentIds = Array.from(selectedIds.value)
    await mercadolibreService.importShipments(shipmentIds, targetPickupId.value)
    notify({ message: 'Paquetes importados exitosamente', color: 'success' })
    showImportModal.value = false
    selectedIds.value = new Set()
    await fetchData()
  } catch (e: any) {
    notify({ message: e.response?.data?.error || 'Falló la importación', color: 'danger' })
  } finally {
    isLoading.value = false
  }
}

// Total pages
const totalPages = computed(() => Math.ceil(totalShipments.value / perPage.value) || 1)

// === Live Polling ===
const POLL_INTERVAL_MS = 60_000 // 60 segundos
const lastUpdated = ref<Date | null>(null)
const lastUpdatedText = computed(() => {
  if (!lastUpdated.value) return ''
  return lastUpdated.value.toLocaleTimeString()
})
let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  fetchData()
  pollTimer = setInterval(() => {
    fetchShipments() // Solo recarga la tabla, no las cuentas
  }, POLL_INTERVAL_MS)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <h1 class="page-title">Integración MercadoLibre</h1>

  <!-- Top Cards -->
  <div class="cards-container grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
    <!-- Cuentas -->
    <VaCard>
      <VaCardTitle>
        Cuentas Vinculadas
        <VaSpacer />
        <VaButton size="small" icon="link" @click="openLinkModal">Vincular Nueva Cuenta</VaButton>
      </VaCardTitle>
      <VaCardContent>
        <VaDataTable
          :items="accounts"
          :columns="['ml_nickname', 'client_id', 'sync_enabled', 'last_sync_at', 'actions']"
          striped
        >
          <template #cell(sync_enabled)="{ value }">
            <VaBadge :text="value ? 'ON' : 'OFF'" :color="value ? 'success' : 'danger'" />
          </template>
          <template #cell(last_sync_at)="{ value }">
            {{ value ? new Date(value).toLocaleString() : 'Nunca' }}
          </template>
          <template #cell(client_id)="{ value }">
            {{ localClients.find((c) => c.client_id === value)?.client_name || value }}
          </template>
          <template #cell(actions)="{ rowData }">
            <VaButton
              size="small"
              preset="plain"
              color="primary"
              icon="sync"
              title="Sincronizar cuenta ahora"
              class="mr-2"
              @click="syncSpecificAccount(rowData as MlAccount)"
            />
            <VaButton
              size="small"
              preset="plain"
              color="danger"
              icon="link_off"
              title="Desvincular cuenta"
              @click="unlinkAccount(rowData as MlAccount)"
            />
          </template>
          <template v-if="accounts.length === 0" #bodyAppend>
            <tr>
              <td colspan="5" class="text-center py-4">No hay cuentas vinculadas. Genera un link para tus clientes.</td>
            </tr>
          </template>
        </VaDataTable>
      </VaCardContent>
    </VaCard>

    <!-- Resumen -->
    <VaCard>
      <VaCardTitle>Status del Gateway</VaCardTitle>
      <VaCardContent>
        <div class="flex flex-col gap-2">
          <div class="text-lg">
            📈 Envíos Pendientes: <strong>{{ totalShipments }}</strong>
          </div>
          <div class="text-sm text-secondary">
            Los envíos deben ser importados hacia un Pickup activo para que el chófer los registre.
          </div>
          <VaButton class="mt-4" color="info" icon="refresh" :loading="isLoading" @click="forceManualSync"
            >Sincronizar Manualmente</VaButton
          >
        </div>
      </VaCardContent>
    </VaCard>
  </div>

  <!-- Pending Shipments Table -->
  <VaCard>
    <VaCardTitle>
      Envíos Listos Para Importar ({{ totalShipments }})
      <span v-if="lastUpdatedText" class="live-badge ml-2">
        <span class="live-dot" />
        Actualizado: {{ lastUpdatedText }}
      </span>
      <VaSpacer />
      <VaButton color="success" icon="get_app" :disabled="selectedCount === 0" @click="openImportModal">
        Importar Seleccionados ({{ selectedCount }})
      </VaButton>
    </VaCardTitle>

    <!-- Barra de búsqueda y filtros -->
    <VaCardContent>
      <div class="flex flex-col md:flex-row gap-3 mb-4">
        <VaInput v-model="searchQuery" placeholder="Buscar por comprador o tracking..." clearable style="flex: 1">
          <template #prependInner>
            <VaIcon name="search" color="secondary" />
          </template>
        </VaInput>
        <VaSelect
          v-model="selectedAccountFilter"
          :options="filterOptions"
          value-by="value"
          text-by="label"
          label="Filtrar por Cliente"
          style="width: 250px"
        />
      </div>

      <VaDataTable :columns="shipmentColumns" :items="tableItems" :loading="isLoading" sticky-header>
        <template #header(select)>
          <VaCheckbox :model-value="allPageSelected" @update:modelValue="toggleSelectAll" />
        </template>

        <template #cell(select)="{ rowData }">
          <VaCheckbox
            :model-value="isSelected(rowData.ml_shipment_id)"
            @update:modelValue="toggleSelection(rowData.ml_shipment_id)"
          />
        </template>

        <template #cell(ml_shipment_external_id)="{ rowData }">
          <div class="ellipsis max-w-[150px]">{{ rowData.ml_shipment_external_id }}</div>
        </template>

        <template #cell(client_name)="{ rowData }">
          <div class="ellipsis max-w-[200px]">{{ rowData.client_name }}</div>
        </template>

        <template #cell(buyer_name)="{ rowData }">
          <div class="ellipsis max-w-[200px]">{{ rowData.buyer_name }}</div>
        </template>

        <template #cell(buyer_address)="{ rowData }">
          <div class="ellipsis max-w-[300px]">{{ formatAddress(rowData.buyer_address) }}</div>
        </template>

        <template #cell(created_at)="{ rowData }">
          {{ new Date(rowData.created_at).toLocaleDateString() }}
        </template>

        <template v-if="!isLoading && tableItems.length === 0" #bodyAppend>
          <tr>
            <td colspan="7" class="text-center py-8 text-secondary">
              {{ searchQuery ? 'No se encontraron envíos con esa búsqueda.' : 'No hay envíos pendientes.' }}
            </td>
          </tr>
        </template>
      </VaDataTable>

      <!-- Paginación -->
      <div class="flex flex-col-reverse md:flex-row gap-2 justify-between items-center py-3 mt-2">
        <div class="flex items-center gap-2 text-sm">
          <span>Resultados por página:</span>
          <VaSelect v-model="perPage" class="!w-20" :options="[25, 50, 100, 200]" />
          <span class="text-secondary ml-2">
            Mostrando {{ (currentPage - 1) * perPage + 1 }}–{{ Math.min(currentPage * perPage, totalShipments) }} de
            <b>{{ totalShipments }}</b>
          </span>
        </div>
        <VaPagination v-model="currentPage" :pages="totalPages" :visible-pages="5" buttons-preset="secondary" />
      </div>
    </VaCardContent>
  </VaCard>

  <!-- Modal Vincular Cuenta -->
  <VaModal v-model="showLinkModal" title="Generar Link de Vinculación" hide-default-actions>
    <div class="flex flex-col gap-4">
      <p>Selecciona el cliente de Leon Express asociado a la cuenta de MercadoLibre.</p>

      <VaSelect
        v-model="selectedClientForLink"
        :options="localClients"
        value-by="client_id"
        text-by="client_name"
        label="Cliente destino"
        searchable
      />

      <VaButton v-if="!generatedLink" :disabled="!selectedClientForLink" @click="generateLink">Generar</VaButton>

      <div v-if="generatedLink" class="mt-4 p-4 border rounded relative bg-gray-50 border-gray-200">
        <p class="text-sm font-semibold mb-2">Envía este enlace seguro al cliente:</p>
        <div class="break-all text-blue-600 mb-2">{{ generatedLink }}</div>
        <VaButton size="small" icon="content_copy" @click="copyLink">Copiar</VaButton>
      </div>
    </div>
  </VaModal>

  <!-- Modal Importar a Pickup -->
  <VaModal v-model="showImportModal" title="Importar a Pickup" @ok="submitImport">
    <div class="flex flex-col gap-4">
      <p>
        Estás importando <b>{{ selectedCount }}</b> paquetes desde MercadoLibre.
      </p>
      <VaAlert color="info" dense
        >El chófer asignado a este Pickup deberá usar la app para certificarlos mediante escáner QR.</VaAlert
      >

      <VaSelect
        v-model="targetPickupId"
        :options="selectablePickups"
        value-by="pickup_id"
        text-by="_label"
        label="Seleccionar Pickup de Destino"
        searchable
      />
    </div>
  </VaModal>
</template>

<style scoped>
.page-title {
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 1rem;
}

.ellipsis {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.live-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--va-success);
  opacity: 0.85;
}

.live-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--va-success);
  animation: pulse-dot 2s infinite;
}

@keyframes pulse-dot {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.4;
    transform: scale(0.8);
  }
}
</style>
