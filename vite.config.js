import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/Flash-Read/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          firebaseAuth: ['firebase/app', 'firebase/auth'],
          firebaseStore: ['firebase/firestore'],
          xlsx: ['xlsx']
        }
      }
    }
  }
})
