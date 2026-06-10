<script setup lang="ts">
import { ref, onMounted, watch, computed, PropType } from 'vue'
import { useForm, useToast } from 'vuestic-ui'
import { validators } from '../../../services/utils'
import api from '../../../services/api'
import { User } from '../types'

const props = defineProps({
  user: { type: Object as PropType<User | null>, default: null },
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

const roles = ref<{ text: string; value: string }[]>([])
const warehouses = ref<{ text: string; value: string }[]>([])
const isLoading = ref(true)

const isEditing = computed(() => !!props.user)

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
  if (!validate()) return

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
    <VaSelect
      v-model="warehouse_id"
      label="Almacén"
      :options="warehouses"
      text-by="text"
      value-by="value"
      :rules="[validators.required]"
    />
    <div class="flex justify-end gap-2 mt-4">
      <VaButton preset="secondary" @click="$emit('close')">Cancelar</VaButton>
      <VaButton :disabled="!isValid" @click="handleSubmit">
        {{ isEditing ? 'Guardar' : 'Crear' }}
      </VaButton>
    </div>
  </VaForm>
</template>
