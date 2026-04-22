import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5199,
    proxy: {
      '/api': {
        target: 'https://squid-app-7qm6q.ondigitalocean.app',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Buduje bezpośrednio do wwwroot backendu → serwowany jako pliki statyczne
    outDir: '../backend/wwwroot',
    emptyOutDir: true,
  },
})
