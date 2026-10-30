import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { RoundResponse } from '../shared/types';
import { IPC, SessionStartPayload, type CctApi } from '../shared/ipc'

// Custom APIs for renderer
const api: CctApi = {
  saveRound: (dir: string, response: RoundResponse) => ipcRenderer.invoke(IPC.roundFinish, dir, response),
  startSession: (payload: SessionStartPayload) => ipcRenderer.invoke(IPC.sessionStart, payload),
  terminateSession: (sessionId: string) => ipcRenderer.invoke(IPC.sessionFinish, sessionId),
  chatReply: (request) => ipcRenderer.invoke(IPC.chatReply, request),
  saveMessage: (sessionId, message) => ipcRenderer.invoke(IPC.messageSave, sessionId, message),
  loadOptions: () => ipcRenderer.invoke(IPC.optionsLoad),
  publishView: (view) => ipcRenderer.send(IPC.partnerPublish, view),
  getPartnerStatus: () => ipcRenderer.invoke(IPC.partnerStatusGet),
  onPartnerMessage: (cb) => subscribe(IPC.partnerMessage, cb),
  onPartnerStatus: (cb) => subscribe(IPC.partnerStatus, cb)
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

// Wraps the callback so the renderer never gets the IpcRendererEvent (it exposes `sender`,
// which Electron advises against handing to page code), and returns the unsubscribe from
// here: functions passed through contextBridge arrive as proxies, so the renderer couldn't
// hand back the same function for removeListener itself
function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, value: T): void => cb(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}