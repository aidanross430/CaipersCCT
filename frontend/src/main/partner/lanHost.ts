// The participant side of the LAN transport: a WebSocket server the proctor connects to.
// Implements ParticipantLink, so main/index.ts swaps it in for createFakeLink() with no other
// changes. Runs in main only (Node), so it can use `ws`, `http`, `os` and `crypto`.
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { randomInt } from 'crypto'
import { networkInterfaces } from 'os'
import { WebSocketServer, WebSocket, type RawData } from 'ws'
import {
  HEARTBEAT_INTERVAL_MS,
  MISSED_HEARTBEATS_BEFORE_DISCONNECT,
  type ParticipantLink,
  type PartnerStatus
} from '../../shared/partner/link'
import {
  PROTOCOL_VERSION,
  type ProctorView,
  type ToParticipant,
  type ToProctor
} from '../../shared/partner/protocol'
import { parseToParticipant } from '../../shared/partner/validate'

export type LanHostOptions = {
  port: number                      // fixed (e.g. 47800) so the firewall rule and the proctor's
                                    // bookmark stay the same between sessions. 0 = any free port
  hostname?: string                 // default 0.0.0.0, every network adapter, so another machine
                                    // can reach it. Tests use 127.0.0.1, which needs no firewall rule
  onProblem?: (problem: string) => void  // bad messages, failed handshakes, dropped proctors
  heartbeatMs?: number              // default HEARTBEAT_INTERVAL_MS; tests shorten it
  handshakeTimeoutMs?: number       // default HANDSHAKE_TIMEOUT_MS; tests shorten it
}

// A ParticipantLink, plus a promise for when close() has fully released the port
export type LanHost = ParticipantLink & { closed: Promise<void> }

// A new connection has this long to send a valid handshake, so a stray one can't sit there
const HANDSHAKE_TIMEOUT_MS = 5_000
// Proctor messages are a few hundred bytes; ws refuses anything bigger by itself
const MAX_PAYLOAD_BYTES = 16 * 1024

