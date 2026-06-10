import { subscribeUserToPush } from '@/push/subscribe'
// src/registerServiceWorker.ts
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('Service Worker registrado con éxito:', registration)
      })
      .catch((error) => {
        console.error('Error al registrar el Service Worker:', error)
      })
  })
}

// Solicitar permisos de notificaciones push
export async function requestNotificationPermission() {
  if ('Notification' in window) {
    const permission = await Notification.requestPermission()
    if (permission === 'granted') {
      console.log('Permiso de notificaciones concedido')
      // Suscribirse a push y enviar al backend
      try {
        // VAPID public key from environment variable
        const VAPID_PUBLIC_KEY =
          import.meta.env.VITE_VAPID_PUBLIC_KEY ||
          'BBic48OIH0TpgqlNqg3c-sJvLLm9n2J9wzE-iLUt_Zz1phuCQGrT_pde-Y0VCWzXJ1yqMZ3_6OPvLPltvwynOjQ'
        await subscribeUserToPush(VAPID_PUBLIC_KEY)
        console.log('Suscripción push enviada al backend')
      } catch (err) {
        console.error('Error al suscribirse a push:', err)
      }
    } else {
      console.warn('Permiso de notificaciones denegado')
    }
    return permission
  }
  return 'unsupported'
}
