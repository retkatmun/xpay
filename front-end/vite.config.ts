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
      // Proxy BMONI API calls to avoid CORS in development.
      // In production this must be handled by your edge/serverless function
      // or Vercel rewrites — see vercel.json.
      '/bmoni': {
        target: 'https://embedded-dev.bmoni.com',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/bmoni/, ''),
        timeout: 20000,
        proxyTimeout: 20000,
      },
    },
  },
})
