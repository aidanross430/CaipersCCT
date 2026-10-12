import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { dirname, join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type { RoundResponse } from '../shared/types';
import { IPC, SessionStartPayload } from '../shared/ipc';
import { createSession, finishSession, appendRound, checkWritable } from './storage';
import { createSessionQueue } from './sessionQueue'
import type { ChatRequest } from '../shared/ipc';
import type { ChatMessage } from '../shared/types';
import { chatReply, setApiKey } from './llm';
import { API_KEY_FILE, readApiKey } from './apiKey';
import { loadOptions, optionsHash, OptionsError } from './options';
import type { Options } from '../shared/options';
import { appendMessage } from './storage';

// Sessions created during this run of the app: id -> folder path.
// The renderer can only refer to sessions that main created.
const sessions = new Map<string, string>()

function sessionDir(sessionId: unknown): string {
  const dir = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined
  if (!dir) throw new Error(`Unknown session: ${String(sessionId)}`)
  return dir
}

// The default Options/ files bundled with the app (see extraResources in electron-builder.yml)
function defaultsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'defaults', 'Options')
    : join(app.getAppPath(), 'defaults', 'Options')
}

function baseDir(): string {
  return app.isPackaged
    ? dirname(dirname(app.getPath('exe')))
    : join(app.getAppPath(), 'dev-folder')
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
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const dataDir = join(baseDir(), 'Output')

  // Refuse to start if session data can't be saved, rather than failing mid-session
  try {
    await checkWritable(dataDir)
  } catch (err) {
    dialog.showErrorBox(
      'CaipersCCT cannot save data',
      `The Output folder can't be written to:\n${dataDir}\n\n${(err as Error).message}\n\n` +
        'Move the whole CaipersCCT folder somewhere you can save files (for example the ' +
        'desktop), not inside C:\\Program Files, then start it again.'
    )
    app.quit()
    return
  }

  // Load and check Options/ once. Every session in this run uses this same snapshot, so
  // edits to Options/ while the app is open take effect only after a restart
  const optionsDir = join(baseDir(), 'Options')
  let options: Options
  let apiKey: string | null
  try {
    options = await loadOptions(optionsDir, defaultsDir())
    // Read separately from the other options and kept in main only: never sent to the
    // renderer or written to session.json
    apiKey = await readApiKey(optionsDir, defaultsDir())
  } catch (err) {
    const details =
      err instanceof OptionsError
        ? err.problems.map((p) => '• ' + p).join('\n')
        : (err as Error).message
    dialog.showErrorBox(
      'CaipersCCT options need fixing',
      `There's a problem with the settings in:\n${optionsDir}\n\n${details}\n\n` +
        'Fix the file(s) above, or delete a file to restore its default, then start again.'
    )
    app.quit()
    return
  }
  const hash = optionsHash(options)

  // Without a key every chat reply fails, so warn before the session rather than during it.
  // The environment variable is the fallback when api-key.txt holds no key
  setApiKey(apiKey)
  if (!apiKey && !process.env.ANTHROPIC_API_KEY) {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      title: 'CaipersCCT: no API key',
      message: 'No Anthropic API key was found, so the chat partner won’t be able to reply.',
      detail:
        `Paste the key into:\n${join(optionsDir, API_KEY_FILE)}\nthen start CaipersCCT again.\n\n` +
        'If you continue, every chat message will show an error and be logged as a failed reply.',
      buttons: ['Quit', 'Continue without the chat'],
      defaultId: 0,
      cancelId: 0
    })
    if (response === 0) {
      app.quit()
      return
    }
  }

  // IPC handles

  // The renderer asks for the options once, before showing the first page
  ipcMain.handle(IPC.optionsLoad, () => options)

  // For CCT functionality
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
    const { id, dir } = await createSession(dataDir, {
      ...payload,
      appVersion: app.getVersion(),
      options,          // recorded by main, so the renderer can't forget or alter them
      optionsHash: hash
    })
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

  // For AI Chatbot functionality
  ipcMain.handle(IPC.chatReply, async (_event, request: ChatRequest) => {
    if (
      typeof request?.system !== 'string' ||
      !Array.isArray(request.messages) ||
      request.messages.length === 0 ||
      !request.messages.every((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    ) {
      throw new Error('Invalid chat request')
    }
    return chatReply(request)
  })

  ipcMain.handle(IPC.messageSave, async (_event, sessionId: string, message: ChatMessage) => {
    const dir = sessionDir(sessionId)
    await queue.run(sessionId, () => appendMessage(dir, message))
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
