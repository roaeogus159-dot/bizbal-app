import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon.png', 'beads/*.jpg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,json}'],
        runtimeCaching: [
          {
            urlPattern: /\/beads\/.*\.jpg$/,
            handler: 'CacheFirst',
            options: { cacheName: 'bead-photos', expiration: { maxEntries: 120 } },
          },
        ],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      manifest: {
        name: '비즈발 도안 생성기',
        short_name: '비즈발',
        description: '사진을 비즈발(구슬발) 도안으로 변환하고 색상별 개수를 계산합니다',
        lang: 'ko',
        theme_color: '#FCE8F0',
        background_color: '#FAF3F6',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
