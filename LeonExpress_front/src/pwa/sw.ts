/// <reference lib="webworker" />

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<PrecacheEntry> }

type PrecacheEntry = string | { url: string; revision?: string }

precacheAndRoute(self.__WB_MANIFEST || [])
cleanupOutdatedCaches()

registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*$/i,
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 })],
  }),
)

self.addEventListener('push', (event) => {
  let data: Record<string, unknown> = {}

  if (event.data) {
    try {
      data = event.data.json()
      console.log('[SW] Push data recibida', data)
    } catch (error) {
      console.error('[SW] Error parseando datos push', error)
    }
  }

  const title = (data.title as string) || 'Leon Express'
  const body = (data.body as string) || 'Tienes una nueva notificación en Leon Express.'
  const icon = (data.icon as string) || '/android-chrome-192x192.png'
  const url = (data.url as string) || '/'

  const options: NotificationOptions = {
    body,
    icon,
    badge: '/android-chrome-192x192.png',
    tag: 'leon-express-notification',
    requireInteraction: true,
    data: { url },
  }

  event.waitUntil(
    self.registration
      .showNotification(title, options)
      .then(() => console.log('[SW] Notificación mostrada', { title, options }))
      .catch((error) => console.error('[SW] Error mostrando notificación', error)),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data as { url?: string } | undefined)?.url

  if (targetUrl) {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        const matchingClient = clientList.find((client) => client.url === targetUrl)

        if (matchingClient && 'focus' in matchingClient) {
          return matchingClient.focus()
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl)
        }

        return undefined
      }),
    )
  }
})
