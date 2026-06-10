<script setup lang="ts">
import { ref, onMounted } from 'vue'
import VaTimelineItem from '../../../../components/va-timeline-item.vue'
import api from '@/services/api'

const logs = ref<any[]>([])
const loading = ref(true)

// Función para obtener el ícono y color basado en la acción
const getActionIcon = (action: string) => {
  const actionMap: { [key: string]: { icon: string; color: string } } = {
    // Paquetes
    CREATE_PACKAGE: { icon: 'fa4-plus-circle', color: 'success' },
    UPDATE_PACKAGE: { icon: 'fa4-edit', color: 'warning' },
    DELETE_PACKAGE: { icon: 'fa4-trash', color: 'danger' },

    // Clientes
    CREATE_CLIENT: { icon: 'fa4-user-plus', color: 'success' },
    UPDATE_CLIENT: { icon: 'fa4-user-edit', color: 'warning' },
    DEACTIVATE_CLIENT: { icon: 'fa4-user-times', color: 'danger' },

    // Usuarios
    CREATE_USER: { icon: 'fa4-user-plus', color: 'success' },
    UPDATE_USER: { icon: 'fa4-user-edit', color: 'warning' },
    DEACTIVATE_USER: { icon: 'fa4-user-times', color: 'danger' },

    // Vehículos
    CREATE_VEHICLE: { icon: 'fa4-truck', color: 'success' },
    UPDATE_VEHICLE: { icon: 'fa4-wrench', color: 'warning' },
    DELETE_VEHICLE: { icon: 'fa4-truck', color: 'danger' },

    // Tipos de vehículo
    CREATE_VEHICLE_TYPE: { icon: 'fa4-cogs', color: 'success' },
    UPDATE_VEHICLE_TYPE: { icon: 'fa4-cog', color: 'warning' },
    DELETE_VEHICLE_TYPE: { icon: 'fa4-cogs', color: 'danger' },

    // Almacenes
    CREATE_WAREHOUSE: { icon: 'fa4-warehouse', color: 'success' },
    UPDATE_WAREHOUSE: { icon: 'fa4-warehouse', color: 'warning' },

    // Rutas
    CREATE_ROUTE: { icon: 'fa4-route', color: 'success' },
    UPDATE_ROUTE: { icon: 'fa4-route', color: 'warning' },

    // Recolecciones (Pickups)
    CREATE_PICKUP: { icon: 'fa4-box-open', color: 'success' },
    UPDATE_PICKUP: { icon: 'fa4-box-open', color: 'warning' },

    // Entregas
    CREATE_DELIVERY: { icon: 'fa4-shipping-fast', color: 'info' },

    // Facturas y pagos
    UPDATE_INVOICE_STATUS: { icon: 'fa4-file-invoice-dollar', color: 'info' },
    CREATE_PAYMENT: { icon: 'fa4-money-bill', color: 'success' },
    UPDATE_PAYOUT_STATUS: { icon: 'fa4-hand-holding-dollar', color: 'info' },

    // Acciones por defecto
    LOGIN: { icon: 'fa4-sign-in-alt', color: 'primary' },
    LOGOUT: { icon: 'fa4-sign-out-alt', color: 'secondary' },
  }

  return actionMap[action] || { icon: 'fa4-clock', color: 'secondary' }
}

// Función para formatear los detalles del audit log
const formatDetails = (details: any) => {
  if (!details) return ''

  try {
    const parsed = typeof details === 'string' ? JSON.parse(details) : details
    const items = []

    for (const [key, value] of Object.entries(parsed)) {
      if (value !== null && value !== undefined) {
        items.push(`${key}: ${value}`)
      }
    }

    return items.join(', ')
  } catch (e) {
    return details.toString()
  }
}

// Función para formatear la acción de manera legible
const formatAction = (action: string) => {
  const actionTranslations: { [key: string]: string } = {
    CREATE_PACKAGE: 'creó paquete',
    UPDATE_PACKAGE: 'actualizó paquete',
    DELETE_PACKAGE: 'eliminó paquete',
    CREATE_CLIENT: 'creó cliente',
    UPDATE_CLIENT: 'actualizó cliente',
    DEACTIVATE_CLIENT: 'desactivó cliente',
    CREATE_USER: 'creó usuario',
    UPDATE_USER: 'actualizó usuario',
    DEACTIVATE_USER: 'desactivó usuario',
    CREATE_VEHICLE: 'creó vehículo',
    UPDATE_VEHICLE: 'actualizó vehículo',
    DELETE_VEHICLE: 'eliminó vehículo',
    CREATE_VEHICLE_TYPE: 'creó tipo de vehículo',
    UPDATE_VEHICLE_TYPE: 'actualizó tipo de vehículo',
    DELETE_VEHICLE_TYPE: 'eliminó tipo de vehículo',
    CREATE_WAREHOUSE: 'creó almacén',
    UPDATE_WAREHOUSE: 'actualizó almacén',
    CREATE_ROUTE: 'creó ruta',
    UPDATE_ROUTE: 'actualizó ruta',
    DELETE_ROUTE: 'eliminó ruta',
    CREATE_PICKUP: 'creó recolección',
    UPDATE_PICKUP: 'actualizó recolección',
    CREATE_DELIVERY: 'registró entrega',
    UPDATE_INVOICE_STATUS: 'actualizó estado de factura',
    CREATE_PAYMENT: 'creó pago',
    UPDATE_PAYOUT_STATUS: 'actualizó estado de pago',
    LOGIN: 'inició sesión',
    LOGOUT: 'cerró sesión',
  }

  return actionTranslations[action] || action.toLowerCase()
}

