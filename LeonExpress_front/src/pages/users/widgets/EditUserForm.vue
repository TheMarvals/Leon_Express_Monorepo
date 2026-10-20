<script setup lang="ts">
import { ref, onMounted, watch, computed, PropType } from 'vue'
import { useForm, useToast } from 'vuestic-ui'
import { validators } from '../../../services/utils'
import api from '../../../services/api'
import { User } from '../types'

const props = defineProps({
  user: { type: Object as PropType<User | null>, default: null },
  saving: { type: Boolean, default: false },
})

// --- 1. SE DEFINE EL PAYLOAD CON LA ESTRUCTURA DEL FRONTEND ('fullname') ---
interface UserFormPayload {
  username: string
  password?: string
  fullname: string // Se usa camelCase para consistencia en el frontend
  email: string
  phone: string
  role_id: string | null
  warehouse_id: string | null
  vehicle?: { type_id: string; license_plate: string }
}

const emit = defineEmits<{
  (event: 'save', payload: UserFormPayload): void
  (event: 'close'): void
}>()

const { validate, reset } = useForm('user-form')
const { init: notify } = useToast()

const username = ref('')
const password = ref('')
const fullname = ref('') // Se renombra la variable para coincidir
const email = ref('')
const phone = ref('')
const role_id = ref<string | null>(null)
const warehouse_id = ref<string | null>(null)
const vehicleTypeId = ref<string | null>(null)
const licensePlate = ref('')
const vehicleTypes = ref<{ text: string; value: string }[]>([])
const vehicleTypesError = ref(false)
const vehicleTypesLoading = ref(false)

const roles = ref<{ text: string; value: string }[]>([])
const warehouses = ref<{ text: string; value: string }[]>([])
const isLoading = ref(true)

const isEditing = computed(() => !!props.user)
const isNewDriver = computed(
  () => !isEditing.value && roles.value.find((role) => role.value === role_id.value)?.text === 'DRIVER',
)

const loadVehicleTypes = async () => {
  if (vehicleTypesLoading.value) return
  vehicleTypesLoading.value = true
  vehicleTypesError.value = false
  try {
    const { data } = await api.getVehicleTypes({ perPage: 1000 })
    vehicleTypes.value = data.vehicleTypes.map((type: any) => ({ text: type.type_name, value: type.type_id }))
  } catch {
    vehicleTypesError.value = true
  } finally {
    vehicleTypesLoading.value = false
  }
}

watch(isNewDriver, (selected) => {
  if (selected && !vehicleTypes.value.length) void loadVehicleTypes()
})

onMounted(async () => {
  isLoading.value = true
  try {
    const [rolesRes, warehousesRes] = await Promise.all([api.getRoles(), api.getWarehouses()])
    roles.value = rolesRes.data.map((r: any) => ({ text: r.role_name, value: r.role_id }))
    warehouses.value = warehousesRes.data.map((w: any) => ({ text: w.warehouse_name, value: w.warehouse_id }))
  } catch (err) {
    notify({ message: 'Error al cargar datos para el formulario', color: 'danger' })
  } finally {
    isLoading.value = false
  }
})

watch(
  () => props.user,
  (userData) => {
    vehicleTypeId.value = null
    licensePlate.value = ''
    if (userData) {
      username.value = userData.username || ''
      fullname.value = userData.fullname || '' // Se usa la variable correcta
      email.value = userData.email || ''
      phone.value = userData.phone || ''
      role_id.value = userData.role_id || null
      warehouse_id.value = userData.warehouse_id || null
      password.value = ''
    } else {
      reset()
      username.value = ''
      password.value = ''
      fullname.value = ''
      email.value = ''
      phone.value = ''
      role_id.value = null
      warehouse_id.value = null
    }
  },
  { immediate: true },
)

const handleSubmit = () => {
  if (props.saving || !validate()) return

  const finalRoleId = (role_id.value as any)?.value || role_id.value
  const finalWarehouseId = (warehouse_id.value as any)?.value || warehouse_id.value

  // --- 2. SE CONSTRUYE EL PAYLOAD CON 'fullname' ---
  const payload: UserFormPayload = {
    username: username.value,
    fullname: fullname.value, // Se usa camelCase
    email: email.value,
    phone: phone.value,
    role_id: finalRoleId,
    warehouse_id: finalWarehouseId,
  }

  if (password.value) {
    payload.password = password.value
  }

  if (isNewDriver.value) {
    if (vehicleTypesError.value || !vehicleTypes.value.some((type) => type.value === vehicleTypeId.value)) return
    payload.vehicle = { type_id: vehicleTypeId.value!, license_plate: licensePlate.value.trim().toUpperCase() }
  }

  emit('save', payload)
}
</script>

<template>
  <div v-if="isLoading" class="flex justify-center items-center h-64">
    <VaProgressCircle indeterminate />
  </div>
  <VaForm v-else ref="user-form" v-slot="{ isValid }" class="flex flex-col gap-4">
    <VaInput v-model="username" label="Username" :rules="[validators.required]" />
    <VaInput
      v-model="password"
      label="Password"
      type="password"
      :rules="[
        (v) => isEditing || !!v || 'La contraseña es requerida.',
        (v) => !v || v.length >= 6 || 'La contraseña debe tener mínimo 6 caracteres',
      ]"
      :placeholder="isEditing ? 'Dejar en blanco para no cambiar' : ''"
    />
    <VaInput v-model="fullname" label="Nombre completo" :rules="[validators.required]" />
    <VaInput v-model.trim="email" label="Email" :rules="[validators.email]" />
    <VaInput v-model="phone" label="Teléfono" />
    <VaSelect
      v-model="role_id"
      label="Rol"
      :options="roles"
      text-by="text"
      value-by="value"
      :rules="[validators.required]"
    />
    <template v-if="isNewDriver">
      <VaSelect
        v-model="vehicleTypeId"
        label="Tipo de vehículo"
        :options="vehicleTypes"
        :loading="vehicleTypesLoading"
        text-by="text"
        value-by="value"
        :rules="[validators.required]"
      />
      <div v-if="vehicleTypesError" role="alert">
        <p>No se pudieron cargar los tipos de vehículo.</p>
        <VaButton preset="secondary" @click="loadVehicleTypes">Reintentar</VaButton>
      </div>
      <p v-else-if="!vehicleTypesLoading && !vehicleTypes.length">
        No hay tipos de vehículo disponibles. Regístralos en Tipos de vehículo.
      </p>
      <VaInput
        v-model.trim="licensePlate"
        label="Patente"
        :rules="[validators.required, (value) => value.trim().length <= 20 || 'La patente admite hasta 20 caracteres']"
      />
    </template>
    <VaSelect
      v-model="warehouse_id"
      label="Almacén"
      :options="warehouses"
      text-by="text"
      value-by="value"
      :rules="[validators.required]"
    />
    <div class="flex justify-end gap-2 mt-4">
      <VaButton preset="secondary" :disabled="saving" @click="$emit('close')">Cancelar</VaButton>
      <VaButton
        :loading="saving"
        :disabled="saving || !isValid || (isNewDriver && (vehicleTypesError || !vehicleTypes.length))"
        @click="handleSubmit"
      >
        {{ isEditing ? 'Guardar' : 'Crear' }}
      </VaButton>
    </div>
  </VaForm>
</template>
