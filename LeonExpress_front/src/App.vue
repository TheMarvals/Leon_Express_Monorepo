<script setup lang="ts">
import { ref } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import LoadingOverlay from '@/components/LoadingOverlay.vue'

// PWA Auto-update configuration
const updateAvailable = ref(false)
const isUpdating = ref(false)

const { needRefresh, updateServiceWorker } = useRegisterSW({
  immediate: true,
  onRegisteredSW(swScriptUrl, registration) {
    if (registration) {
      // Verificar actualizaciones cada 15 minutos o cuando la pestaña vuelve a primer plano
      setInterval(() => {
        registration.update()
      }, 15 * 60 * 1000)

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update()
        }
      })
    }
  },
  onRegisterError(error) {
    console.error('Error al registrar Service Worker:', error)
  },
})

// Limpiar caché del Service Worker
const clearServiceWorkerCache = async () => {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    return new Promise<void>((resolve) => {
      const messageChannel = new MessageChannel()
      messageChannel.port1.onmessage = (event) => {
        if (event.data && event.data.type === 'CACHE_CLEARED') {
          resolve()
        }
      }
      navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_CACHE' }, [messageChannel.port2])
      setTimeout(() => resolve(), 1000)
    })
  }
  return Promise.resolve()
}

// Actualizar manualmente cuando el usuario lo solicite
const handleUpdate = async () => {
  if (isUpdating.value) return
  isUpdating.value = true

  try {
    await clearServiceWorkerCache()
    await updateServiceWorker(true)
    if ('caches' in window) {
      const cacheNames = await caches.keys()
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
    }
  } catch (err) {
    console.error('Error durante la actualización:', err)
  } finally {
    window.location.reload()
  }
}

import { watch } from 'vue'
watch(needRefresh, (newValue) => {
  if (newValue && !import.meta.env.DEV) {
    updateAvailable.value = true
  }
})
</script>

<template>
  <div>
    <!-- Loading Overlay Global -->
    <LoadingOverlay />

    <!-- Notificación de actualización amigable sin emojis -->
    <Transition name="slide-fade">
      <div v-if="updateAvailable" class="update-notification">
        <div class="update-content">
          <VaIcon name="sync" spin class="mr-1" />
          <span class="update-text">Nueva versión disponible.</span>
          <VaButton size="small" color="#ffffff" preset="secondary" class="ml-2 font-bold text-primary" :loading="isUpdating" @click="handleUpdate">
            Actualizar ahora
          </VaButton>
          <VaButton size="small" preset="plain" color="#ffffff" class="ml-1" @click="updateAvailable = false">
            Más tarde
          </VaButton>
        </div>
      </div>
    </Transition>

    <RouterView />
  </div>
</template>

<style lang="scss">
#app {
  font-family: 'Inter', Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  margin: 0;
  min-width: 20rem;
}

/* Notificación de actualización PWA */
.update-notification {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1rem 2rem;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.update-content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-weight: 600;
  font-size: 0.95rem;
}

.update-icon {
  font-size: 1.5rem;
  animation: rotate 2s linear infinite;
}

.update-text {
  white-space: nowrap;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Animación de entrada/salida */
.slide-fade-enter-active {
  transition: all 0.4s ease-out;
}

.slide-fade-leave-active {
  transition: all 0.3s cubic-bezier(1, 0.5, 0.8, 1);
}

.slide-fade-enter-from {
  transform: translateX(-50%) translateY(-20px);
  opacity: 0;
}

.slide-fade-leave-to {
  transform: translateX(-50%) translateY(-20px);
  opacity: 0;
}

/* Responsive */
@media (max-width: 640px) {
  .update-notification {
    top: 10px;
    left: 10px;
    right: 10px;
    transform: none;
    padding: 0.75rem 1rem;
  }

  .update-content {
    font-size: 0.875rem;
  }
}
</style>
