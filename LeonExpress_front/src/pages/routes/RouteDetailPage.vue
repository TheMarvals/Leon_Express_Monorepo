<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute as useVueRoute, RouterLink } from 'vue-router'
import { useToast, defineVaDataTableColumns } from 'vuestic-ui'
import api from '../../services/api'
import { isSessionExpiredError, SESSION_EXPIRED_MESSAGE } from '../../services/sessionExpiry'
import { Route } from './types'
import { Package } from '../packages/types'
import { getAvailableComunas, getComunasFromAddresses, comunasService } from '../../data/comunas'
import { useUserStore } from '../../stores/user-store'
import RoutePackageScanner from './widgets/RoutePackageScanner.vue'

const route = useVueRoute()
const { init: notify } = useToast()
const userStore = useUserStore()

// --- Estado del componente ---
const routeData = ref<Route | null>(null)
const loadError = ref('')
const targetRoutes = ref<Route[]>([])
const isLoadingTargetRoutes = ref(false)
const targetRoutesError = ref('')
const selectedPending = ref<Package[]>([])
const targetRouteId = ref('')
const isTransferring = ref(false)
const showFinishModal = ref(false)
const scrollToSection = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
const availablePackages = ref<Package[]>([])
const isLoading = ref(true)
const isSaving = ref(false)
const selectedAvailable = ref<Package[]>([])
const isUpdatingStatus = ref(false)
const comunaFilter = ref('')
const addressSearch = ref('')
const isFinishingLoading = ref(false)
const isApprovingLoading = ref(false)
const showApproveModal = ref(false)
const expectedPackageCount = ref<number | null>(null)
const scannerRef = ref<InstanceType<typeof RoutePackageScanner> | null>(null)
// --- Columnas para las tablas de datos ---
const columns = defineVaDataTableColumns([
  {
    label: 'Dirección de Entrega',
    key: 'destination_address',
    sortable: true,
  },
  {
    label: 'Tracking Externo',
    key: 'external_tracking_code',
    sortable: true,
  },
  {
    label: 'Destinatario',
    key: 'recipient_name',
    sortable: true,
  },
  { label: 'Estado', key: 'status', sortable: true },
])

const routePackageColumns = computed(() => {
  const cols = [...(columns as any[])]
  // Solo permitir eliminar si la ruta está pendiente y no ha sido aprobada
  if (
    (routeData.value?.status === 'PENDIENTE' && loadingStatus.value !== 'APPROVED') ||
    ((isAdmin.value || userStore.isWarehouseStaff) && pendingPackages.value.length > 0)
  ) {
    cols.push({ label: ' ', key: 'actions', align: 'right' })
  }
  return cols
})

// Colores para los diferentes estados de los paquetes
const statusColors: Record<string, string> = {
  RECOLECTADO_EN_ORIGEN: 'info',
  RECIBIDO_EN_ALMACEN: 'primary',
  ASIGNADO_A_RUTA: 'warning',
  EN_RUTA_ENTREGA: 'warning',
  ENTREGADO: 'success',
  INCIDENCIA_ENTREGA: 'danger',
  REPROGRAMADO: 'warning',
  DEVUELTO_ALMACEN: 'secondary',
  EN_RUTA_DEVOLUCION: 'warning',
  DEVUELTO_A_CLIENTE: 'danger',
  CANCELADO: 'secondary',
}

// --- Carga de datos inicial ---
const fetchData = async (showLoading = true) => {
  if (showLoading) isLoading.value = true
  const routeId = route.params.id as string
  loadError.value = ''
  try {
    const [routeRes, packagesRes] = await Promise.all([
      api.getRouteById(routeId),
      // Mostrar paquetes disponibles en almacén (Recibidos, Devueltos o Recolectados)
      api.getPackages({
        status: 'RECIBIDO_EN_ALMACEN,DEVUELTO_ALMACEN,RECOLECTADO_EN_ORIGEN,INCIDENCIA_ENTREGA,REPROGRAMADO',
        perPage: 1000,
      }),
    ])
    if (route.params.id !== routeId) return
    routeData.value = routeRes.data
    targetRoutes.value = []
    targetRoutesError.value = ''
    if (
      canManageRoute.value &&
      routeData.value?.route_type === 'ENTREGA' &&
      ['PENDIENTE', 'EN_PROGRESO'].includes(routeData.value.status)
    ) {
      await refreshTargetRoutes()
    }
    if (route.params.id !== routeId) return
    selectedPending.value = []
    availablePackages.value = packagesRes.data.packages || []
  } catch (error: any) {
    if (route.params.id !== routeId) return
    loadError.value = isSessionExpiredError(error)
      ? SESSION_EXPIRED_MESSAGE
      : error.response?.data?.error || 'No se pudieron cargar los datos de la ruta. Intenta nuevamente.'
    if (!isSessionExpiredError(error)) {
      notify({ message: loadError.value, color: 'danger' })
    }
  } finally {
    if (showLoading) isLoading.value = false
  }
}
onMounted(async () => {
  await fetchData()
  await loadAvailableComunas()
  await updateFilteredPackages()
})

watch(
  () => route.params.id,
  async () => {
    targetRouteId.value = ''
    showFinishModal.value = false
    await fetchData()
  },
)

