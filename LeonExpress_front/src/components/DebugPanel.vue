<template>
  <div
    v-if="showDebug"
    class="debug-panel"
    style="position: fixed; bottom: 0; left: 0; right: 0; background: #ff4444; padding: 10px; z-index: 9999"
  >
    <div class="text-white text-xs mb-2">🐛 Panel de Debug - Driver</div>

    <div class="flex flex-wrap gap-2">
      <button class="bg-white text-red-500 px-2 py-1 rounded text-xs" @click="clearServiceWorkers">Limpiar SW</button>

      <button class="bg-white text-red-500 px-2 py-1 rounded text-xs" @click="checkStatus">Ver Estado</button>

      <button class="bg-white text-red-500 px-2 py-1 rounded text-xs" @click="resubscribe">Re-suscribir</button>

      <button class="bg-white text-red-500 px-2 py-1 rounded text-xs" @click="testNotification">Prueba Local</button>

      <button class="bg-white text-red-500 px-2 py-1 rounded text-xs" @click="showDebug = false">✕</button>
    </div>

    <div v-if="debugInfo" class="text-white text-xs mt-2">
      {{ debugInfo }}
    </div>
  </div>

  <!-- Botón para mostrar debug (esquina superior derecha) -->
  <button
    v-if="!showDebug && isDev"
    class="fixed top-2 right-2 bg-red-500 text-white px-2 py-1 rounded text-xs z-50"
    style="z-index: 9998"
    @click="showDebug = true"
  >
    🐛
  </button>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const showDebug = ref(false)
const debugInfo = ref('')
const isDev = ref(false)

// Función para limpiar Service Workers
const clearServiceWorkers = async () => {
  try {
    debugInfo.value = 'Limpiando SW...'

    // Desuscribir push
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await subscription.unsubscribe()
      }
    }

    // Eliminar registrations
    const registrations = await navigator.serviceWorker.getRegistrations()
    for (const registration of registrations) {
      await registration.unregister()
    }

    // Limpiar cache
    if ('caches' in window) {
      const cacheNames = await caches.keys()
      for (const name of cacheNames) {
        await caches.delete(name)
      }
    }

    debugInfo.value = '✅ SW limpiado. Recarga la página.'
  } catch (error: any) {
    debugInfo.value = `❌ Error: ${error.message}`
  }
}

// Función para verificar estado
const checkStatus = async () => {
  try {
    const token = localStorage.getItem('token')
    let userId = 'No token'
    let username = 'N/A'

    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]))
      userId = payload.user_id.substring(0, 8) + '...'
      username = payload.username || 'N/A'
    }

    const permission = Notification.permission

    let hasSubscription = false
    let swState = 'No SW'

    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready
        swState = 'Ready'
        const subscription = await registration.pushManager.getSubscription()
        hasSubscription = !!subscription

        if (subscription) {
          const endpoint = subscription.endpoint
          swState += ` | Endpoint: ${endpoint.includes('fcm') ? 'FCM' : 'Other'}`
        }
      } catch (swError: any) {
        swState = `Error: ${swError.message.substring(0, 20)}...`
      }
    }

    debugInfo.value = `${username} (${userId}) | Perm: ${permission} | SW: ${swState} | Sub: ${
      hasSubscription ? '✅' : '❌'
    }`
  } catch (error: any) {
    debugInfo.value = `❌ Error: ${error.message}`
  }
}

// Re-suscribir
const resubscribe = async () => {
  try {
    debugInfo.value = 'Re-suscribiendo...'

    if (Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        debugInfo.value = '❌ Permisos denegados'
        return
      }
    }

    const registration = await navigator.serviceWorker.ready
    const existingSubscription = await registration.pushManager.getSubscription()

    if (existingSubscription) {
      await existingSubscription.unsubscribe()
    }

    const VAPID_KEY = 'BBic48OIH0TpgqlNqg3c-sJvLLm9n2J9wzE-iLUt_Zz1phuCQGrT_pde-Y0VCWzXJ1yqMZ3_6OPvLPltvwynOjQ'

    function urlBase64ToUint8Array(base64String: string) {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
      const rawData = window.atob(base64)
      const outputArray = new Uint8Array(rawData.length)
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i)
      }
      return outputArray
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
    })

    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify(subscription),
    })

    const result = await response.json()
    debugInfo.value = result.success ? '✅ Re-suscrito OK' : '❌ Error backend'
  } catch (error: any) {
    debugInfo.value = `❌ Error: ${error.message}`
  }
}

// Prueba de notificación local
const testNotification = async () => {
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready
      await registration.showNotification('🧪 Prueba Local', {
        body: 'Si ves esto, los permisos funcionan',
        icon: '/android-chrome-192x192.png',
        badge: '/android-chrome-192x192.png',
      })
      debugInfo.value = '✅ Notificación local enviada (SW)'
    } else {
      // Fallback para navegadores sin SW
      new Notification('🧪 Prueba Local', {
        body: 'Si ves esto, los permisos funcionan',
        icon: '/android-chrome-192x192.png',
      })
      debugInfo.value = '✅ Notificación local enviada (directa)'
    }
  } catch (error: any) {
    debugInfo.value = `❌ Error: ${error.message}`
  }
}

onMounted(() => {
  // Mostrar debug solo en desarrollo o si hay parámetro especial
  isDev.value =
    window.location.hostname === 'localhost' ||
    window.location.search.includes('debug=true') ||
    localStorage.getItem('showDebug') === 'true'
})
</script>
