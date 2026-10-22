<template>
  <div class="flex flex-col gap-6">
    <!-- ENCABEZADO DE PÁGINA -->
    <header class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">
          Bienvenido, {{ clientName }}
          <span v-if="clientAddress"> · {{ clientAddress }}</span>
          <span v-if="clientPhone"> · Tel: {{ clientPhone }}</span>
          <span v-if="clientPin"> · PIN: {{ clientPin }}</span>
        </p>
      </div>

      <div class="flex items-center gap-2">
        <ManualPackageButton @created="loadData" />
        <RequestPickupButton @created="loadData" />
      </div>
    </header>

    <!-- TARJETAS DE ESTADÍSTICAS -->
    <section class="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <VaCard class="flex flex-col gap-2">
        <VaCardTitle class="uppercase text-secondary text-xs font-semibold">
          En Preparación
        </VaCardTitle>
        <VaCardContent class="flex flex-col gap-1">
          <span class="text-2xl font-bold">{{ stats.pendingPickup }}</span>
          <span class="text-xs text-secondary">Pendientes de recolección</span>
        </VaCardContent>
      </VaCard>

      <VaCard class="flex flex-col gap-2">
        <VaCardTitle class="uppercase text-secondary text-xs font-semibold">
          En Tránsito
        </VaCardTitle>
        <VaCardContent class="flex flex-col gap-1">
          <span class="text-2xl font-bold text-info">{{ stats.inTransit }}</span>
          <span class="text-xs text-secondary">En camino a destino</span>
        </VaCardContent>
      </VaCard>

      <VaCard class="flex flex-col gap-2">
        <VaCardTitle class="uppercase text-secondary text-xs font-semibold">
          Entregados
        </VaCardTitle>
        <VaCardContent class="flex flex-col gap-1">
          <span class="text-2xl font-bold text-success">{{ stats.delivered }}</span>
          <span class="text-xs text-secondary">Entregas exitosas</span>
        </VaCardContent>
      </VaCard>

      <VaCard class="flex flex-col gap-2">
        <VaCardTitle class="uppercase text-secondary text-xs font-semibold">
          Mercado Libre
        </VaCardTitle>
        <VaCardContent class="flex flex-col gap-1">
          <div>
            <VaBadge
              :text="mlAccounts.length ? `${mlAccounts.length} cuenta(s) vinculada(s)` : 'No vinculada'"
              :color="mlAccounts.length ? 'success' : 'secondary'"
            />
          </div>
          <div class="pt-1">
            <VaButton
              v-if="mlAccounts.length"
              preset="plain"
              size="small"
              class="text-xs p-0"
              :loading="isSyncingMl"
              @click="syncMlAccount"
            >
              Sincronizar hoy
            </VaButton>
            <VaButton
              v-else
              preset="plain"
              size="small"
              class="text-xs p-0 text-primary font-bold"
              @click="linkMlAccount"
            >
              + Vincular ahora
            </VaButton>
            <RouterLink
              v-if="mlAccounts.length"
              :to="{ name: 'mercadolibre' }"
              class="text-xs text-primary mt-2 block"
            >
              Gestionar cuentas
            </RouterLink>
          </div>
        </VaCardContent>
      </VaCard>
    </section>

    <!-- SECCIÓN DE COLECTAS ACTIVAS / PENDIENTES -->
    <VaCard v-if="activePickups.length > 0">
      <VaCardTitle>Colectas solicitadas en proceso</VaCardTitle>
      <VaCardContent>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <VaCard
            v-for="p in activePickups"
            :key="p.pickup_id"
            outlined
            class="p-3"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold">Colecta #{{ p.pickup_id.substring(0, 8) }}</span>
              <VaBadge :text="p.status" color="warning" class="text-[10px]" />
            </div>
            <p class="text-xs text-secondary">
              Fecha: {{ formatDateTime(p.pickup_scheduled_date) }}
            </p>
            <p v-if="p.notes" class="text-xs text-secondary italic mt-1">
              "{{ p.notes }}"
            </p>
            <div class="mt-3 pt-2 border-t text-xs text-secondary flex items-center justify-between">
              <span>{{ p.packages?.length || 0 }} paquetes</span>
              <span>{{ p.user?.full_name ? 'Chofer: ' + p.user.full_name : 'Asignando chofer...' }}</span>
            </div>
          </VaCard>
        </div>
      </VaCardContent>
    </VaCard>

    <!-- LISTADO DE ENVÍOS -->
    <VaCard>
      <VaCardTitle class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <span>Mis Envíos Recientes</span>
        <div class="flex items-center gap-2">
          <VaInput
            v-model="searchFilter"
            placeholder="Buscar por código tracking, destinatario..."
            preset="bordered"
            size="small"
            class="w-64"
          >
            <template #prependInner>
              <VaIcon name="search" size="small" color="secondary" />
            </template>
          </VaInput>
          <VaButton
            preset="secondary"
            size="small"
            icon="refresh"
            :loading="isLoadingPackages"
            @click="loadData"
          />
        </div>
      </VaCardTitle>

      <VaCardContent>
        <VaDataTable
          :items="filteredPackages"
          :columns="columns"
          :loading="isLoadingPackages"
          no-data-html="No tienes envíos registrados aún."
          class="text-sm"
        >
          <template #cell(tracking_code)="{ value, row }">
            <div class="flex items-center gap-2">
              <span class="font-mono font-bold">{{ value }}</span>
              <VaBadge
                v-if="row.external_tracking_code && row.external_tracking_code !== value"
                text="ML"
                color="warning"
                class="text-[10px] font-bold"
              />
              <VaBadge
                v-else
                text="MANUAL"
                color="secondary"
                class="text-[10px] font-bold"
              />
            </div>
          </template>

          <template #cell(status)="{ value }">
            <VaBadge
              :text="formatStatus(value)"
              :color="statusColor(value)"
              class="text-[11px] font-semibold"
            />
          </template>

          <template #cell(created_at)="{ value }">
            <span class="text-xs text-secondary">{{ formatDateTime(value) }}</span>
          </template>

          <template #cell(actions)="{ rowData }">
            <div class="flex items-center gap-1 justify-end">
              <VaButton
                preset="secondary"
                size="small"
                icon="print"
                title="Imprimir Etiqueta Térmica con QR"
                @click="printPackageLabel(rowData)"
              />
            </div>
          </template>
        </VaDataTable>
      </VaCardContent>
    </VaCard>


  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user-store'
