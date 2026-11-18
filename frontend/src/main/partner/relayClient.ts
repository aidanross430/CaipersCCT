// The relay transport: a WebSocket *client* of the hosted relay (relay/), used in place of
// lanHost.ts when the proctor is on another network. Runs in main only (Node), for both apps:
//   createParticipantRelayLink   the participant app's ParticipantLink (index.ts swaps it in for
//                                createLanHost with no other changes)
//   createProctorRelayLink       the proctor client's ProctorLink (Phase 4)
// Both sit on one createRelayTransport, which owns the socket: hello, refusals, reconnecting,
// and the relay's 'peer' and 'data' frames. The links add the pairing rules on top, which are
// the same as lanHost's: the proctor sends a handshake, the participant answers welcome/rejected.
//
//   participant link ──┐                          ┌── proctor link
//                      ├─ transport ── relay ── transport ─┤
//   (pairing: answers) ┘   (hello, reconnect)     └ (pairing: asks)
import { WebSocket } from 'ws'
import { HEARTBEAT_INTERVAL_MS, MISSED_HEARTBEATS_BEFORE_DISCONNECT, type ParticipantLink,
  type PartnerStatus, type ProctorLink } from '../../shared/partner/link'
import { PROTOCOL_VERSION, type ProctorView, type ToParticipant, type ToProctor } from '../../shared/partner/protocol'
import { MAX_FRAME_BYTES, MAX_ROOM_CODE_ATTEMPTS, RELAY_VERSION, parseFromRelay,
  type RefusedReason, type ToRelay } from '../../shared/partner/relay'
import { parseToParticipant } from '../../shared/partner/validate'
import { generateClaim, generateRoomCode } from './roomCode'


export type RelayClientOptions = {
  url: string                         // wss://<host>/v1, from Options/relay.json
  token: string                       // the lab access token, from relay-key.txt. Main only
  onProblem?: (problem: string) => void  // refusals, bad frames, dropped connections
  backoffMs?: readonly number[]       // default RECONNECT_BACKOFF_MS; tests shorten it
  heartbeatMs?: number                // default HEARTBEAT_INTERVAL_MS; tests shorten it
}

// Waits between reconnect attempts. The last value repeats until a connection holds.
// The first is short because most drops are Cloud Run's 60-minute cut or a redeploy
export const RECONNECT_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000] as const

// --- transport ---

// What the transport is doing. The links turn this into PartnerStatus
export type TransportState =
  | { state: 'connecting' }
  | { state: 'ready'; room: string; peerPresent: boolean }   // hello accepted
  | { state: 'retrying'; reason: string; inMs: number }       // dropped or refused; will retry
  | { state: 'stopped'; reason: string }                     // won't retry: needs a person to fix

export type TransportOptions = RelayClientOptions &
  (
    | { role: 'participant' }          // makes its own room code and claim (roomCode.ts)
    | { role: 'proctor'; room: string } // the code the proctor typed
  )

export type RelayTransport = {
  send: (payload: string) => void      // one protocol.ts message as JSON text. Dropped unless ready
  onData: (cb: (payload: string) => void) => () => void      // unsubscribe functions, as in link.ts
  onPeer: (cb: (state: 'joined' | 'left') => void) => () => void
  onState: (cb: (state: TransportState) => void) => () => void
  close: () => void                    // stops reconnecting for good
}

type Next = 
  | { then: 'now' } // reconnect immediately
  | { then: 'retry', reason: string } // back off first then reconnect
  | { then: 'stop', reason: string }  // don't reconnect


