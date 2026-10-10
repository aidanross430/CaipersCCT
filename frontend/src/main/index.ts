import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type { RoundResponse } from '../shared/types';
import { IPC, SessionStartPayload } from '../shared/ipc';
import { createSession, finishSession, appendRound } from './storage';
import { createSessionQueue } from './sessionQueue'


// Sessions created during this run of the app: id -> folder path.
// The renderer can only refer to sessions that main created.
const sessions = new Map<string, string>()

function sessionDir(sessionId: unknown): string {
  const dir = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined
  if (!dir) throw new Error(`Unknown session: ${String(sessionId)}`)
  return dir
}

// Each session's saves and its finish run one at a time, in arrival order (see sessionQueue.ts)
const queue = createSessionQueue()

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const dataDir = join(app.getPath('documents'), 'CCT-data')

  // IPC handles
  ipcMain.handle(IPC.roundFinish, async (_event, sessionId: string, response: RoundResponse) => {
    // Look up the folder now, so an unknown session fails straight away instead of queueing
    const dir = sessionDir(sessionId)
    await queue.run(sessionId, () => appendRound(dir, response))
  })
  ipcMain.handle(IPC.sessionStart, async (_event, payload: SessionStartPayload) => {
    // On session start, verify that the participant ID has a valid value and create a new session
    if (typeof payload?.participantId !== 'string' || !Array.isArray(payload.roundConfigs)) {
      throw new Error('Invalid session start data')
    }
    const { id, dir } = await createSession(dataDir, { ...payload, appVersion: app.getVersion()})
    sessions.set(id, dir)
    return id
  })
  ipcMain.handle(IPC.sessionFinish, async (_event, sessionId: string) => {
    const dir = sessionDir(sessionId)
    // Queued behind any round saves still in progress, so the CSVs include every round
    await queue.run(sessionId, () => finishSession(dir))
    sessions.delete(sessionId)
    queue.clear(sessionId)
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
