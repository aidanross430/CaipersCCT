// The relay server: HTTP for /health, WebSocket for everything else. Same shape as the
// participant app's createLanHost: a function that starts listening and returns a handle with
// close(), so tests can run real servers on port 0 and shut them down between cases.
//
// A socket's life
//   connect → awaiting-hello (helloTimeoutMs to send one)
//           → member         (in a room; 'data' frames are forwarded to its peer)
//           → closing        (refused, replaced, expired or sent a bad frame; frames ignored)
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import type { AddressInfo } from 'net'
import { createHash, timingSafeEqual } from 'crypto'
import { WebSocketServer, WebSocket, type RawData } from 'ws'
import {
  MAX_FRAME_BYTES,
  RELAY_VERSION,
  parseToRelay,
  type FromRelay,
  type RefusedReason,
  type ToRelay
} from '@shared/partner/relay'
import type { RelayConfig } from './config'
import { log } from './log'
import { createRoomTable } from './rooms'

export type RelayServer = {
  port: Promise<number>          // resolves once listening (the real port when config.port is 0)
  close: () => Promise<void>     // terminates every socket and releases the port
}

// The WebSocket path. Versioned so a future envelope can live beside this one during a rollout
export const RELAY_PATH = '/v1'

// How often expired rooms are cleared. Room lifetimes are minutes to hours, so a coarse sweep
// is enough
const SWEEP_INTERVAL_MS = 30_000

// Close codes. 1000 = normal, 1008 = policy violation (refused or misbehaving),
// 1001 = going away (room expired, server shutting down)
const CLOSE_NORMAL = 1000
const CLOSE_GOING_AWAY = 1001
const CLOSE_POLICY = 1008

type Hello = Extract<ToRelay, { type: 'hello' }>
type LogFields = Parameters<typeof log>[1]

// Per-socket bookkeeping. Lives in a Map rather than on the socket, so the ws type stays clean
type Conn = {
  phase: 'awaiting-hello' | 'member' | 'closing'
  helloTimer: ReturnType<typeof setTimeout> | null
  missedPongs: number
}

