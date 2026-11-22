import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.js',
    include: ['tests/**/*.test.jsx'],
    css: false,
    globals: true,
    testTimeout: 60000,
    hookTimeout: 15000,
  },
})