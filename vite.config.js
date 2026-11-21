import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
// Versão que aparece na Minha conta (ajuda no atendimento: "qual versão você tem?").
const VERSAO = `${pkg.version} · ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`

export default defineConfig({
  define: { __VERSAO_APP__: JSON.stringify(VERSAO) },
  // @motor = motor único de cálculo (o MESMO arquivo que as Edge Functions usam).
  resolve: {
    alias: { '@motor': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)) },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        name: 'HopeFin — Finanças da família',
        short_name: 'HopeFin',
        description: 'Controle financeiro da família: gastos, contas fixas, cartões, orçamento e projeção.',
        lang: 'pt-BR',
        theme_color: '#10b981',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        // Nunca interceptar chamadas ao Supabase (API/auth/realtime)
        navigateFallbackDenylist: [/^\/api/, /supabase\.co/],
        cleanupOutdatedCaches: true,
        // Handlers de Web Push (push / notificationclick) — ver public/push-sw.js
        importScripts: ['push-sw.js'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
})
