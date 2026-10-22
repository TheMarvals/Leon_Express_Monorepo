<script setup lang="ts">
import { ref, computed } from 'vue'
import { useToast } from 'vuestic-ui'
import { useUserStore } from '@/stores/user-store'
import api from '@/services/api'

const emit = defineEmits<{ (event: 'created'): void }>()
const userStore = useUserStore()
const { init: notify } = useToast()
const clientAddress = computed(() => userStore.user?.client?.address || '')

// Modal Colecta
const showPickupModal = ref(false)
const isSubmittingPickup = ref(false)
const localPickupDate = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const pickupDate = ref(localPickupDate())
const pickupNotes = ref('')
const pickupError = ref('')
const openPickupModal = () => {
  pickupDate.value = localPickupDate()
  pickupError.value = ''
  showPickupModal.value = true
}

// Solicitar Colecta
const handleCreatePickup = async () => {
  if (isSubmittingPickup.value) return
  pickupError.value = ''
  const scheduledDate = new Date(pickupDate.value)
  if (!pickupDate.value || Number.isNaN(scheduledDate.getTime())) {
    pickupError.value = 'Selecciona una fecha y hora de recolección válidas.'
    return
  }
  isSubmittingPickup.value = true
  try {
    await api.createPickup({
      pickup_scheduled_date: scheduledDate.toISOString(),
      notes: pickupNotes.value,
    })

    notify({
      message: 'Solicitud de colecta enviada. Puedes revisar su estado en tus colectas.',
      color: 'success',
    })
    showPickupModal.value = false
    pickupNotes.value = ''
    emit('created')
  } catch (error: any) {
    pickupError.value =
      error.response?.data?.error ||
      error.response?.data?.errors?.[0]?.msg ||
      'No se pudo crear la solicitud de colecta. Intenta nuevamente.'
  } finally {
    isSubmittingPickup.value = false
  }
}
</script>

<template>
  <VaButton color="#03323a" icon="local_shipping" @click="openPickupModal">Solicitar Colecta</VaButton>
  <VaModal
    v-model="showPickupModal"
    title="Solicitar Nueva Colecta"
    hide-default-actions
    :no-dismiss="isSubmittingPickup"
  >
    <div class="space-y-4 py-2">
      <p class="text-sm text-gray-600">
        Indica la fecha y notas para coordinar el retiro de tus paquetes en:
        <strong class="block text-gray-800 mt-1">{{ clientAddress }}</strong>
      </p>

      <VaInput v-model="pickupDate" type="datetime-local" label="Fecha y Hora Estimada de Recolección" class="w-full" />

      <VaTextarea
        v-model="pickupNotes"
        label="Notas o Instrucciones para el Recolector"
        placeholder="Ej: Paquetes en recepción, tocar timbre 2B, 15 bultos aprox..."
        class="w-full"
        rows="3"
      />
      <VaAlert v-if="pickupError" color="danger" role="alert">{{ pickupError }}</VaAlert>
      <div class="flex justify-end gap-2">
        <VaButton preset="secondary" :disabled="isSubmittingPickup" @click="showPickupModal = false">
          Cancelar
        </VaButton>
        <VaButton
          color="#03323a"
          :loading="isSubmittingPickup"
          :disabled="isSubmittingPickup || !pickupDate"
          @click="handleCreatePickup"
        >
          Solicitar Recolección
        </VaButton>
      </div>
    </div>
  </VaModal>
</template>
