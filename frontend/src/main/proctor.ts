// Proctor mode (--mode=proctor, Proctor.bat): the proctor client's main side. index.ts hands over
// to startProctor before any participant setup, so none of that runs here: no Output/ check, no
// API key, no condition, no sessions. The proctor writes no data; the participant app is the
// only writer.
//
//   proctor window ──IPC──▶ main (this file) ──ProctorLink──▶ relay ──▶ participant app
//   (preload/proctor.ts)     owns the link and the token
//
// Settings: only relayUrl from Chat.config.json and the key from relay-key.txt. The rest of
// Options/ isn't read, so a broken prompt file on the proctor machine can't stop it starting.
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { constants } from 'fs'
import { copyFile, readFile } from 'fs/promises'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { isObject, show } from '../shared/check'
import { PROCTOR_IPC, type ProctorSnapshot, type ProctorState } from '../shared/ipc'
import { CONFIG_FILES } from '../shared/options'
import type { ProctorLink } from '../shared/partner/link'
import type { ProctorView } from '../shared/partner/protocol'
import { relayUrlProblem } from '../shared/partner/relay'
import { OptionsError } from './options'
import { RELAY_KEY_FILE, readRelayKey } from './relayKey'

export type ProctorStartOptions = {
  optionsDir: string
  defaultsDir: string
}

export async function startProctor({
  optionsDir,
  defaultsDir
}: ProctorStartOptions): Promise<void> {
  // 1. Settings. Problems get the same dialog as the participant app's options
  let relay: RelaySettings
  try {
    relay = await readRelaySettings(optionsDir, defaultsDir)
  } catch (err) {
    const details =
      err instanceof OptionsError
        ? err.problems.map((p) => '• ' + p).join('\n')
        : (err as Error).message
    dialog.showErrorBox(
      'CaipersCCT proctor settings need fixing',
      `There's a problem with the settings in:\n${optionsDir}\n\n${details}\n\n` +
        'Fix the file(s) above, then start Proctor.bat again.'
    )
    app.quit()
    return
  }
  void relay // TODO: used by the connect handler below

  // 2. State, mirrored to the window. The window asks for a snapshot once on load, then listens
  let state: ProctorState = { connection: 'idle', problem: null }
  let view: ProctorView | null = null
  let link: ProctorLink | null = null

  const push = (channel: string, value: unknown): void => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, value)
  }
  const setState = (next: ProctorState): void => {
    state = next
    push(PROCTOR_IPC.state, next)
  }

  // 3. IPC
  ipcMain.handle(PROCTOR_IPC.snapshot, (): ProctorSnapshot => ({ state, view }))

  ipcMain.handle(PROCTOR_IPC.connect, async (_event, code: unknown) => {
    // TODO:
    //   1. code must be text; trim + upper-case it (the proctor may type "4k8m2x"), then
    //      isRoomCode, else throw an Error whose message the window shows under the field
    //   2. close any existing link: typing a new code switches rooms
    //   3. link = createProctorRelayLink({
    //        url: relay.url, token: relay.token, room: code,
    //        onProblem: (p) => console.warn('[proctor]', p),
    //        onEnded: (reason) => { link = null; view = null; setState({ connection: 'idle', problem: reason }) }
    //      })
    //   4. setState({ connection: 'joined', code, status: { state: 'waiting', join: { url: relay.url, code } } })
    //   5. link.onStatus((status) => setState({ connection: 'joined', code, status }))
    //      link.onMessage((m) => { if (m.type === 'view') { view = m.view; push(PROCTOR_IPC.view, view) } })
    //      (welcome and rejected are handled inside the link; they only change its status)
    void code
    throw new Error('Connecting is not implemented yet')
  })

  ipcMain.on(PROCTOR_IPC.disconnect, () => {
    link?.close()
    link = null
    view = null
    setState({ connection: 'idle', problem: null })
  })

  ipcMain.on(PROCTOR_IPC.send, (_event, message: unknown) => {
    // TODO: the window is trusted less than main, so check the shape before it goes out:
    //   chat with text of 1..MAX_MESSAGE_LENGTH characters, or typing with a boolean isTyping.
    //   e.g. parseToParticipant(JSON.stringify(message)) and refuse 'handshake' (the link's job).
    //   Then link?.send(checked); the link drops it unless connected
    void message
  })

  app.on('before-quit', () => link?.close())

  // 4. The window
  createProctorWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createProctorWindow()
  })
}

function createProctorWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: 'Card Game Proctor',
    webPreferences: {
      preload: join(__dirname, '../preload/proctor.js'),
      sandbox: false
    }
  })
  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  // proctor.html is the renderer's second page (electron.vite.config.ts)
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/proctor.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/proctor.html'))
  }
}

// --- settings ---

type RelaySettings = { url: string; token: string }

// relayUrl from Chat.config.json and the key from relay-key.txt, every problem collected.
// Missing files are restored from the bundled defaults first, as the participant app does
async function readRelaySettings(optionsDir: string, defaultsDir: string): Promise<RelaySettings> {
  const problems: string[] = []
  const chatFile = CONFIG_FILES.chat

  let url = ''
  await copyIfMissing(join(defaultsDir, chatFile), join(optionsDir, chatFile))
  try {
    const chat: unknown = JSON.parse(await readFile(join(optionsDir, chatFile), 'utf8'))
    const value = isObject(chat) ? chat.relayUrl : undefined
    if (typeof value !== 'string' || value.trim() === '') {
      problems.push(
        `${chatFile}: relayUrl must be the relay's address, e.g. "wss://relay.example.org/v1" (got ${show(value)})`
      )
    } else {
      const problem = relayUrlProblem(value)
      if (problem) problems.push(`${chatFile}: relayUrl ${problem}`)
      else url = value
    }
  } catch (err) {
    problems.push(`${chatFile}: isn't valid JSON (${(err as Error).message})`)
  }

  let token: string | null = null
  try {
    token = await readRelayKey(optionsDir, defaultsDir)
    if (!token)
      problems.push(
        `${RELAY_KEY_FILE}: no relay key yet. Paste the key the lab gave you on its own line`
      )
  } catch (err) {
    if (err instanceof OptionsError) problems.push(...err.problems)
    else throw err
  }

  if (problems.length > 0 || !token) throw new OptionsError(problems)
  return { url, token }
}

async function copyIfMissing(from: string, to: string): Promise<void> {
  try {
    await copyFile(from, to, constants.COPYFILE_EXCL)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
  }
}
