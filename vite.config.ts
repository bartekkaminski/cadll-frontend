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
        target: 'http://localhost:5178',
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