import { useToast } from 'vuestic-ui'
import api from '@/services/api'
import ManualPackageButton from '@/pages/packages/widgets/ManualPackageButton.vue'
import RequestPickupButton from '@/pages/pickups/widgets/RequestPickupButton.vue'

const router = useRouter()
const userStore = useUserStore()
const { init: notify } = useToast()

const clientName = computed(() => userStore.user?.client?.client_name || userStore.user?.full_name || 'Cliente')
const clientAddress = computed(() => userStore.user?.client?.address || '')
const clientPhone = computed(() => userStore.user?.client?.phone || userStore.user?.phone || '')
const clientPin = computed(() => userStore.user?.client?.verification_code || '')

// Estado de estadísticas
const stats = reactive({
  pendingPickup: 0,
  inTransit: 0,
  delivered: 0,
})

// Mercado Libre
const mlAccounts = ref<any[]>([])
const isSyncingMl = ref(false)

// Colectas activas
const activePickups = ref<any[]>([])

// Paquetes
const packages = ref<any[]>([])
const isLoadingPackages = ref(false)
const searchFilter = ref('')

const columns = [
  { key: 'tracking_code', label: 'Código Tracking', sortable: true },
  { key: 'recipient_name', label: 'Destinatario', sortable: true },
  { key: 'destination_address', label: 'Dirección Destino', sortable: true },
  { key: 'status', label: 'Estado', sortable: true },
  { key: 'created_at', label: 'Fecha Registro', sortable: true },
  { key: 'actions', label: 'Acciones', align: 'right' },
]

const filteredPackages = computed(() => {
  if (!searchFilter.value) return packages.value
  const q = searchFilter.value.toLowerCase()
  return packages.value.filter(
    (p) =>
      p.tracking_code?.toLowerCase().includes(q) ||
      p.external_tracking_code?.toLowerCase().includes(q) ||
      p.recipient_name?.toLowerCase().includes(q) ||
      p.destination_address?.toLowerCase().includes(q),
  )
})