// Watchers para actualizar filtros automáticamente
watch(
  availablePackages,
  async () => {
    await loadAvailableComunas()
    await updateFilteredPackages()
  },
  { deep: true },
)

watch(comunaFilter, async () => {
  await updateFilteredPackages()
})

watch(addressSearch, () => {
  updateFilteredPackages()
})

// --- Propiedades Computadas ---
const packagesInRoute = computed(() => {
  const packages =
    routeData.value?.routePackages
      ?.filter((rp) => !rp.released_at)
      .map((rp) => rp.package)
      .filter(Boolean) || []

  // Crear una copia del array para no mutar el original
  const sortedPackages = [...packages]

  // Ordenar: paquetes EN_RUTA_ENTREGA primero, el resto al final
  return sortedPackages.sort((a, b) => {
    const aIsEnRoute = a.status === 'EN_RUTA_ENTREGA'
    const bIsEnRoute = b.status === 'EN_RUTA_ENTREGA'

    // Si ambos están en ruta o ambos no están en ruta, mantener orden original
    if (aIsEnRoute === bIsEnRoute) {
      return 0
    }

    // Si solo 'a' está en ruta, moverlo al principio
    if (aIsEnRoute) {
      return -1
    }

    // Si solo 'b' está en ruta, moverlo al principio
    if (bIsEnRoute) {
      return 1
    }

    return 0
  })
})

const releasedPackages = computed(() => routeData.value?.routePackages?.filter((item) => item.released_at) || [])
const pendingPackages = computed(() =>
  packagesInRoute.value.filter((pkg) => ['ASIGNADO_A_RUTA', 'EN_RUTA_ENTREGA'].includes(pkg.status)),
)
const canManageRoute = computed(
  () => isAdmin.value || (isDriver.value && routeData.value?.user_id === userStore.user?.user_id),
)
const eligibleTargetRoutes = computed(() =>
  targetRoutes.value.filter(
    (item) =>
      item.route_id !== routeData.value?.route_id &&
      ['PENDIENTE', 'EN_PROGRESO'].includes(item.status) &&
      item.route_type === 'ENTREGA' &&
      item.warehouse_id === routeData.value?.warehouse_id &&
      (isAdmin.value || item.user_id === userStore.user?.user_id),
  ),
)
const emptyTargetRoutesText = 'No hay otra ruta de entrega pendiente o en progreso en esta bodega.'
const targetRouteOptions = computed(() =>
  eligibleTargetRoutes.value.map((item) => ({
    value: item.route_id,
    text: `${item.route_name || 'Ruta sin nombre'} · ${item.user?.full_name || 'Conductor'} · ${item.status.replace(
      /_/g,
      ' ',
    )}`,
  })),
)
const refreshTargetRoutes = async (isOpen = true) => {
  if (!canManageRoute.value || !isOpen || isLoadingTargetRoutes.value) return
  const routeId = route.params.id as string
  isLoadingTargetRoutes.value = true
  targetRoutesError.value = ''
  try {
    const { data } = await api.getRouteTransferDestinations(routeId)
    if (route.params.id !== routeId) return
    targetRoutes.value = data.routes || []
    if (!eligibleTargetRoutes.value.some((item) => item.route_id === targetRouteId.value)) {
      targetRouteId.value = ''
    }
  } catch (error: any) {
    if (route.params.id !== routeId) return
    targetRoutes.value = []
    targetRouteId.value = ''
    targetRoutesError.value = isSessionExpiredError(error)
      ? SESSION_EXPIRED_MESSAGE
      : 'No se pudieron actualizar las rutas de destino. Intenta nuevamente.'
  } finally {
    isLoadingTargetRoutes.value = false
  }
}
const handleTransferPending = async () => {
  const destination = eligibleTargetRoutes.value.find((item) => item.route_id === targetRouteId.value)
  if (
    !canManageRoute.value ||
    isTransferring.value ||
    isLoadingTargetRoutes.value ||
    !destination ||
    !selectedPending.value.length
  )
    return
  if (
    !window.confirm(
      `¿Confirmas el traspaso físico de ${selectedPending.value.length} paquete(s) a la ruta ${
        destination.route_name || 'sin nombre'
      } de ${
        destination.user?.full_name || 'el conductor de destino'
      }? La entrega y su remuneración quedarán a cargo de ese conductor.`,
    )
  )
    return
  isTransferring.value = true
  try {
    await api.transferRoutePackages(
      route.params.id as string,
      targetRouteId.value,
      selectedPending.value.map((pkg) => pkg.package_id),
    )
    notify({ message: 'Paquetes transferidos. Ya no están pendientes en esta ruta.', color: 'success' })
    targetRouteId.value = ''
    await fetchData(false)
  } catch (error: any) {
    notify({ message: error.response?.data?.error || 'No se pudieron transferir los paquetes.', color: 'danger' })
  } finally {
    isTransferring.value = false
  }
}

// Lista única de comunas disponibles
const availableComunas = ref<string[]>([])

