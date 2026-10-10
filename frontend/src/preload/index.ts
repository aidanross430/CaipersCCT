import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { RoundResponse } from '../shared/types';
import { IPC, SessionStartPayload, type CctApi } from '../shared/ipc'

// Custom APIs for renderer
const api: CctApi = {
  saveRound: (dir: string, response: RoundResponse) => ipcRenderer.invoke(IPC.roundFinish, dir, response),
  startSession: (payload: SessionStartPayload) => ipcRenderer.invoke(IPC.sessionStart, payload),
  terminateSession: (sessionId: string) => ipcRenderer.invoke(IPC.sessionFinish, sessionId)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)

    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
