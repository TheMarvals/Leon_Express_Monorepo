<script setup lang="ts">
import { ref, onMounted, watch, computed, PropType } from 'vue'
import { useForm, useToast } from 'vuestic-ui'
import { validators } from '../../../services/utils'
import api from '../../../services/api'
import { Pickup } from '../types'

const value = ref(new Date()) // Replaced pickup_time with value

const props = defineProps({
  pickup: { type: Object as PropType<Pickup | null>, default: null },
})

interface PickupFormData {
  user_id: string | null
  client_id: string | null
  pickup_scheduled_date: Date
  notes: string
}

const emit = defineEmits<{
  (event: 'save', payload: PickupFormData): void
  (event: 'close'): void
}>()

const { validate, reset } = useForm('pickup-form')
const { init: notify } = useToast()

const user_id = ref<string | null>(null)
const client_id = ref<string | null>(null)
const pickup_scheduled_date = ref(new Date())
const notes = ref('')

const drivers = ref<{ text: string; value: string }[]>([])
const clients = ref<{ text: string; value: string }[]>([])
const isLoading = ref(true)

const isEditing = computed(() => !!props.pickup)

onMounted(async () => {
  isLoading.value = true
  try {
    const [usersRes, clientsRes] = await Promise.all([
      api.allUsers({ pageSize: 10000, page: 1 }),
      api.getClients({ pageSize: 10000, page: 1 }),
    ])
    drivers.value = usersRes.data.users
      .filter((u: any) => u.role_name === 'DRIVER' && u.is_active)
      .map((d: any) => ({ text: d.full_name, value: d.user_id }))
    clients.value = clientsRes.data.clients.map((c: any) => ({ text: c.client_name, value: c.client_id }))
  } catch (err) {
    notify({ message: 'Error al cargar datos para el formulario', color: 'danger' })
  } finally {
    isLoading.value = false
  }
})

watch(
  () => props.pickup,
  (pickupData) => {
    if (pickupData) {
      const date = new Date(pickupData.pickup_scheduled_date)
      value.value = date // Update value instead of pickup_time
      user_id.value = pickupData.user_id || null
      client_id.value = pickupData.client_id || null
      pickup_scheduled_date.value = new Date(pickupData.pickup_scheduled_date)
      notes.value = pickupData.notes || ''
    } else {
      reset()
      value.value = new Date()
      // Si hay un preserveDriverId, mantenerlo; si no, resetear
      user_id.value = props.preserveDriverId || null
      client_id.value = null
      pickup_scheduled_date.value = new Date()
      notes.value = ''
    }
  },
  { immediate: true },
)

const handleSubmit = () => {
  if (!validate()) return
  const combinedDate = new Date(pickup_scheduled_date.value)
  combinedDate.setHours(value.value.getHours(), value.value.getMinutes())

  const payload: PickupFormData = {
    user_id: (user_id.value as any)?.value || user_id.value,
    client_id: (client_id.value as any)?.value || client_id.value,
    pickup_scheduled_date: combinedDate,
    notes: notes.value,
  }

  emit('save', payload)
}
</script>

<template>
  <div v-if="isLoading" class="flex justify-center items-center h-64">
    <VaProgressCircle indeterminate />
  </div>
  <VaForm v-else ref="pickup-form" v-slot="{ isValid }" class="flex flex-col gap-4">
    <VaSelect
      v-model="client_id"
      label="Cliente"
      :options="clients"
      :rules="[validators.required]"
      text-by="text"
      value-by="value"
      :readonly="isEditing"
    />
    <VaSelect
      v-model="user_id"
      label="Asignar a Conductor"
      :options="drivers"
      :rules="[validators.required]"
      text-by="text"
      value-by="value"
      searchable
      :max-height="300"
      class="driver-select"
    />
    <div class="flex gap-4">
      <VaDateInput v-model="pickup_scheduled_date" label="Fecha" :rules="[validators.required]" class="flex-1" />
      <VaTimeInput
        v-model="value"
        label="Hora"
        :rules="[validators.required]"
        class="flex-1 time-input"
        color="#10b981"
      />
    </div>
    <VaTextarea v-model="notes" label="Notas (Opcional)" />
    <div class="flex justify-end gap-2 mt-4">
      <VaButton preset="secondary" @click="$emit('close')">Cancelar</VaButton>
      <VaButton :disabled="!isValid" @click="handleSubmit">
        {{ isEditing ? 'Guardar Cambios' : 'Crear Recolección' }}
      </VaButton>
    </div>
  </VaForm>
</template>

<style scoped>
/* Estilos para permitir scroll en el dropdown del conductor */
:deep(.driver-select .va-select-dropdown) {
  max-height: 300px !important;
  overflow-y: auto !important;
}

:deep(.driver-select .va-select-dropdown__content) {
  max-height: 300px !important;
  overflow-y: auto !important;
}

/* Asegurar que el scroll funcione en móviles */
:deep(.driver-select .va-select-dropdown) {
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
</style>