// Función para cargar comunas disponibles
const loadAvailableComunas = async () => {
  console.log('Cargando comunas disponibles...')
  console.log('Paquetes disponibles:', availablePackages.value?.length || 0)

  if (!availablePackages.value?.length) {
    console.log('No hay paquetes, usando lista completa de comunas')
    try {
      const allComunas = await getAvailableComunas()
      availableComunas.value = allComunas
    } catch (error) {
      console.error('Error cargando comunas completas:', error)
      availableComunas.value = []
    }
    return
  }

  try {
    // Obtener direcciones de destino
    const addresses = availablePackages.value.map((pkg: any) => pkg.destination_address).filter(Boolean)

    console.log('Direcciones a procesar:', addresses.length)

    // Obtener comunas de las direcciones
    const comunasFromPackages = await getComunasFromAddresses(addresses)
    console.log('Comunas detectadas de paquetes:', comunasFromPackages)

    availableComunas.value = comunasFromPackages.sort()
  } catch (error) {
    console.error('Error procesando comunas:', error)
    availableComunas.value = []
  }
}

const comunaOptions = computed(() => [
  { value: '', text: 'Todas las comunas' },
  ...availableComunas.value.map((comuna) => ({ value: comuna, text: comuna })),
])

// ✅ MEJORA 1: Filtra los paquetes disponibles para no mostrar los que ya están en la ruta y por comuna.
const filteredAvailablePackages = ref<any[]>([])

const updateFilteredPackages = async () => {
  const packageIdsInRoute = new Set(packagesInRoute.value.map((p) => p.package_id))
  let filtered = availablePackages.value.filter((p) => {
    // 1. No mostrar si ya está en la ruta
    if (packageIdsInRoute.has(p.package_id)) return false

    // 2. No mostrar si está en poder de un conductor (pendiente de devolución física)
    if (p.pending_return_user_id) return false

    return true
  })

  // Filtrar por comuna si se seleccionó una
  if (comunaFilter.value) {
    console.log('Filtrando por comuna:', comunaFilter.value)
    const filteredByComuna = []
    for (const pkg of filtered) {
      try {
        const comuna = await comunasService.detectComunaFromAddress(pkg.destination_address)
        console.log('Paquete ID:', pkg.package_id, 'Dirección:', pkg.destination_address, 'Comuna detectada:', comuna)
        if (comuna && comuna.toLowerCase() === comunaFilter.value.toLowerCase()) {
          filteredByComuna.push(pkg)
          console.log('Paquete incluido en filtro')
        }
      } catch (error) {
        console.error('Error detectando comuna para filtro:', error)
      }
    }
    filtered = filteredByComuna
    console.log('Paquetes después del filtro:', filtered.length)
  }

  // Filtrar por dirección si hay término de búsqueda
  if (addressSearch.value && addressSearch.value.trim()) {
    const searchTerm = addressSearch.value.trim().toLowerCase()
    filtered = filtered.filter((pkg) => {
      const address = (pkg.destination_address || '').toLowerCase()
      return address.includes(searchTerm)
    })
  }

  filteredAvailablePackages.value = filtered
}

// Paquetes en ruta filtrados por búsqueda
const filteredPackagesInRoute = computed(() => {
  let filtered = packagesInRoute.value

  // Filtrar por dirección si hay término de búsqueda
  if (addressSearch.value && addressSearch.value.trim()) {
    const searchTerm = addressSearch.value.trim().toLowerCase()
    filtered = filtered.filter((pkg) => {
      const address = (pkg.destination_address || '').toLowerCase()
      return address.includes(searchTerm)
    })
  }

  return filtered
})

const canFinishRoute = computed(() => {
  if (!packagesInRoute.value || packagesInRoute.value.length === 0) {
    return true
  }
  // Estados que se consideran "finalizados" para una ruta
  const finalStates = [
    'ENTREGADO',
    'INCIDENCIA_ENTREGA',
    'REPROGRAMADO',
    'DEVUELTO_ALMACEN',
    'DEVUELTO_A_CLIENTE',
    'CANCELADO',
  ]
  return packagesInRoute.value.every((pkg) => finalStates.includes(pkg.status))
})

// --- Lógica de Acciones ---
const handleAssignPackages = async () => {
  if (selectedAvailable.value.length === 0) {
    notify({ message: 'Debes seleccionar al menos un paquete para asignar.', color: 'warning' })
    return
  }
  isSaving.value = true
  const routeId = route.params.id as string
  const packageIds = selectedAvailable.value.map((pkg) => pkg.package_id)
  try {
    await api.assignPackagesToRoute(routeId, packageIds)
    notify({ message: `${packageIds.length} paquetes asignados con éxito.`, color: 'success' })
    selectedAvailable.value = []
    await fetchData()
  } catch (error: any) {
    const errorMessage = error.response?.data?.error || 'Error al asignar paquetes.'
    notify({ message: errorMessage, color: 'danger' })
  } finally {
    isSaving.value = false
  }
}

const handleStatusUpdate = async (newStatus: 'EN_PROGRESO' | 'FINALIZADA') => {
  isUpdatingStatus.value = true
  const routeId = route.params.id as string
  try {
    await api.updateRouteStatus(routeId, newStatus)
    showFinishModal.value = false
    notify({ message: `Ruta marcada como ${newStatus.replace('_', ' ')}.`, color: 'success' })
    await fetchData()
  } catch (error: any) {
    const errorMessage = error.response?.data?.error || `Error al cambiar el estado.`
    notify({ message: errorMessage, color: 'danger' })
  } finally {
    isUpdatingStatus.value = false
  }
}

