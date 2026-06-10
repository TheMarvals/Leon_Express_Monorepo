import api from '@/services/api'

export async function clearExistingSubscription() {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    try {
      const registration = await navigator.serviceWorker.ready
      const existingSubscription = await registration.pushManager.getSubscription()

      if (existingSubscription) {
        console.log('Limpiando suscripción existente')
        await existingSubscription.unsubscribe()
        return true
      }
    } catch (error) {
      console.error('Error al limpiar suscripción existente:', error)
    }
  }
  return false
}

export async function subscribeUserToPush(publicVapidKey: string) {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    const registration = await navigator.serviceWorker.ready

    try {
      // Verificar si ya existe una suscripción
      const existingSubscription = await registration.pushManager.getSubscription()

      if (existingSubscription) {
        // Verificar si la VAPID key es diferente
        const existingKey = existingSubscription.options?.applicationServerKey
        const newKey = urlBase64ToUint8Array(publicVapidKey)

        // Si las keys son diferentes, desuscribirse primero
        if (existingKey && !areUint8ArraysEqual(existingKey, newKey)) {
          console.log('Desuscribiendo suscripción anterior con VAPID key diferente')
          await existingSubscription.unsubscribe()
        } else if (existingKey && areUint8ArraysEqual(existingKey, newKey)) {
          // Si ya existe con la misma key, usar la existente
          console.log('Usando suscripción existente')
          await api.pushSubscribe(existingSubscription)
          return existingSubscription
        }
      }

      // Crear nueva suscripción
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
      })

      // Enviar la suscripción al backend
      await api.pushSubscribe(subscription)
      return subscription
    } catch (error) {
      console.error('Error al manejar suscripción push:', error)
      throw error
    }
  }
  throw new Error('Push API no soportada')
}

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

function areUint8ArraysEqual(arr1: ArrayBuffer | Uint8Array, arr2: ArrayBuffer | Uint8Array): boolean {
  const view1 = arr1 instanceof ArrayBuffer ? new Uint8Array(arr1) : arr1
  const view2 = arr2 instanceof ArrayBuffer ? new Uint8Array(arr2) : arr2

  if (view1.length !== view2.length) return false

  for (let i = 0; i < view1.length; i++) {
    if (view1[i] !== view2[i]) return false
  }
  return true
}