const formatDateTime = (val: string) => {
  if (!val) return 'N/A'
  return new Date(val).toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatStatus = (s: string) => {
  const map: Record<string, string> = {
    PENDIENTE_RECOLECCION: 'Pendiente Retiro',
    RECOLECTADO: 'Recolectado',
    EN_ALMACEN: 'En Almacén',
    EN_RUTA: 'En Ruta de Entrega',
    ENTREGADO: 'Entregado',
    FALLIDO: 'No Entregado',
    DEVUELTO_A_ORIGEN: 'Devuelto',
  }
  return map[s] || s
}

const statusColor = (s: string) => {
  if (s === 'ENTREGADO') return 'success'
  if (s === 'EN_RUTA' || s === 'RECOLECTADO') return 'primary'
  if (s === 'FALLIDO' || s === 'DEVUELTO_A_ORIGEN') return 'danger'
  return 'warning'
}

// Cargar información inicial
const loadData = async () => {
  isLoadingPackages.value = true
  try {
    // 1. Cargar paquetes del cliente (el backend filtra automáticamente por req.user.client_id)
    const resPkgs = await api.getPackages({ perPage: 100 } as any)
    const list = resPkgs.data?.packages || resPkgs.data?.items || resPkgs.data || []
    packages.value = Array.isArray(list) ? list : []

    // Calcular estadísticas
    stats.pendingPickup = packages.value.filter((p) => p.status === 'PENDIENTE_RECOLECCION').length
    stats.inTransit = packages.value.filter((p) => ['RECOLECTADO', 'EN_ALMACEN', 'EN_RUTA'].includes(p.status)).length
    stats.delivered = packages.value.filter((p) => p.status === 'ENTREGADO').length

    // 2. Cargar colectas activas
    const resPickups = await api.getPickups({ perPage: 20 } as any)
    const pList = resPickups.data?.pickups || resPickups.data?.items || resPickups.data || []
    activePickups.value = Array.isArray(pList) ? pList.filter((p: any) => p.status === 'SOLICITADA' || p.status === 'EN_PROCESO_RECOLECCION') : []

    // 3. Cargar estado de cuenta ML
    try {
      const resMl = await api.getMyMlAccount()
      mlAccounts.value = resMl.data?.accounts || (resMl.data?.account ? [resMl.data.account] : [])
    } catch (e) {
      // Ignorar si ML aún no está vinculado
    }
  } catch (error: any) {
    console.error('Error cargando datos del cliente:', error)
  } finally {
    isLoadingPackages.value = false
  }
}

const printPackageLabel = (pkg: any) => {
  if (!pkg?.tracking_code) return
  const routeResolved = router.resolve({
    name: 'print-package-label',
    params: { trackingCode: pkg.tracking_code },
  })
  window.open(routeResolved.href, '_blank')
}

// Mercado Libre Vincular / Sincronizar
const linkMlAccount = async () => {
  try {
    const res = await api.linkMyMlAccount()
    const targetUrl = res.data?.url || res.data?.authUrl || res.data?.link?.url || res.data?.link
    if (typeof targetUrl === 'string' && /^https?:\/\//i.test(targetUrl)) {
      window.location.href = targetUrl
    } else {
      throw new Error('No se recibió la URL de autorización')
    }
  } catch (error: any) {
    notify({
      message: error.response?.data?.error || 'No se pudo iniciar la vinculación con Mercado Libre.',
      color: 'danger',
    })
  }
}

const syncMlAccount = async () => {
  isSyncingMl.value = true
  try {
    const res = await api.syncMyMlAccount()
    notify({
      message: res.data?.message || 'Envíos sincronizados exitosamente desde Mercado Libre.',
      color: 'success',
    })
    loadData()
  } catch (error: any) {
    notify({
      message: error.response?.data?.error || 'Error al sincronizar con Mercado Libre.',
      color: 'danger',
    })
  } finally {
    isSyncingMl.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.page-title {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0;
}

.page-subtitle {
  color: var(--va-on-background-secondary, #64748b);
  margin-top: 0.25rem;
  font-size: 0.875rem;
}
</style>
