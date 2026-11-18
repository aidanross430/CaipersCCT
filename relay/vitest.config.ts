import { fileURLToPath } from 'url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // Same alias as tsconfig.json's paths
      '@shared': fileURLToPath(new URL('../frontend/src/shared', import.meta.url))
    }
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