export function createRelayTransport(options: TransportOptions): RelayTransport {
  const {
    url, token, onProblem = () => {},
    backoffMs = RECONNECT_BACKOFF_MS, heartbeatMs = HEARTBEAT_INTERVAL_MS
  } = options

  // keep at parent level so reconnect reclaims the same room
  let room = options.role === 'participant' ? generateRoomCode() : options.room
  let claim = options.role === 'participant' ? generateClaim() : null

  const dataListeners = new Set<(payload: string) => void>()
  const peerListeners = new Set<(state: 'joined' | 'left') => void>()
  const stateListeners = new Set<(state: TransportState) => void>()

  let socket: WebSocket | null = null
  let ready = false          // true between 'ready' and this socket closing
  let attempt = 0            // retries since the last 'ready': indexes backoffMs
  let roomTaken = 0          // room-taken refusals in a row
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let closed = false

  const setState = (s: TransportState): void => stateListeners.forEach((cb) => cb(s))

  // The hello
  function hello(): ToRelay {
    const base = { type: 'hello', relayVersion: RELAY_VERSION, room, token } as const
    return claim === null ? { ...base, role: 'proctor' } : { ...base, role: 'participant', claim }
  }

  // Connecting to the relay
  function connect(): void {
    if (closed) return
    setState({ state: 'connecting' })
    const ws = new WebSocket(url, { maxPayload: MAX_FRAME_BYTES })
    socket = ws
    let next: Next = { then: 'retry', reason: 'Lost the connection to the relay' }

    // Dead-relay watchdog: the relay pings every heartbeatMs; silence for 3 intervals = gone
    let silence: ReturnType<typeof setTimeout> | undefined
    const feed = (): void => {
      clearTimeout(silence)
      silence = setTimeout(() => ws.terminate(), heartbeatMs * (MISSED_HEARTBEATS_BEFORE_DISCONNECT + 1))
    }

    ws.on('open', () => {
      feed()
      ws.send(JSON.stringify(hello()))
    })
    ws.on('ping', feed)                      // ws sends the pong itself
    ws.on('message', (data) => {
      feed()
      const result = handleFrame(String(data))
      if (result) {
        next = result
        ws.close()
      }
    })
    ws.on('error', (err) => onProblem(`Relay connection error: ${err.message}`))  // 'close' follows
    ws.on('close', () => {
      clearTimeout(silence)
      ready = false
      if (!closed) afterClose(next)
    })

    // For parsing messages sent to/from the relay
    function handleFrame(raw: string): Next | null {
      const result = parseFromRelay(raw)
      if (!result.ok) {
        onProblem(`Bad frame from the relay: ${result.problem}`)
        return null
      }
      const frame = result.message
      // What type of frame is being recieved?
      switch (frame.type) {
        case 'ready':
          ready = true
          attempt = 0
          roomTaken = 0
          setState({ state: 'ready', room, peerPresent: frame.peerPresent })
          return null
        case 'peer':
          peerListeners.forEach((cb) => cb(frame.state))
          return null
        case 'data':
          dataListeners.forEach((cb) => cb(frame.payload))   // the link parses the payload
          return null
        case 'refused':
          return onRefused(frame.reason, frame.detail)
      }
    }

    // Handles which retry logic to use when the relay is refusing a frame from this client
    function onRefused(reason: RefusedReason, detail: string): Next {
      onProblem(`The relay refused this app (${reason}): ${detail}`)
      // Someone else holds this code: new code and claim, try again at once
      if (reason === 'room-taken' && claim !== null && ++roomTaken < MAX_ROOM_CODE_ATTEMPTS) {
        room = generateRoomCode()
        claim = generateClaim()
        return { then: 'now' }
      }
      // Might fix itself: the participant comes back, a room frees up
      if (reason === 'no-such-room' || reason === 'server-full') return { then: 'retry', reason: detail }
      // bad-token, version-mismatch, bad-hello, or room-taken too many times: retrying can't help
      return { then: 'stop', reason: detail }
    }

    // how the behavior for after a connection closes is actually defined
    function afterClose(next: Next): void {
      if (next.then === 'stop') return setState({ state: 'stopped', reason: next.reason })
      if (next.then === 'now') return connect()
      // tries to iterate the backoff to make it progressively longer if it can
      const inMs = backoffMs[Math.min(attempt++, backoffMs.length - 1)] ?? 1_000
      setState({ state: 'retrying', reason: next.reason, inMs })
      retryTimer = setTimeout(connect, inMs)
    }
  }

  // Start the connection
  connect()

  return {
    send: (payload) => {
      if (ready && socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'data', payload }))
      }
    },
    
    onData: (cb) => { dataListeners.add(cb); return () => dataListeners.delete(cb) },
    onPeer: (cb) => { peerListeners.add(cb); return () => peerListeners.delete(cb) },
    onState: (cb) => { stateListeners.add(cb); return () => stateListeners.delete(cb) },

    close: () => {
      closed = true
      clearTimeout(retryTimer)
      socket?.close(1000) // so the relay can tell the peer that you left
    }
  }
}


