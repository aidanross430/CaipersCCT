import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Separate from electron.vite.config.ts, whose main/preload/renderer shape Vitest can't read
export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src')
    }
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node'
  }
})
