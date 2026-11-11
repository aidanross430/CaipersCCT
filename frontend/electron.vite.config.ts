import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        // Two pages from one build: the participant app, and the proctor page that the
        // participant app serves to the proctor's browser (see main/partner/lanHost.ts)
        input: {
          index: resolve('src/renderer/index.html'),
          proctor: resolve('src/renderer/proctor.html')
        }
      }
    }
  }
})
