<template>
  <div class="push-notification-compact">
    <VaButton v-if="showButton" color="primary" size="small" :loading="isLoading" class="w-full" @click="askPermission">
      <FontAwesomeIcon v-if="!isLoading" icon="bell" class="mr-1" />
      {{ isLoading ? 'Configurando...' : 'Activar push' }}
    </VaButton>

    <VaButton v-if="showResetButton" color="warning" size="small" class="w-full mt-1" @click="resetSubscription">
      <FontAwesomeIcon icon="refresh" class="mr-1" />
      Reconfigurar
    </VaButton>

    <div v-if="permission === 'granted' && !error" class="flex items-center text-success text-xs mt-1">
      <FontAwesomeIcon icon="check-circle" class="mr-1" />
      <span>Push activo</span>
    </div>

    <div v-else-if="permission === 'denied'" class="flex items-center text-danger text-xs mt-1">
      <FontAwesomeIcon icon="times-circle" class="mr-1" />
      <span>Denegado</span>
    </div>

    <div v-else-if="error" class="text-danger text-xs mt-1">
      <FontAwesomeIcon icon="exclamation-triangle" class="mr-1" />
      <span>{{ error }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { requestNotificationPermission } from '@/registerServiceWorker'
import { clearExistingSubscription } from '@/push/subscribe'

const permission = ref<NotificationPermission>('default')
const showButton = ref(true)
const showResetButton = ref(false)
const isLoading = ref(false)
const error = ref<string>('')

const askPermission = async () => {
  isLoading.value = true
  error.value = ''

  try {
    const result = await requestNotificationPermission()
    permission.value = result === 'unsupported' ? 'default' : result

    if (permission.value === 'granted') {
      showButton.value = false
      showResetButton.value = true
    } else if (permission.value === 'denied') {
      showButton.value = false
    }
  } catch (err: any) {
    error.value = err.message || 'Error al activar notificaciones'
    if (err.message?.includes('InvalidStateError') || err.message?.includes('different applicationServerKey')) {
      showResetButton.value = true
    }
  } finally {
    isLoading.value = false
  }
}

const resetSubscription = async () => {
  isLoading.value = true
  error.value = ''

  try {
    // Limpiar suscripción existente
    await clearExistingSubscription()

    // Intentar re-suscribir automáticamente
    const result = await requestNotificationPermission()
    permission.value = result === 'unsupported' ? 'default' : result

    if (permission.value === 'granted') {
      showButton.value = false
      showResetButton.value = true
      error.value = '¡Notificaciones reconfiguradas correctamente!'
    } else {
      permission.value = 'default'
      showButton.value = true
      showResetButton.value = false
      error.value = 'Suscripción limpiada. Puedes activar las notificaciones nuevamente.'
    }
  } catch (err: any) {
    error.value = err.message || 'Error al reconfigurar notificaciones'
    showButton.value = true
    showResetButton.value = false
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  if ('Notification' in window) {
    permission.value = Notification.permission
    if (permission.value === 'granted') {
      showButton.value = false
      showResetButton.value = true
    } else if (permission.value === 'denied') {
      showButton.value = false
    }
  } else {
    showButton.value = false
  }
})
</script>
