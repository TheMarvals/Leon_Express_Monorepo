<script setup lang="ts">
import { ref, onMounted, watch, computed, PropType } from 'vue'
import { useForm, useToast } from 'vuestic-ui'
import { validators } from '../../../services/utils'
import api from '../../../services/api'
import { Vehicle } from '../types'

interface VehicleFormData {
  license_plate: string
  type_id: string | null
  user_id: string | null // ID del conductor
}

const props = defineProps({
  vehicle: { type: Object as PropType<Vehicle | null>, default: null },
})

const emit = defineEmits<{
  (event: 'save', payload: VehicleFormData): void
  (event: 'close'): void
}>()

const { validate, reset } = useForm('vehicle-form')
const { init: notify } = useToast()

const license_plate = ref('')
const type_id = ref<string | null>(null)
const user_id = ref<string | null>(null)

const vehicleTypes = ref<{ text: string; value: string }[]>([])
const drivers = ref<{ text: string; value: string }[]>([])
const isLoading = ref(true)

const isEditing = computed(() => !!props.vehicle)

onMounted(async () => {
  isLoading.value = true
  try {
    const [typesRes, usersRes] = await Promise.all([
      api.getVehicleTypes({ perPage: 1000 }), // Obtener todos los tipos
      api.allUsers({ perPage: 1000 }), // Obtener todos los usuarios (para filtrar conductores)
    ])
    vehicleTypes.value = typesRes.data.vehicleTypes.map((t: any) => ({ text: t.type_name, value: t.type_id }))
    const currentDriverId = props.vehicle?.user_id

    drivers.value = usersRes.data.users
      .filter((user: any) => {
        const isDriverAndActive = user.role_name === 'DRIVER' && user.is_active === true
        const isUnassigned = user.vehicles && user.vehicles.length === 0
        const isCurrentDriverOfThisVehicle = isEditing.value && user.user_id === currentDriverId
        return isDriverAndActive && (isUnassigned || isCurrentDriverOfThisVehicle)
      })
      .map((d: any) => ({ text: d.full_name, value: d.user_id }))
  } catch (err) {
    notify({ message: 'Error al cargar datos para el formulario', color: 'danger' })
  } finally {
    isLoading.value = false
  }
})

watch(
  () => props.vehicle,
  (vehicleData) => {
    if (vehicleData) {
      license_plate.value = vehicleData.license_plate || ''
      type_id.value = vehicleData.type_id || null
      user_id.value = vehicleData.user_id || null
    } else {
      reset()
      license_plate.value = ''
      type_id.value = null
      user_id.value = null
    }
  },
  { immediate: true },
)

const handleSubmit = () => {
  if (!validate()) return
  const finalTypeId =
    typeof type_id.value === 'object' && type_id.value !== null ? (type_id.value as any).value : type_id.value

  const finalUserId =
    typeof user_id.value === 'object' && user_id.value !== null ? (user_id.value as any).value : user_id.value

  const payload: VehicleFormData = {
    license_plate: license_plate.value,
    type_id: finalTypeId,
    user_id: finalUserId,
  }
  emit('save', payload)
}
</script>

<template>
  <div v-if="isLoading" class="flex justify-center items-center h-64">
    <VaProgressCircle indeterminate />
  </div>
  <VaForm v-else ref="vehicle-form" v-slot="{ isValid }" class="flex flex-col gap-4">
    <VaInput v-model="license_plate" label="Patente" :rules="[validators.required]" />

    <VaSelect
      v-model="type_id"
      label="Tipo de Vehículo"
      :options="vehicleTypes"
      :rules="[validators.required]"
      text-by="text"
      value-by="value"
    />
    <VaSelect
      v-model="user_id"
      label="Conductor Asignado"
      :options="drivers"
      clearable
      text-by="text"
      value-by="value"
    />
    <div class="flex justify-end gap-2 mt-4">
      <VaButton preset="secondary" @click="$emit('close')">Cancelar</VaButton>
      <VaButton :disabled="!isValid" @click="handleSubmit">
        {{ isEditing ? 'Guardar' : 'Crear' }}
      </VaButton>
    </div>
  </VaForm>
</template>