// Eliminar paquete de la ruta
const handleRemovePackage = async (pkg: Package) => {
  if (!confirm(`¿Estás seguro de quitar el paquete ${pkg.tracking_code} de la ruta?`)) {
    return
  }
  const routeId = route.params.id as string
  try {
    await api.removePackageFromRoute(routeId, pkg.package_id)
    notify({ message: 'Paquete quitado de la ruta.', color: 'success' })
    await fetchData()
  } catch (error: any) {
    const errorMessage = error.response?.data?.error || 'Error al quitar el paquete.'
    notify({ message: errorMessage, color: 'danger' })
  }
}

const handleConfirmReception = async (packageId: string) => {
  if (!confirm('¿Confirmas que has recibido físicamente este paquete en el almacén?')) {
    return
  }
  try {
    await api.receivePackageAtWarehouse(packageId)
    notify({ message: 'Recepción en almacén confirmada.', color: 'success' })
    fetchData()
  } catch (error: any) {
    const errorMessage = error.response?.data?.error || 'Error al confirmar la recepción.'
    notify({ message: errorMessage, color: 'danger' })
  }
}

// Eliminar ruta completa (Admin)
const handleDeleteRoute = async () => {
  if (
    !confirm('¿Estás seguro de eliminar esta ruta COMPLETA? Los paquetes volverán a estar disponibles en el almacén.')
  ) {
    return
  }
  const routeId = route.params.id as string
  try {
    await api.deleteRoute(routeId)
    notify({ message: 'Ruta eliminada exitosamente.', color: 'success' })
    window.history.back() // Volver a la lista
  } catch (error: any) {
    const errorMessage = error.response?.data?.error || 'Error al eliminar la ruta.'
    notify({ message: errorMessage, color: 'danger' })
  }
}

// Manejar escaneo de paquete
const handlePackageScanned = async (pkg: Package) => {
  console.log('📦 Paquete escaneado:', pkg)

  // 1. Actualización optimista: Agregar a paquetes de la ruta
  if (routeData.value) {
    if (!routeData.value.routePackages) {
      routeData.value.routePackages = []
    }

    // Verificar si ya existe para evitar duplicados visuales
    const alreadyExists = routeData.value.routePackages.some(
      (rp) => !rp.released_at && rp.package && rp.package.package_id === pkg.package_id,
    )
    if (!alreadyExists) {
      routeData.value.routePackages.push({ package: pkg })
      console.log('⚡ Actualización optimista: Paquete agregado a la lista')
    }
  }

  // 2. Actualización optimista: Remover de paquetes disponibles
  const availableIndex = availablePackages.value.findIndex((p) => p.package_id === pkg.package_id)
  if (availableIndex !== -1) {
    availablePackages.value.splice(availableIndex, 1)
    console.log('⚡ Actualización optimista: Paquete removido de disponibles')
  }

  // Forzar actualización de filtros para que el paquete desaparezca de "disponibles" de inmediato
  updateFilteredPackages()

  // Recargar datos en segundo plano (SIN AWAIT para no bloquear al conductor)
  fetchData(false).then(() => {
    console.log('✅ Datos recargados silenciosamente en segundo plano')
  })
}

// Finalizar carga de paquetes (conductor)
const handleFinishLoading = async () => {
  if (!confirm('¿Estás seguro de que terminaste de escanear todos los paquetes?')) {
    return
  }

  isFinishingLoading.value = true
  const routeId = route.params.id as string
  try {
    await api.finishRouteLoading(routeId)
    notify({ message: 'Carga de paquetes finalizada. Esperando aprobación del administrador.', color: 'success' })
    await fetchData()
  } catch (error: any) {
    const errorMessage = error.response?.data?.error || 'Error al finalizar la carga.'
    notify({ message: errorMessage, color: 'danger' })
  } finally {
    isFinishingLoading.value = false
  }
}

// Aprobar carga de paquetes (admin)
const handleApproveLoading = async () => {
  isApprovingLoading.value = true
  const routeId = route.params.id as string
  try {
    await api.approveRouteLoading(routeId, expectedPackageCount.value || undefined)
    notify({ message: 'Carga de paquetes aprobada. La ruta puede iniciarse.', color: 'success' })
    showApproveModal.value = false
    expectedPackageCount.value = null
    await fetchData()
  } catch (error: any) {
    const errorMessage = error.response?.data?.error || 'Error al aprobar la carga.'
    notify({ message: errorMessage, color: 'danger' })
  } finally {
    isApprovingLoading.value = false
  }
}

// Computed para determinar qué mostrar según el estado de carga y el rol
const loadingStatus = computed(() => routeData.value?.loading_status || 'NOT_STARTED')
const isDriver = computed(() => userStore.isDriver)
const isAdmin = computed(() => userStore.isAdmin)
const canStartRoute = computed(() => {
  if (!routeData.value) return false
  return (
    routeData.value.status === 'PENDIENTE' &&
    (loadingStatus.value === 'APPROVED' || loadingStatus.value === 'NOT_STARTED')
  )
})
const showScanner = computed(() => {
  return (
    isDriver.value &&
    canManageRoute.value &&
    (routeData.value?.status === 'EN_PROGRESO' ||
      (routeData.value?.status === 'PENDIENTE' &&
        (loadingStatus.value === 'NOT_STARTED' || loadingStatus.value === 'LOADING')))
  )
})
const showFinishLoading = computed(() => {
  return (
    isDriver.value &&
    routeData.value?.status === 'PENDIENTE' &&
    loadingStatus.value === 'LOADING' &&
    packagesInRoute.value.length > 0
  )
})
const showApproveButton = computed(() => {
  return isAdmin.value && routeData.value?.status === 'PENDIENTE' && loadingStatus.value === 'LOADING_COMPLETED'
})
</script>

