import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import path from 'path'
import https from 'node:https'

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
        // Disable SSL cert verification for dev proxy — avoids 502s caused by
        // http-proxy's SSL handshake failures on repeated HTTPS connections.
        secure: false,
        rewrite: (p) => p.replace(/^\/bmoni/, ''),
        timeout: 30000,
        proxyTimeout: 30000,
        configure: (proxy) => {
          // Use a persistent HTTPS agent to avoid per-request TCP+TLS overhead
          const agent = new https.Agent({ keepAlive: true, rejectUnauthorized: false })
          proxy.on('proxyReq', (proxyReq) => {
            // @ts-ignore — http-proxy typings don't expose agent
            proxyReq.agent = agent
          })
          proxy.on('error', (err) => {
            console.warn('[bmoni proxy] error:', err.message)
          })
        },
      },
    },
  },
})