// Same contract as createLanHost: index.ts gets a ParticipantLink and never knows the difference
export function createParticipantRelayLink(options: RelayClientOptions): ParticipantLink {
  const { onProblem = () => {} } = options
  const transport = createRelayTransport({ ...options, role: 'participant' })

  const messageListeners = new Set<(message: ToParticipant) => void>()
  const statusListeners = new Set<(status: PartnerStatus) => void>()
  let room: string | null = null              // from 'ready'; shown on the Welcome page
  let paired = false                          // the current proctor has handshaken
  let lastView: ProctorView | null = null     // what a newly paired proctor gets first

  const emit = (s: PartnerStatus): void => statusListeners.forEach((cb) => cb(s))
  const showWaiting = (): void => {
    if (room) emit({ state: 'waiting', join: { url: options.url, code: room } })
  }
  const sendTo = (m: ToProctor): void => transport.send(JSON.stringify(m))

  // update status according to transport state
  transport.onState((s) => {
    if (s.state === 'ready') {
      room = s.room
      paired = false
      showWaiting()
    } else if (s.state === 'retrying' || s.state === 'stopped') {
      paired = false
      emit({ state: 'disconnected', reason: s.reason })
    }
  })

  // reactions to peer events (peer joins or exits)
  transport.onPeer((state) => {
    if (!paired) return
    paired = false
    if (state === 'left') emit({ state: 'disconnected', reason: 'The proctor disconnected' })
    showWaiting()
  })

  // handling data sent from the peer
  transport.onData((payload) => {
    const result = parseToParticipant(payload)
    if (!result.ok) return onProblem(`Bad message from the proctor: ${result.problem}`)

    const message = result.message
    
    // This block handles the different types of incoming messages
    if (message.type === 'handshake') {
      // Skip on an already paired client
      if (paired) return
      if (message.version !== PROTOCOL_VERSION) {
        return sendTo({
          type: 'rejected',
          reason: `Proctor and participant client protocol version mismatch. Proctor is using ${message.version}, while this client is using ${PROTOCOL_VERSION}`
        })
      }
      paired = true
      sendTo({
        type: 'welcome'
      })
      if (lastView) sendTo({ type: 'view', view: lastView })
        emit({ state: 'connected' })
        return
      }
    // handles message types 'chat' and 'typing'
    if (paired) messageListeners.forEach((cb) => cb(message))
  })

  return {
    send: (message) => {
      if (message.type === 'view') lastView = message.view
      if (paired) sendTo(message)       // dropped otherwise: the next view catches them up
    },
    onMessage: (cb) => { messageListeners.add(cb); return () => messageListeners.delete(cb) },
    onStatus: (cb) => { statusListeners.add(cb); return () => statusListeners.delete(cb) },
    close: () => transport.close()
  }
}

// --- proctor link (Phase 4) ---

export function createProctorRelayLink(options: RelayClientOptions & { room: string }): ProctorLink {
  // TODO (Phase 4): on createRelayTransport({ ...options, role: 'proctor' })
  //   ready with peerPresent, or peer joined → send handshake { version: PROTOCOL_VERSION, code }
  //   welcome → 'connected'; rejected → close() and report the reason (wrong code, version)
  //   peer left → 'disconnected' 'The participant disconnected'; wait for them to come back
  //   data → parseToProctor → onMessage (view, welcome, rejected)
  void options
  throw new Error('createProctorRelayLink is not implemented yet')
}
