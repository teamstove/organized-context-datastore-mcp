import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      // OCD REST API へのプロキシ
      '/api/ocd': {
        target: process.env.VITE_OCD_API_URL || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
