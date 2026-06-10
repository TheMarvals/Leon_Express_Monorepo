import { defineConfig } from 'vite'
import fs from 'fs'
import vue from '@vitejs/plugin-vue'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'url'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    sourcemap: true,
  },
  server: {
    host: '0.0.0.0',
    // https: {
    //   key: fs.readFileSync('localhost+1-key.pem'),
    //   cert: fs.readFileSync('localhost+1.pem'),
    // },
    allowedHosts: ['c148f6ac0ea9.ngrok-free.app', '7b4c23fdf39e.ngrok-free.app'],
  },
  plugins: [
    vue(),
    VueI18nPlugin({
      include: resolve(dirname(fileURLToPath(import.meta.url)), './src/i18n/locales/**'),
    }),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'site.webmanifest'],
      // Forzar actualización en cada build generando un hash único
      injectRegister: 'auto',
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // Limpiar caches antiguos automáticamente
        runtimeCaching: [],
      },
      // Generar un hash único para cada build
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
        // Forzar regeneración del manifest en cada build
        maximumFileSizeToCacheInBytes: 5000000,
      },
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
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@components': resolve(__dirname, './src/components'),
      '@stores': resolve(__dirname, './src/stores'),
      '@pages': resolve(__dirname, './src/pages'),
    },
  },
})
