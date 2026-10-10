import { ElectronAPI } from '@electron-toolkit/preload'
import { CctApi } from '../shared/ipc'

declare global {
  interface Window {
    electron: ElectronAPI
    api: CctApi
  }
}