<template>
  <div v-if="isLoading" class="flex justify-center p-8">
    <VaProgressCircle indeterminate />
  </div>
  <div v-else-if="routeData">
    <h1 class="page-title">Gestionar Paquetes de la Ruta</h1>

    <VaCard class="mb-6">
      <VaCardTitle>Acciones de Ruta</VaCardTitle>
      <VaCardContent class="route-actions-container">
        <VaButton
          v-if="canManageRoute && ['PENDIENTE', 'EN_PROGRESO'].includes(routeData.status) && (isAdmin || showScanner)"
          icon="add"
          class="route-action-button"
          @click="scrollToSection('route-add-packages')"
          >Agregar paquetes</VaButton
        >
        <VaButton
          v-if="
            canManageRoute &&
            routeData.route_type === 'ENTREGA' &&
            ['PENDIENTE', 'EN_PROGRESO'].includes(routeData.status) &&
            pendingPackages.length
          "
          preset="secondary"
          icon="swap_horiz"
          class="route-action-button"
          @click="scrollToSection('route-transfer-packages')"
          >Reasignar paquetes</VaButton
        >
        <VaButton
          v-if="routeData.status === 'PENDIENTE' && canStartRoute"
          size="large"
          icon="fa4-play"
          :loading="isUpdatingStatus"
          :disabled="packagesInRoute.length === 0"
          class="route-action-button"
          @click="handleStatusUpdate('EN_PROGRESO')"
        >
          Iniciar Reparto
        </VaButton>
        <VaButton
          v-if="isAdmin && routeData.status === 'PENDIENTE' && loadingStatus !== 'APPROVED'"
          size="large"
          icon="fa4-trash"
          color="danger"
          variant="secondary"
          class="route-action-button"
          @click="handleDeleteRoute"
        >
          Eliminar Ruta
        </VaButton>
        <VaAlert
          v-if="routeData.status === 'PENDIENTE' && loadingStatus === 'LOADING'"
          color="info"
          class="route-alert"
        >
          <p>El conductor está cargando paquetes. Espera a que finalice la carga.</p>
        </VaAlert>
        <VaAlert
          v-if="routeData.status === 'PENDIENTE' && loadingStatus === 'LOADING_COMPLETED'"
          color="warning"
          class="route-alert"
        >
          <p>La carga ha sido finalizada. Esperando aprobación del administrador.</p>
        </VaAlert>
        <VaButton
          v-if="routeData.status === 'EN_PROGRESO' && canManageRoute"
          size="large"
          icon="fa4-check-circle"
          color="success"
          :loading="isUpdatingStatus"
          class="route-action-button route-finish-button"
          @click="showFinishModal = true"
        >
          Finalizar Ruta
        </VaButton>
        <VaAlert v-if="routeData.status === 'EN_PROGRESO' && canManageRoute" color="info" class="route-alert">
          Puedes agregar paquetes mientras la ruta esté abierta. Puedes reasignarlos entre tus propias rutas; para otro
          conductor se requiere un administrador.
        </VaAlert>
        <VaAlert v-if="routeData.status === 'EN_PROGRESO' && !canFinishRoute" color="warning" class="route-alert">
          <p>
            Transfiere los paquetes pendientes a otra ruta o registra su recepción física en bodega antes de finalizar.
          </p>
        </VaAlert>
        <VaAlert v-if="routeData.status === 'FINALIZADA'" color="success" class="route-alert">
          <p>Esta ruta ha sido finalizada.</p>
        </VaAlert>
        <VaAlert
          v-if="routeData.status === 'PENDIENTE' && packagesInRoute.length === 0"
          color="info"
          class="route-alert"
        >
          <p>Asigna paquetes a la ruta para poder iniciar el reparto.</p>
        </VaAlert>
      </VaCardContent>
    </VaCard>

    <VaCard class="mb-6">
      <VaCardContent class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="md:col-span-3">
          <p class="va-text-secondary">Nombre de la Ruta</p>
          <p class="va-h6">{{ routeData.route_name || 'Sin nombre asignado' }}</p>
        </div>
        <div>
          <p class="va-text-secondary">Conductor</p>
          <p class="va-h6">{{ routeData.user?.full_name || routeData.user?.fullname || 'Sin nombre' }}</p>
        </div>
        <div>
          <p class="va-text-secondary">Vehículo</p>
          <p class="va-h6">{{ routeData.vehicle?.license_plate }}</p>
        </div>
        <div>
          <p class="va-text-secondary">Estado</p>
          <VaBadge :text="routeData.status.replace(/_/g, ' ')" size="large" />
        </div>
        <div v-if="loadingStatus !== 'NOT_STARTED'">
          <p class="va-text-secondary">Estado de Carga</p>
          <VaBadge
            :text="loadingStatus.replace(/_/g, ' ')"
            :color="
              loadingStatus === 'APPROVED' ? 'success' : loadingStatus === 'LOADING_COMPLETED' ? 'warning' : 'info'
            "
            size="large"
          />
        </div>
      </VaCardContent>
    </VaCard>

    <VaModal v-model="showFinishModal" title="Finalizar ruta" hide-default-actions>
      <p class="mb-3">
        Entregados: {{ packagesInRoute.filter((pkg) => pkg.status === 'ENTREGADO').length }}. Transferidos:
        {{ releasedPackages.filter((item) => item.release_reason === 'TRANSFERIDO').length }}. Recibidos en bodega:
        {{ releasedPackages.filter((item) => item.release_reason === 'RECIBIDO_EN_ALMACEN').length }}. Pendientes sin
        gestionar: {{ pendingPackages.length }}.
      </p>
      <VaAlert v-if="!canFinishRoute" color="warning" class="mb-3">
        Transfiere los pendientes o confirma su recepción física en bodega para cerrar esta ruta.
      </VaAlert>
      <p v-else class="mb-3">
        Las incidencias pendientes de devolución seguirán a cargo del conductor hasta su recepción o reintento.
      </p>
      <div class="flex gap-3">
        <VaButton preset="secondary" @click="showFinishModal = false">Volver</VaButton>
        <VaButton :disabled="!canFinishRoute" :loading="isUpdatingStatus" @click="handleStatusUpdate('FINALIZADA')">
          Confirmar cierre
        </VaButton>
      </div>
    </VaModal>

    <VaCard v-if="releasedPackages.length" class="mb-6">
      <VaCardTitle>Historial de salida de paquetes ({{ releasedPackages.length }})</VaCardTitle>
      <VaCardContent>
        <ul class="space-y-2">
          <li v-for="(item, index) in releasedPackages" :key="index">
            {{ item.package.tracking_code }} ·
            {{
              item.release_reason === 'TRANSFERIDO'
                ? 'Transferido'
                : item.release_reason === 'ASIGNACION_ANTERIOR'
                  ? 'Asignación anterior'
                  : 'Recibido en bodega'
            }}
            <RouterLink
              v-if="item.transferred_to_route_id"
              :to="{ name: 'route-details', params: { id: item.transferred_to_route_id } }"
              class="text-primary underline"
              >Ver ruta de destino</RouterLink
            >
            · {{ new Date(item.released_at!).toLocaleString('es-CL') }}
          </li>
        </ul>
      </VaCardContent>
    </VaCard>

    <!-- Escáner de paquetes para conductor -->
    <VaCard v-if="showScanner" id="route-add-packages" class="mb-6">
      <VaCardTitle>Agregar paquetes a la ruta</VaCardTitle>
      <VaCardContent>
        <RoutePackageScanner
          :key="route.params.id as string"
          ref="scannerRef"
          :route-id="route.params.id as string"
          @packageScanned="handlePackageScanned"
        />
      </VaCardContent>
    </VaCard>

    <!-- Botón para finalizar carga (conductor) -->
    <VaCard v-if="showFinishLoading" class="mb-6">
      <VaCardContent>
        <div class="finish-loading-container">
          <div class="finish-loading-info">
            <p class="text-lg font-semibold">Carga de Paquetes</p>
            <p class="text-sm text-gray-600">
              Has escaneado {{ packagesInRoute.length }} paquete(s). Cuando termines, haz clic en "Finalizar Carga".
            </p>
          </div>
          <VaButton
            icon="fa4-check"
            color="success"
            size="large"
            :loading="isFinishingLoading"
            class="finish-loading-button"
            @click="handleFinishLoading"
          >
            Finalizar Carga
          </VaButton>
        </div>
      </VaCardContent>
    </VaCard>

    <!-- Interfaz de aprobación para admin -->
    <VaCard v-if="showApproveButton" class="mb-6">
      <VaCardTitle>Aprobar Carga de Paquetes</VaCardTitle>
      <VaCardContent>
        <div class="space-y-4">
          <VaAlert color="info">
            <p>
              El conductor ha finalizado la carga. Verifica que el número de paquetes sea correcto:
              <strong>{{ packagesInRoute.length }} paquete(s)</strong>
            </p>
          </VaAlert>
          <div class="flex gap-4">
            <VaInput
              v-model="expectedPackageCount"
              type="number"
              label="Número esperado de paquetes (opcional)"
              placeholder="Dejar vacío para usar el número actual"
              class="flex-1"
            />
            <VaButton
              icon="fa4-check"
              color="success"
              size="large"
              :loading="isApprovingLoading"
              @click="handleApproveLoading"
            >
              Aprobar Carga
            </VaButton>
          </div>
        </div>
      </VaCardContent>
    </VaCard>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <VaCard
        v-if="isAdmin && ['PENDIENTE', 'EN_PROGRESO'].includes(routeData.status) && !showScanner"
        id="route-add-packages"
      >
        <VaCardTitle>Paquetes Disponibles en Almacén</VaCardTitle>
        <VaCardContent>
          <div class="flex flex-col sm:flex-row gap-4 mb-4">
            <VaInput v-model="addressSearch" placeholder="Buscar por dirección..." class="flex-1" clearable>
              <template #prependInner>
                <VaIcon name="fa4-search" />
              </template>
            </VaInput>
            <VaSelect
              v-model="comunaFilter"
              :options="comunaOptions"
              text-by="text"
              value-by="value"
              placeholder="Filtrar por comuna"
              class="flex-1 sm:w-64"
              clearable
            />
          </div>
          <div class="table-wrapper">
            <VaDataTable
              v-model="selectedAvailable"
              :columns="columns"
              :items="filteredAvailablePackages"
              :per-page="100"
              selectable
              select-mode="multiple"
              sticky-header
              no-items-text="No hay paquetes disponibles para asignar"
            >
              <template #cell(external_tracking_code)="{ rowData }">
                <div class="font-mono text-xs">
                  {{ rowData.external_tracking_code || '---' }}
                </div>
              </template>
              <template #cell(recipient_name)="{ rowData }">
                <div class="text-sm font-medium">
                  {{ rowData.recipient_name || 'Sin nombre' }}
                </div>
              </template>
              <template #cell(destination_address)="{ rowData }">
                <RouterLink
                  :to="{ name: 'package-details', params: { id: rowData.package_id } }"
                  class="text-sm hover:underline text-primary"
                  :title="rowData.destination_address"
                  @click.stop
                >
                  {{ rowData.destination_address || 'Sin dirección' }}
                </RouterLink>
              </template>
              <template #cell(status)="{ rowData }">
                <div class="flex flex-col gap-1 items-start">
                  <VaBadge
                    :text="
                      rowData.status === 'DEVUELTO_A_CLIENTE'
                        ? 'DEVUELTO AL CLIENTE'
                        : rowData.status.replace(/_/g, ' ')
                    "
                    :color="statusColors[rowData.status] || 'secondary'"
                  />
                  <template v-if="rowData.pending_return_user_id">
                    <VaBadge
                      color="warning"
                      :text="'🏠 En poder de: ' + (rowData.pendingReturnDriver?.full_name || 'Conductor')"
                      class="mt-1"
                    />
                    <VaButton
                      v-if="userStore.isAdmin || userStore.isWarehouseStaff"
                      size="small"
                      preset="secondary"
                      color="primary"
                      class="mt-1"
                      @click.stop="handleConfirmReception(rowData.package_id)"
                    >
                      Recibido en Almacén
                    </VaButton>
                  </template>
                </div>
              </template>
            </VaDataTable>
          </div>
        </VaCardContent>
      </VaCard>

      <VaCard :class="{ 'lg:col-span-2': routeData.status !== 'PENDIENTE' }">
        <VaCardTitle>
          <div class="flex items-center justify-between">
            <span>Paquetes en esta Ruta ({{ packagesInRoute.length }})</span>
            <VaInput v-model="addressSearch" placeholder="Buscar por dirección..." class="w-64" clearable>
              <template #prependInner>
                <VaIcon name="fa4-search" />
              </template>
            </VaInput>
          </div>
        </VaCardTitle>
        <VaCardContent>
          <div class="table-wrapper">
            <VaDataTable
              :columns="routePackageColumns"
              :items="filteredPackagesInRoute"
              :per-page="100"
              sticky-header
              no-items-text="Aún no hay paquetes en esta ruta"
            >
              <template #cell(external_tracking_code)="{ rowData }">
                <div class="font-mono text-xs">
                  {{ rowData.external_tracking_code || '---' }}
                </div>
              </template>
              <template #cell(recipient_name)="{ rowData }">
                <div class="text-sm font-medium">
                  {{ rowData.recipient_name || 'Sin nombre' }}
                </div>
              </template>
              <template #cell(destination_address)="{ rowData }">
                <RouterLink
                  :to="{ name: 'package-details', params: { id: rowData.package_id } }"
                  class="text-sm hover:underline text-primary"
                  :title="rowData.destination_address"
                  @click.stop
                >
                  {{ rowData.destination_address || 'Sin dirección' }}
                </RouterLink>
              </template>
              <template #cell(status)="{ rowData }">
                <div class="flex flex-col gap-1 items-start">
                  <VaBadge
                    :text="
                      rowData.status === 'DEVUELTO_A_CLIENTE'
                        ? 'DEVUELTO AL CLIENTE'
                        : rowData.status.replace(/_/g, ' ')
                    "
                    :color="statusColors[rowData.status] || 'secondary'"
                  />
                  <template v-if="rowData.pending_return_user_id">
                    <VaBadge
                      color="warning"
                      :text="'🏠 En poder de: ' + (rowData.pendingReturnDriver?.full_name || 'Conductor')"
                      class="mt-1"
                    />
                    <VaButton
                      v-if="userStore.isAdmin || userStore.isWarehouseStaff"
                      size="small"
                      preset="secondary"
                      color="primary"
                      class="mt-1"
                      @click.stop="handleConfirmReception(rowData.package_id)"
                    >
                      Recibido en Almacén
                    </VaButton>
                  </template>
                </div>
              </template>
              <template #cell(actions)="{ rowData }">
                <VaButton
                  v-if="routeData.status === 'PENDIENTE' && loadingStatus !== 'APPROVED'"
                  preset="primary"
                  size="small"
                  icon="fa4-trash"
                  color="danger"
                  title="Quitar de la ruta"
                  @click="handleRemovePackage(rowData as Package)"
                />
                <VaButton
                  v-if="
                    (isAdmin || userStore.isWarehouseStaff) &&
                    ['ASIGNADO_A_RUTA', 'EN_RUTA_ENTREGA'].includes(rowData.status)
                  "
                  size="small"
                  preset="secondary"
                  @click="handleConfirmReception(rowData.package_id)"
                >
                  Recibido en bodega
                </VaButton>
              </template>
            </VaDataTable>
          </div>
        </VaCardContent>
      </VaCard>
    </div>

    <VaCard
      v-if="
        canManageRoute &&
        routeData.route_type === 'ENTREGA' &&
        ['PENDIENTE', 'EN_PROGRESO'].includes(routeData.status) &&
        pendingPackages.length
      "
      id="route-transfer-packages"
      class="mb-6"
    >
      <VaCardTitle>Reasignar paquetes sin incidencia</VaCardTitle>
      <VaCardContent>
        <p class="mb-3">
          Selecciona los paquetes pendientes y una ruta de destino de la misma bodega. Confirma el traspaso físico antes
          de transferirlos. No necesitas registrar una incidencia; el movimiento queda en el historial.
        </p>
        <p class="mb-3">
          Puedes transferir entre tus propias rutas pendientes o en progreso. Solo un administrador puede transferir a
          otro conductor. El conductor de destino quedará a cargo del paquete y del cobro contra entrega, si
          corresponde. La remuneración de la entrega se asignará a ese conductor cuando la registre.
        </p>
        <VaDataTable
          v-model="selectedPending"
          :items="pendingPackages"
          :columns="columns"
          selectable
          select-mode="multiple"
          :per-page="20"
        />
        <VaSelect
          v-model="targetRouteId"
          :options="targetRouteOptions"
          text-by="text"
          value-by="value"
          label="Ruta de destino"
          class="my-3"
          :loading="isLoadingTargetRoutes"
          :no-options-text="
            isLoadingTargetRoutes ? 'Actualizando rutas de destino...' : targetRoutesError || emptyTargetRoutesText
          "
          @update:isOpen="refreshTargetRoutes"
        />
        <VaAlert v-if="targetRoutesError" color="warning" class="mb-3">{{ targetRoutesError }}</VaAlert>
        <VaAlert v-else-if="!isLoadingTargetRoutes && !targetRouteOptions.length" color="info" class="mb-3">
          {{ emptyTargetRoutesText }}
        </VaAlert>
        <VaButton preset="secondary" class="mr-3 mb-3" :loading="isLoadingTargetRoutes" @click="refreshTargetRoutes()">
          Actualizar rutas
        </VaButton>
        <VaButton
          :disabled="isLoadingTargetRoutes || !targetRouteId || !selectedPending.length"
          :loading="isTransferring"
          @click="handleTransferPending"
        >
          Transferir {{ selectedPending.length }} paquetes
        </VaButton>
      </VaCardContent>
    </VaCard>

    <div v-if="isAdmin && ['PENDIENTE', 'EN_PROGRESO'].includes(routeData.status)" class="flex justify-center mt-6">
      <VaButton
        size="large"
        :loading="isSaving"
        :disabled="selectedAvailable.length === 0"
        @click="handleAssignPackages"
      >
        Asignar {{ selectedAvailable.length }} Paquetes a la Ruta
      </VaButton>
    </div>
  </div>
  <div v-else>
    <VaAlert color="warning" role="alert">{{ loadError || 'No se pudieron cargar los datos de la ruta.' }}</VaAlert>
  </div>
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
  max-height: 60vh;
  overflow: auto;
  position: relative;
}

