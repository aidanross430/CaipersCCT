// Preload for the proctor window (--mode=proctor, see main/proctor.ts). Exposes window.proctorApi
// and nothing else: no session, saving or LLM channels, and never the relay token, which stays in
// main. Built as its own entry (electron.vite.config.ts), so the participant preload's API isn't
// even loaded in this window
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { PROCTOR_IPC, type ProctorApi } from '../shared/ipc'

const proctorApi: ProctorApi = {
  connect: (code) => ipcRenderer.invoke(PROCTOR_IPC.connect, code),
  disconnect: () => ipcRenderer.send(PROCTOR_IPC.disconnect),
  send: (message) => ipcRenderer.send(PROCTOR_IPC.send, message),
  onState: (cb) => subscribe(PROCTOR_IPC.state, cb),
  onView: (cb) => subscribe(PROCTOR_IPC.view, cb),
  getSnapshot: () => ipcRenderer.invoke(PROCTOR_IPC.snapshot)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('proctorApi', proctorApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (defined in index.d.ts)
  window.proctorApi = proctorApi
}

// As in preload/index.ts: the renderer never gets the IpcRendererEvent, and the unsubscribe is
// made here because functions passed through contextBridge arrive as proxies
function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, value: T): void => cb(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}