export function createLanHost(options: LanHostOptions): LanHost {
  const {
    port,
    hostname = '0.0.0.0',
    onProblem = () => {},
    heartbeatMs = HEARTBEAT_INTERVAL_MS,
    handshakeTimeoutMs = HANDSHAKE_TIMEOUT_MS
  } = options

  // New each time the app starts
  const code = String(randomInt(0, 10_000)).padStart(4, '0')
  const messageListeners = new Set<(message: ToParticipant) => void>()
  const statusListeners = new Set<(status: PartnerStatus) => void>()
  const handshakeTimers = new Set<ReturnType<typeof setTimeout>>()

  let join: { url: string; code: string } | null = null   // set once listening
  let proctor: WebSocket | null = null                    // the paired socket, if any
  let missedPongs = 0
  let lastView: ProctorView | null = null                 // what a new or returning proctor gets first
  let shuttingDown = false

  const emitStatus = (status: PartnerStatus): void => statusListeners.forEach((cb) => cb(status))
  const sendTo = (socket: WebSocket, message: ToProctor): void => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }
  const reject = (socket: WebSocket, reason: string): void => {
    onProblem(`Proctor connection refused: ${reason}`)
    sendTo(socket, { type: 'rejected', reason })
    socket.close()
  }

  // In step 4 this serves the proctor page, so the proctor opens http://<ip>:<port> in a browser
  const http = createServer((_req, res) => {
    res.writeHead(404).end()
  })
  const wss = new WebSocketServer({ server: http, maxPayload: MAX_PAYLOAD_BYTES })

  // ws re-emits the http server's errors here (e.g. the port is in use because a second copy
  // of the app is open). Reported as a status rather than thrown, so main keeps running
  wss.on('error', (err) => {
    onProblem(`Partner server error: ${err.message}`)
    emitStatus({ state: 'disconnected', reason: `Couldn't open port ${port}: ${err.message}` })
  })

  // Listening always finishes after main has subscribed, so the first status isn't missed
  http.listen(port, hostname, () => {
    const actualPort = (http.address() as AddressInfo).port
    join = { url: `http://${lanAddress()}:${actualPort}`, code }
    emitStatus({ state: 'waiting', join })
  })

  wss.on('connection', (socket) => {
    // Every socket starts unpaired and gets a limited time to send a handshake
    const timer = setTimeout(() => {
      handshakeTimers.delete(timer)
      if (socket !== proctor) {
        onProblem('A connection sent no handshake in time and was closed')
        socket.close()
      }
    }, handshakeTimeoutMs)
    handshakeTimers.add(timer)

    socket.on('message', (data) => handleMessage(socket, data))
    socket.on('pong', () => {
      if (socket === proctor) missedPongs = 0
    })
    // Without a listener, a socket error would throw in main
    socket.on('error', (err) => onProblem(`Proctor connection error: ${err.message}`))
    socket.on('close', () => {
      clearTimeout(timer)
      handshakeTimers.delete(timer)
      // A replaced or never-paired socket closing isn't a disconnect: ignore it
      if (socket !== proctor) return
      proctor = null
      if (shuttingDown) return
      emitStatus({ state: 'disconnected', reason: 'The proctor disconnected' })
      // The server keeps listening and the same code still works
      if (join) emitStatus({ state: 'waiting', join })
    })
  })

  function handleMessage(socket: WebSocket, data: RawData): void {
    const result = parseToParticipant(String(data))
    const paired = socket === proctor

    if (!result.ok) {
      // A bad message from the proctor isn't worth dropping them over; one from an unpaired
      // connection means it isn't a proctor page at all
      onProblem(`Bad message from ${paired ? 'the proctor' : 'an unpaired connection'}: ${result.problem}`)
      if (!paired) socket.close()
      return
    }
    const message = result.message

    if (!paired) {
      if (message.type !== 'handshake') {
        onProblem(`An unpaired connection sent "${message.type}" before a handshake and was closed`)
        socket.close()
        return
      }
      if (message.version !== PROTOCOL_VERSION) {
        reject(
          socket,
          `This proctor page uses protocol version ${message.version} but the participant app uses ` +
            `${PROTOCOL_VERSION}. Reload the page, or update the app`
        )
        return
      }
      if (message.code !== code) {
        reject(socket, 'Wrong pairing code')
        return
      }
      pair(socket)
      return
    }

    // Already paired: a repeated handshake changes nothing
    if (message.type === 'handshake') return
    messageListeners.forEach((cb) => cb(message))
  }

  function pair(socket: WebSocket): void {
    const previous = proctor
    proctor = socket
    missedPongs = 0
    // Replacing (rather than refusing the newcomer) lets a proctor reconnect before their old
    // socket is noticed as dead. The old socket's 'close' is then ignored, since it's no longer
    // the proctor, so a reconnect isn't reported as a disconnect
    if (previous) previous.close(1000, 'Replaced by a newer proctor connection')
    sendTo(socket, { type: 'welcome' })
    if (lastView) sendTo(socket, { type: 'view', view: lastView })
    emitStatus({ state: 'connected' })
  }

  // Two jobs on one timer: ping to notice a dead proctor, and re-send the view so the proctor
  // page can notice a dead participant (browsers can't see ws pings, only messages)
  const heartbeat = setInterval(() => {
    const socket = proctor
    if (!socket) return
    if (missedPongs >= MISSED_HEARTBEATS_BEFORE_DISCONNECT) {
      onProblem('The proctor stopped answering and was disconnected')
      // terminate, not close: a dead peer never finishes the closing handshake. Fires 'close'
      socket.terminate()
      return
    }
    missedPongs++
    socket.ping()
    if (lastView) sendTo(socket, { type: 'view', view: lastView })
  }, heartbeatMs)

  let resolveClosed: () => void = () => {}
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve
  })

  return {
    send: (message) => {
      if (message.type === 'view') lastView = message.view
      // Dropped while no proctor is paired: the next view brings them up to date anyway
      if (proctor) sendTo(proctor, message)
    },
    onMessage: (cb) => {
      messageListeners.add(cb)
      return () => messageListeners.delete(cb)
    },
    onStatus: (cb) => {
      statusListeners.add(cb)
      return () => statusListeners.delete(cb)
    },
    close: () => {
      if (shuttingDown) return
      shuttingDown = true
      clearInterval(heartbeat)
      handshakeTimers.forEach(clearTimeout)
      handshakeTimers.clear()
      for (const client of wss.clients) client.terminate()
      wss.close()
      http.closeAllConnections()
      // Resolves on error too (e.g. the server never started listening): either way it's done
      http.close(() => resolveClosed())
    },
    closed
  }
}

// Virtual adapters that Docker Desktop, WSL, VMs and VPNs add to Windows. Another machine on
// the LAN can't reach these addresses, so they're only used if nothing else exists
const VIRTUAL_ADAPTER = /vethernet|wsl|docker|virtualbox|vmware|hyper-v|vpn|tailscale|zerotier|bluetooth/i
const PREFERRED_ADAPTER = /wi-?fi|wlan|wireless|ethernet|^en\d|^eth\d|^wl/i

// The address the proctor should type in: an IPv4 address on a real Wi-Fi or Ethernet adapter
export function lanAddress(): string {
  const candidates = Object.entries(networkInterfaces()).flatMap(([name, addresses]) =>
    (addresses ?? [])
      // 169.254.x.x is what Windows gives an adapter with no network: unreachable
      .filter((a) => a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))
      .map((a) => ({ name, address: a.address }))
  )
  const real = candidates.filter((c) => !VIRTUAL_ADAPTER.test(c.name))
  const best = real.find((c) => PREFERRED_ADAPTER.test(c.name)) ?? real[0] ?? candidates[0]
  return best?.address ?? '127.0.0.1'
}
