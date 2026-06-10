import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

// Versión del Service Worker - cada build genera un nuevo Service Worker
// Workbox automáticamente genera un hash único para cada archivo en el manifest
// Esto garantiza que cada build sea único y fuerce la actualización
const SW_VERSION = 'v1.0.0'
const CACHE_NAME = 'leon-express-cache-v1'

console.log('[SW] Service Worker iniciado - Versión:', SW_VERSION)

// Forzar activación inmediata de la nueva versión
// eslint-disable-next-line no-undef
self.skipWaiting()
clientsClaim()

// Limpiar caches antiguos al activarse
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando nueva versión, limpiando caches antiguos...')
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Eliminar todos los caches que no sean el actual
            if (cacheName !== CACHE_NAME && cacheName.startsWith('leon-express-cache-')) {
              console.log('[SW] Eliminando cache antiguo:', cacheName)
              return caches.delete(cacheName)
            }
            // También eliminar caches de workbox antiguos
            if (cacheName.startsWith('workbox-') || cacheName.startsWith('external-cache')) {
              console.log('[SW] Eliminando cache workbox:', cacheName)
              return caches.delete(cacheName)
            }
          }),
        )
      })
      .then(() => {
        console.log('[SW] ✅ Limpieza de caches completada')
        // Forzar que todos los clientes usen la nueva versión
        return self.clients.claim()
      }),
  )
})

// Limpiar caches obsoletos de workbox
cleanupOutdatedCaches()

// eslint-disable-next-line no-undef
precacheAndRoute(self.__WB_MANIFEST || [])

registerRoute(
  ({ url }) => url.origin !== self.location.origin,
  new NetworkFirst({
    cacheName: 'external-cache',
    networkTimeoutSeconds: 10,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 86400, // 24 horas
      }),
    ],
  }),
)

self.addEventListener('push', (event) => {
  let data = {}
  if (event.data) {
    try {
      data = event.data.json()
    } catch (error) {
      console.error('[SW] Error parsing push payload:', error)
    }
  }

  const title = data.title || 'Nueva notificación'
  const options = {
    body: data.body || 'Tienes una nueva notificación en Leon Express.',
    icon: data.icon || '/android-chrome-192x192.png',
    badge: data.badge || '/android-chrome-192x192.png',
    data: {
      url: data?.data?.url || data.url || data.link || '/',
      ...data?.data,
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification?.data?.url
  if (targetUrl) {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus()
            client.navigate(targetUrl)
            return
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl)
        }
      }),
    )
  }
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Mensaje SKIP_WAITING recibido, activando nueva versión...')
    self.skipWaiting()
  }
  // Mensaje para limpiar todos los caches manualmente
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('[SW] Limpiando todos los caches por solicitud...')
    event.waitUntil(
      caches
        .keys()
        .then((cacheNames) => {
          return Promise.all(
            cacheNames.map((cacheName) => {
              console.log('[SW] Eliminando cache:', cacheName)
              return caches.delete(cacheName)
            }),
          )
        })
        .then(() => {
          console.log('[SW] ✅ Todos los caches eliminados')
          // Notificar al cliente que la limpieza está completa
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ type: 'CACHE_CLEARED' })
          }
        }),
    )
  }
})