// Función para formatear el rol de usuario
const formatRole = (role: string) => {
  const roleTranslations: { [key: string]: string } = {
    ADMIN: 'Admin',
    DISPATCHER: 'Despachador',
    WAREHOUSE_STAFF: 'Almacén',
    DRIVER: 'Conductor',
    CUSTOMER_SUPPORT: 'Soporte',
    CLIENT: 'Cliente',
  }

  return roleTranslations[role] || role
}

// Función para obtener el detalle principal de manera minimalista
const getMainDetail = (log: any) => {
  if (!log.details) return ''

  try {
    const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details

    // Para diferentes tipos de acciones, mostrar el detalle más relevante
    if (details.tracking_code) return `Código: ${details.tracking_code}`
    if (details.client_name) return details.client_name
    if (details.license_plate) return `Placa: ${details.license_plate}`
    if (details.type_name) return details.type_name
    if (details.warehouse_name) return details.warehouse_name
    if (details.route_name) return details.route_name
    if (details.full_name) return details.full_name
    if (details.username) return details.username
    if (details.status) return `Estado: ${details.status}`
    if (details.amount) return `$${details.amount}`

    // Si no hay detalles específicos, mostrar tabla y ID si están disponibles
    if (log.target_table && log.target_id) {
      return `${log.target_table}: ${log.target_id.substring(0, 8)}...`
    }

    return ''
  } catch (e) {
    return ''
  }
}

onMounted(async () => {
  try {
    const { data } = await api.getAuditLog()
    logs.value = data.logs || []
    console.log('Audit logs cargados:', logs.value)
  } catch (e) {
    console.error('Error cargando audit logs:', e)
    logs.value = []
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <VaCard>
    <VaCardTitle class="flex justify-between">
      <h1 class="card-title text-secondary font-bold uppercase">Registro de Actividad</h1>
    </VaCardTitle>
    <VaCardContent>
      <div v-if="loading" class="text-center py-8">
        <VaProgressCircle indeterminate />
        <p class="mt-2">Cargando actividad reciente...</p>
      </div>
      <div v-else-if="logs.length === 0" class="text-center py-8 text-gray-500">
        <VaIcon name="fa4-info-circle" size="2rem" class="mb-2" />
        <p>No hay actividad registrada</p>
      </div>
      <div v-else class="timeline-container mt-4">
        <table class="w-full">
          <tbody>
            <VaTimelineItem
              v-for="log in logs"
              :key="log.log_id"
              :date="
                new Date(log.created_at).toLocaleString('es-CL', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              "
              :icon="getActionIcon(log.action).icon"
              :icon-color="getActionIcon(log.action).color"
            >
              <div class="timeline-content-minimal">
                <div class="flex items-center justify-between">
                  <div>
                    <span class="font-medium text-sm">
                      {{ log.user?.full_name || log.user?.username || 'Usuario' }}
                    </span>
                    <VaBadge
                      v-if="log.user?.role?.role_name"
                      :text="formatRole(log.user.role.role_name)"
                      color="info"
                      class="mx-2"
                      size="small"
                    />
                    <span class="text-gray-600 text-sm" :class="!log.user?.role?.role_name ? 'ml-2' : ''">
                      {{ formatAction(log.action) }}
                    </span>
                  </div>
                </div>

                <!-- Detalles minimalistas -->
                <div v-if="getMainDetail(log)" class="text-xs text-gray-500 mt-1">
                  {{ getMainDetail(log) }}
                </div>
              </div>
            </VaTimelineItem>
          </tbody>
        </table>
      </div>
    </VaCardContent>
  </VaCard>
</template>

<style scoped>
.timeline-container {
  max-height: 400px;
  overflow-y: auto;
  padding-right: 8px;
  margin-right: -8px;
}

.timeline-container::-webkit-scrollbar {
  width: 6px;
}

.timeline-container::-webkit-scrollbar-track {
  background: var(--va-background-element);
  border-radius: 3px;
}

.timeline-container::-webkit-scrollbar-thumb {
  background: var(--va-background-border);
  border-radius: 3px;
}

.timeline-container::-webkit-scrollbar-thumb:hover {
  background: var(--va-secondary);
}

.timeline-content-minimal {
  min-width: 200px;
  padding: 0.25rem 0;
}

.timeline-content-minimal .text-gray-500 {
  color: var(--va-secondary);
}

.timeline-content-minimal .text-gray-600 {
  color: var(--va-text-primary);
}
</style>
