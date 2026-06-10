// vite.config.pwa.ts
import { VitePWA } from 'vite-plugin-pwa'

export default {
  plugins: [
    VitePWA({
      registerType: 'prompt',
      selfDestroying: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'site.webmanifest'],
      manifest: {
        name: 'Leon Express',
        short_name: 'LeonExpress',
        description: 'Gestión de entregas y logística',
        theme_color: '#03323A',
        background_color: '#03323A',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        skipWaiting: false,
        clientsClaim: false,
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*/, // cache all external requests
            handler: 'NetworkFirst',
            options: {
              cacheName: 'external-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
}
