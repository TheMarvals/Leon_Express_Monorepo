<script setup lang="ts">
import { ref, onMounted, computed, PropType, watch } from 'vue'
import { useForm, useToast } from 'vuestic-ui'
import { validators } from '../../../services/utils'
import api from '../../../services/api'
import { Route } from '../types'
import { User } from '../../users/types'
import { Vehicle } from '../../vehicles/types'
import { Warehouse } from '../../warehouses/types'

const props = defineProps({
  route: { type: Object as PropType<Route | null>, default: null },
})

const emit = defineEmits<{
  (event: 'save', payload: any): void
  (event: 'close'): void
}>()

const { validate } = useForm('route-form')
const { init: notify } = useToast()

const user_id = ref('')
const vehicle_id = ref('')
const warehouse_id = ref('')
const route_name = ref('')
const start_date = ref(new Date())
const status = ref<'PENDIENTE' | 'EN_PROGRESO' | 'FINALIZADA' | 'CANCELADA'>('PENDIENTE')
const route_type = ref<'ENTREGA' | 'DEVOLUCION'>('ENTREGA')

const users = ref<{ text: string; value: string }[]>([])
const warehouses = ref<{ text: string; value: string }[]>([])
const fullVehiclesList = ref<Vehicle[]>([])
const isLoading = ref(true)

const isEditing = computed(() => !!props.route)

onMounted(async () => {
  isLoading.value = true
  try {
    const [usersRes, vehiclesRes, warehousesRes] = await Promise.all([
      api.allUsers({ pageSize: 10000, page: 1 }),
      api.getVehicles({ pageSize: 10000, page: 1 }),
      api.getWarehouses(),
    ])

    // 1. Preparamos las listas para los selectores
    users.value = usersRes.data.users
      .filter((u: User) => u.role_name === 'DRIVER')
      .map((u: User) => ({
        text: u.full_name,
        value: u.user_id,
      }))

    fullVehiclesList.value = vehiclesRes.data.vehicles

    warehouses.value = warehousesRes.data.map((w: Warehouse) => ({
      text: w.warehouse_name,
      value: w.warehouse_id,
    }))

    // 2. Si estamos en modo edición, AHORA asignamos los valores
    if (props.route) {
      user_id.value = props.route.user_id
      vehicle_id.value = props.route.vehicle_id
      warehouse_id.value = props.route.warehouse_id
      route_name.value = props.route.route_name || ''
      start_date.value = new Date(props.route.start_date)
      status.value = props.route.status
      route_type.value = props.route.route_type
    }
  } catch (err) {
    console.error('Error detallado al cargar datos del formulario:', err)
    notify({ message: 'Error al cargar datos para el formulario', color: 'danger' })
  } finally {
    isLoading.value = false
  }
})

const availableVehicles = computed(() => {
  if (!user_id.value) return []
  return fullVehiclesList.value
    .filter((vehicle) => vehicle.user_id === user_id.value)
    .map((vehicle) => ({
      text: vehicle.license_plate,
      value: vehicle.vehicle_id,
    }))
})

watch(user_id, (newUserId, oldUserId) => {
  // Limpiamos la selección de vehículo solo si el conductor realmente cambia y no estamos en modo edición inicial
  if (newUserId !== oldUserId && !isEditing.value) {
    vehicle_id.value = ''
  }
})

const handleSubmit = () => {
  const payload = {
    route_name: route_name.value,
    user_id: user_id.value,
    vehicle_id: vehicle_id.value,
    warehouse_id: warehouse_id.value,
    start_date: start_date.value,
    status: status.value,
    route_type: route_type.value,
  }
  emit('save', payload)
}
</script>

<template>
  <div v-if="isLoading" class="flex justify-center items-center h-64">
    <VaProgressCircle indeterminate />
  </div>
  <VaForm v-else ref="route-form" v-slot="{ isValid }" class="flex flex-col gap-4">
    <VaInput v-model="route_name" label="Nombre de la Ruta (Opcional)" placeholder="Ej: Ruta Stgo. Centro" />
    <VaSelect
      v-model="user_id"
      label="Conductor"
      :options="users"
      :rules="[validators.required]"
      text-by="text"
      value-by="value"
      searchable
    />
    <VaSelect
      v-model="vehicle_id"
      label="Vehículo"
      :options="availableVehicles"
      :rules="[validators.required]"
      :disabled="!user_id"
      text-by="text"
      value-by="value"
      searchable
    />
    <VaSelect
      v-model="warehouse_id"
      label="Almacén de Origen"
      :options="warehouses"
      :rules="[validators.required]"
      text-by="text"
      value-by="value"
      searchable
    />
    <VaDateInput v-model="start_date" label="Fecha y Hora de Inicio" with-time :rules="[validators.required]" />
    <VaSelect
      v-model="status"
      label="Estado"
      :options="['PENDIENTE', 'EN_PROGRESO', 'FINALIZADA', 'CANCELADA']"
      :rules="[validators.required]"
    />
    <VaSelect
      v-model="route_type"
      label="Tipo de Ruta"
      :options="['ENTREGA', 'DEVOLUCION']"
      :rules="[validators.required]"
    />

    <div class="flex justify-end gap-2 mt-4">
      <VaButton preset="secondary" @click="$emit('close')">Cancelar</VaButton>
      <VaButton :disabled="!isValid" @click="handleSubmit">{{ isEditing ? 'Guardar Cambios' : 'Crear Ruta' }}</VaButton>
    </div>
  </VaForm>
</template>
