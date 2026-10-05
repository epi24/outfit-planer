import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  define: {
    // Shown in the footer, so that on the phone it is visible which build the
    // service worker is serving.
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  // Fixed ports keep the service worker's origin stable between runs.
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  plugins: [
    react(),
    VitePWA({
      // Do not set injectRegister: the plugin only enables skipWaiting and
      // clientsClaim for autoUpdate while it is unset.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Outfit Planner',
        short_name: 'Outfits',
        description: 'Outfits planen und entdecken – Farbkombinationen nach Sanzo Wada.',
        lang: 'de',
        display: 'standalone',
        theme_color: '#f4f4f2',
        background_color: '#f4f4f2',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
