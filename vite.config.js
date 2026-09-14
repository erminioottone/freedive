import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      includeAssets: [
        'icons/favicon-32.png',
        'icons/apple-touch-icon.png',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-maskable-512.png'
      ],
      manifest: {
        name: 'Apnea Trainer — CO₂ & O₂ Tables',
        short_name: 'Apnea Trainer',
        description: 'Offline-capable CO₂ and O₂ apnea training tables.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,ico}'],
        navigateFallback: '/index.html',
        clientsClaim: false,
        skipWaiting: false,
        runtimeCaching: []
      }
    })
  ],
  build: {
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: true
  }
});
