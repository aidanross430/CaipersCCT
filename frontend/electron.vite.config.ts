import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        // One preload per window, so each window gets only its own API:
        //   index     the participant app (window.api)
        //   proctor   the proctor client, --mode=proctor (window.proctorApi)
        input: {
          index: resolve('src/preload/index.ts'),
          proctor: resolve('src/preload/proctor.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        // Two pages from one build: the participant app, and the proctor client's window
        // (--mode=proctor, see main/proctor.ts). lanHost.ts still serves proctor.html from the
        // LAN days; that page now needs window.proctorApi, so it only works in Electron
        input: {
          index: resolve('src/renderer/index.html'),
          proctor: resolve('src/renderer/proctor.html')
        }
      }
    }
  }
})