/* Estilos para móvil */
@media (max-width: 768px) {
  .table-wrapper {
    max-height: 50vh;
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

/* Estilos para acciones de ruta - Responsive */
.route-actions-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: stretch;
}

@media (min-width: 768px) {
  .route-actions-container {
    flex-direction: row;
    align-items: center;
  }
}

.route-action-button {
  width: 100%;
  min-width: 200px;
  white-space: nowrap;
}

@media (min-width: 768px) {
  .route-action-button {
    width: auto;
    flex-shrink: 0;
  }
}

.route-finish-button {
  font-weight: 600;
  padding: 0.75rem 1.5rem;
}

@media (max-width: 767px) {
  .route-finish-button {
    width: 100%;
    padding: 1rem;
    font-size: 1rem;
  }
}

.route-alert {
  flex: 1;
  min-width: 0;
}

/* Estilos para finalizar carga - Responsive */
.finish-loading-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: stretch;
}

@media (min-width: 768px) {
  .finish-loading-container {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}

.finish-loading-info {
  flex: 1;
  min-width: 0;
}

.finish-loading-button {
  width: 100%;
  min-width: 200px;
  font-weight: 600;
  padding: 0.75rem 1.5rem;
}

@media (min-width: 768px) {
  .finish-loading-button {
    width: auto;
    flex-shrink: 0;
  }
}

@media (max-width: 767px) {
  .finish-loading-button {
    padding: 1rem;
    font-size: 1rem;
  }
}
</style>
