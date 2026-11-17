// The relay server: HTTP for /health, WebSocket for everything else. Same shape as the
// participant app's createLanHost: a function that starts listening and returns a handle with
// close(), so tests can run real servers on port 0 and shut them down between cases
import type { RelayConfig } from './config'

export type RelayServer = {
  port: Promise<number>          // resolves once listening (the real port when config.port is 0)
  close: () => Promise<void>     // terminates every socket and releases the port
}

export function createRelayServer(config: RelayConfig): RelayServer {
  // TODO:
  // HTTP
  //   GET /health → 200 "ok" (plus open room count); anything else → 404.
  //   WebSocketServer on path /v1, maxPayload MAX_FRAME_BYTES, so ws refuses oversize frames
  //
  // On connection
  //   Start a helloTimeoutMs timer; no valid hello in time → refused 'bad-hello', close.
  //   Give the socket a RateLimiter; over the limit → close (no refusal: it's past hello)
  //
  // First frame (parseToRelay)
  //   address blocked                        → refused 'too-many-attempts'
  //   not ok, or not a hello                 → refused 'bad-hello', recordFailure
  //   relayVersion !== RELAY_VERSION         → refused 'version-mismatch'
  //   token wrong                            → refused 'bad-token', recordFailure.
  //                                            Compare with crypto.timingSafeEqual on equal-length
  //                                            buffers (hash both first so lengths always match)
  //   participant → rooms.enterAsParticipant; proctor → rooms.enterAsProctor
  //     refused ('no-such-room' also recordFailure, since that's what code guessing looks like)
  //     ok: send 'ready' { peerPresent: peer !== null }; close `replaced` (code 1000,
  //         'Replaced by a newer connection'); send peer 'peer: joined'
  //   A refusal sends { type: 'refused', reason, detail } and then closes the socket
  //
  // Later frames
  //   'data' → forward the frame unchanged to rooms.peerOf(socket); dropped if no peer.
  //            Forward the original text, not a re-serialised copy: cheaper, and the relay
  //            stays blind to the payload
  //   'hello' again, or anything unparseable → close the socket
  //
  // On close
  //   rooms.leave(socket); if it returns a peer, send it 'peer: left'
  //
  // Timers
  //   Heartbeat every heartbeatMs: ping each socket; terminate after missedHeartbeats
  //   unanswered (same scheme as lanHost.ts).
  //   Sweep every 30 s: rooms.sweep() and close the returned members; attempts.prune()
  //
  // Logging (log.ts): listening, room opened/reclaimed/joined/closed, refusals by reason,
  // sockets closed for rate or heartbeat. Never frame contents
  void config
  throw new Error('createRelayServer is not implemented yet')
}
