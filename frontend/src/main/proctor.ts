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
import { ROOM_CODE_LENGTH, isRoomCode, relayUrlProblem } from '../shared/partner/relay'
import { parseToParticipant } from '../shared/partner/validate'
import { OptionsError } from './options'
import { createProctorRelayLink } from './partner/relayClient'
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

  // Returns null when connecting has started, otherwise why the code was refused. Returned rather
  // than thrown: Electron wraps a thrown error's message in "Error invoking remote method ...",
  // which isn't fit to show under the code field
  ipcMain.handle(PROCTOR_IPC.connect, (_event, typed: unknown): string | null => {
    // The proctor may type "4k8m2x" or paste " 4K8M2X "
    const code = typeof typed === 'string' ? typed.trim().toUpperCase() : ''
    if (!isRoomCode(code)) {
      return `That isn't a session code. It's ${ROOM_CODE_LENGTH} letters and numbers, shown on the participant's Welcome page`
    }

    // Typing a new code switches rooms. close() ends the old link quietly (no onEnded)
    link?.close()
    view = null

    const current = createProctorRelayLink({
      url: relay.url,
      token: relay.token,
      room: code,
      onProblem: (problem) => console.warn('[proctor]', problem),
      // Gave up for good (rejected, wrong key, relay version): back to code entry with the reason
      onEnded: (reason) => {
        if (link !== current) return
        link = null
        view = null
        setState({ connection: 'idle', problem: reason })
      }
    })
    link = current
    setState({
      connection: 'joined',
      code,
      status: { state: 'waiting', join: { url: relay.url, code } }
    })

    // The `link !== current` checks drop anything a replaced link sends after a switch
    current.onStatus((status) => {
      if (link === current) setState({ connection: 'joined', code, status })
    })
    current.onMessage((message) => {
      // welcome and rejected are handled inside the link; only views reach the window
      if (link !== current || message.type !== 'view') return
      view = message.view
      push(PROCTOR_IPC.view, view)
    })
    return null
  })

  ipcMain.on(PROCTOR_IPC.disconnect, () => {
    link?.close()
    link = null
    view = null
    setState({ connection: 'idle', problem: null })
  })

  ipcMain.on(PROCTOR_IPC.send, (_event, message: unknown) => {
    // The window is trusted less than main, so check the message before it goes out, with the
    // same check the participant app runs on arrival (it trims chat text and enforces
    // MAX_MESSAGE_LENGTH). A problem here is a bug in the window, so it's only logged
    const result = parseToParticipant(JSON.stringify(message ?? null))
    if (!result.ok) {
      console.warn('[proctor] Refused a message from the window:', result.problem)
      return
    }
    // The handshake is the link's job, never the window's
    if (result.message.type === 'handshake') return
    // Dropped by the link unless connected
    link?.send(result.message)
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
