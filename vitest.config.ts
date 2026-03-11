import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
