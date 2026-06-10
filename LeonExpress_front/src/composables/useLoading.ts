import { ref } from 'vue'

const isLoading = ref(false)
const loadingMessage = ref('Procesando...')
const activeRequests = ref(0)

export function useLoading() {
  const show = (message: string = 'Procesando...') => {
    activeRequests.value++
    loadingMessage.value = message
    isLoading.value = true
  }

  const hide = () => {
    activeRequests.value = Math.max(0, activeRequests.value - 1)
    if (activeRequests.value === 0) {
      isLoading.value = false
    }
  }

  const forceHide = () => {
    activeRequests.value = 0
    isLoading.value = false
  }

  return {
    isLoading,
    loadingMessage,
    show,
    hide,
    forceHide,
  }
}
