import { ElectronAPI } from '@electron-toolkit/preload'
import { CctApi, ProctorApi } from '../shared/ipc'

declare global {
  interface Window {
    electron: ElectronAPI
    api: CctApi              // participant window only (preload/index.ts)
    proctorApi: ProctorApi   // proctor window only (preload/proctor.ts)
  }
}