export function createRelayServer(config: RelayConfig): RelayServer {
  const rooms = createRoomTable<WebSocket>({
    maxRooms: config.maxRooms,
    roomGraceMs: config.roomGraceMs,
    maxRoomAgeMs: config.maxRoomAgeMs
  })
  const conns = new Map<WebSocket, Conn>()

  // The token is hashed once here and each hello's token is hashed the same way, so the two
  // buffers are always 32 bytes and timingSafeEqual never leaks the length or a prefix match
  const tokenHash = sha256(config.token)
  const tokenMatches = (token: string): boolean => timingSafeEqual(sha256(token), tokenHash)

  const http = createServer((req, res) => handleHttp(req, res))
  // maxPayload makes ws refuse an oversize frame itself (closing with 1009) before we see it.
  // path makes ws answer an upgrade on any other path with a 400
  const wss = new WebSocketServer({ server: http, path: RELAY_PATH, maxPayload: MAX_FRAME_BYTES })

  let resolvePort: (port: number) => void = () => {}
  let rejectPort: (err: Error) => void = () => {}
  const port = new Promise<number>((resolve, reject) => {
    resolvePort = resolve
    rejectPort = reject
  })

  // ws re-emits the http server's errors here (e.g. the port is already in use)
  wss.on('error', (err) => {
    log('server-error', { message: err.message })
    rejectPort(err)
  })

  http.listen(config.port, config.host, () => {
    resolvePort((http.address() as AddressInfo).port)
  })

  // --- HTTP ---

  function handleHttp(req: IncomingMessage, res: ServerResponse): void {
    const path = new URL(req.url ?? '/', 'http://relay').pathname
    if ((req.method === 'GET' || req.method === 'HEAD') && path === '/health') {
      const body = JSON.stringify({ ok: true, rooms: rooms.size() })
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(req.method === 'HEAD' ? undefined : body)
      return
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found')
  }

  // --- WebSocket ---

  wss.on('connection', (socket) => {
    const conn: Conn = {
      phase: 'awaiting-hello',
      helloTimer: null,
      missedPongs: 0
    }
    conns.set(socket, conn)

    conn.helloTimer = setTimeout(() => {
      conn.helloTimer = null
      if (conn.phase === 'awaiting-hello') {
        refuse(socket, 'bad-hello', `No hello within ${config.helloTimeoutMs / 1000} s`)
      }
    }, config.helloTimeoutMs)

    socket.on('message', (data) => handleFrame(socket, conn, data))
    socket.on('pong', () => {
      conn.missedPongs = 0
    })
    // without a listener, a socket error would throw and take the whole relay down
    socket.on('error', (err) => log('socket-error', { message: err.message }))
    socket.on('close', () => handleClose(socket, conn))
  })

  function handleFrame(socket: WebSocket, conn: Conn, data: RawData): void {
    if (conn.phase === 'closing') return

    // ws's default binaryType hands every frame over as one Buffer, fragments already joined.
    // A binary frame needs no special case: its text fails parseToRelay like any other garbage
    const text = String(data)
    if (conn.phase === 'awaiting-hello') {
      handleHello(socket, conn, text)
    } else {
      handleMemberFrame(socket, conn, text)
    }
  }

  function handleHello(socket: WebSocket, conn: Conn, text: string): void {
    const parsed = parseToRelay(text)
    if (!parsed.ok) return refuse(socket, 'bad-hello', parsed.problem)
    if (parsed.message.type !== 'hello') {
      return refuse(socket, 'bad-hello', `Expected hello, got ${parsed.message.type}`)
    }
    const hello: Hello = parsed.message

    // Version before token: a lab machine with an old app should hear "update", not "bad token"
    if (hello.relayVersion !== RELAY_VERSION) {
      refuse(
        socket,
        'version-mismatch',
        `This relay speaks version ${RELAY_VERSION}; the app sent ${hello.relayVersion}. Update the app`
      )
      return
    }
    if (!tokenMatches(hello.token)) return refuse(socket, 'bad-token', 'Wrong access token')

    const result =
      hello.role === 'participant'
        ? rooms.enterAsParticipant(hello.room, hello.claim, socket)
        : rooms.enterAsProctor(hello.room, socket)

    if (!result.ok) {
      refuse(socket, result.reason, REFUSAL_DETAIL[result.reason], { role: hello.role, room: hello.room })
      return
    }

    // In the room
    if (conn.helloTimer) clearTimeout(conn.helloTimer)
    conn.helloTimer = null
    conn.phase = 'member'
    send(socket, { type: 'ready', peerPresent: result.peer !== null })

    // The old socket is out of the room table already, so its close is not reported as a leave
    if (result.replaced) {
      const old = conns.get(result.replaced)
      if (old) closeSocket(result.replaced, old, CLOSE_NORMAL, 'Replaced by a newer connection')
    }
    if (result.peer) send(result.peer, { type: 'peer', state: 'joined' })

    log('entered', {
      room: hello.room,
      role: hello.role,
      replaced: result.replaced !== null,
      peerPresent: result.peer !== null,
      rooms: rooms.size()
    })
  }

  function handleMemberFrame(socket: WebSocket, conn: Conn, text: string): void {
    const parsed = parseToRelay(text)
    if (!parsed.ok || parsed.message.type !== 'data') {
      // A second hello or garbage from a member means the client is confused: drop it, and its
      // reconnect starts clean. The problem text is logged, never the frame
      log('closed', { cause: 'bad-frame', problem: parsed.ok ? 'second hello' : parsed.problem })
      closeSocket(socket, conn, CLOSE_POLICY, 'Unexpected frame')
      return
    }

    // Dropped while there's no peer: the participant's next view (sent at least every
    // heartbeat) brings a late proctor up to date anyway
    const peer = rooms.peerOf(socket)
    if (!peer || peer.readyState !== WebSocket.OPEN) return

    // The frame's own text, not a re-serialised copy of the parsed object: the relay never
    // rebuilds the payload. parseToRelay has already confirmed it's exactly { type: 'data', payload }
    peer.send(text)
  }

  function handleClose(socket: WebSocket, conn: Conn): void {
    if (conn.helloTimer) clearTimeout(conn.helloTimer)
    conns.delete(socket)

    // null for a socket that never entered a room, was replaced, or whose room was swept
    const left = rooms.leave(socket)
    if (!left) return
    if (left.peer) send(left.peer, { type: 'peer', state: 'left' })
    log('left', { room: left.room, role: left.role, peerPresent: left.peer !== null })
  }

  // --- refusals and closing ---

  // detail goes to the client only. The log gets the reason and the caller's fields (role, room),
  // never the detail, which can quote a bad frame's contents
  function refuse(
    socket: WebSocket,
    reason: RefusedReason,
    detail: string,
    fields: LogFields = {}
  ): void {
    log('refused', { reason, ...fields })
    send(socket, { type: 'refused', reason, detail })
    const conn = conns.get(socket)
    if (conn) closeSocket(socket, conn, CLOSE_POLICY, reason)
  }

  // close() rather than terminate(): queued frames (a refusal) are still delivered first.
  // A peer that never completes the closing handshake is terminated by the heartbeat
  function closeSocket(socket: WebSocket, conn: Conn, code: number, reason: string): void {
    conn.phase = 'closing'
    if (conn.helloTimer) clearTimeout(conn.helloTimer)
    conn.helloTimer = null
    socket.close(code, reason)
  }

  function send(socket: WebSocket, frame: FromRelay): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame))
  }

  // --- timers ---

  // Pings every socket, members and not-yet-hello alike. A socket that has missed
  // missedHeartbeats pongs is terminated (not closed: a dead peer never finishes the closing
  // handshake), which fires 'close' and so tells its peer 'left'
  const heartbeat = setInterval(() => {
    for (const [socket, conn] of conns) {
      if (conn.missedPongs >= config.missedHeartbeats) {
        log('closed', { cause: 'heartbeat', phase: conn.phase })
        conn.phase = 'closing'
        socket.terminate()
        continue
      }
      conn.missedPongs++
      if (socket.readyState === WebSocket.OPEN) socket.ping()
    }
  }, config.heartbeatMs)

  const sweep = setInterval(() => {
    for (const expired of rooms.sweep()) {
      log('room-expired', { room: expired.room, members: expired.members.length })
      for (const member of expired.members) {
        const conn = conns.get(member)
        if (conn) closeSocket(member, conn, CLOSE_GOING_AWAY, 'Room expired')
      }
    }
  }, SWEEP_INTERVAL_MS)

  // --- shutdown ---

  let closed: Promise<void> | null = null
  const close = (): Promise<void> => {
    if (closed) return closed
    closed = new Promise<void>((resolve) => {
      clearInterval(heartbeat)
      clearInterval(sweep)
      for (const conn of conns.values()) {
        if (conn.helloTimer) clearTimeout(conn.helloTimer)
      }
      for (const client of wss.clients) client.terminate()
      wss.close()
      http.closeAllConnections()
      // Resolves on error too (e.g. the server never started listening): either way it's done
      http.close(() => resolve())
    })
    return closed
  }

  return { port, close }
}

// --- helpers ---

const REFUSAL_DETAIL: Record<'room-taken' | 'server-full' | 'no-such-room', string> = {
  'no-such-room': 'No participant has opened this room',
  'room-taken': 'This room code is in use by another participant; pick a new code',
  'server-full': 'The relay has no free rooms; try again shortly'
}

function sha256(text: string): Buffer {
  return createHash('sha256').update(text, 'utf8').digest()
}
