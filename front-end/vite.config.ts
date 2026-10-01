import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: {
      // Proxy BMONI API calls through Vite dev server to avoid CORS.
      // The browser calls /bmoni/v1/... → Vite rewrites to
      // https://embedded-dev.bmoni.com/v1/... with the correct Origin.
      '/bmoni': {
        target: 'https://embedded-dev.bmoni.com',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/bmoni/, ''),
        timeout: 30000,
        proxyTimeout: 30000,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.warn('[bmoni proxy] error:', err.message)
          })
        },
      },
    },
  },
})
