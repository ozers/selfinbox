import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Build mode (see src/App.tsx). The `app` install build must ship neither the
// landing nor the demo. Rolldown emits dynamic-import chunks and keeps dead
// route branches regardless of DCE, so stubbing those modules at resolve time
// is the only reliable way to keep marketing + demo code out of the install
// bundle. `public` / `marketing` builds get the real modules.
const MODE = process.env.VITE_MODE || 'app'
const installBuild = MODE === 'app'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // More specific aliases first so they win over the generic '@' below.
      ...(installBuild
        ? {
            '@/pages/landing': path.resolve(__dirname, './src/pages/_landing-stub.tsx'),
            '@/lib/mock-data': path.resolve(__dirname, './src/lib/_mock-data-stub.tsx'),
          }
        : {}),
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
