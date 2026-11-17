// The room table: which sockets are in which room, and the rules for entering one. No sockets
// or timers in here (generic over the socket type, clock passed in), so every rule can be tested
// directly in rooms.test.ts. server.ts owns the sockets and calls these on hello, close and sweep.
//
// Rules
//   participant hello, room unknown         → open it (or 'server-full' at maxRooms)
//   participant hello, room known, same claim → reclaim: the new socket replaces the old one
//                                             (a reconnect after a drop, or before the old
//                                             socket was noticed as dead)
//   participant hello, room known, other claim → 'room-taken'
//   proctor hello, room unknown              → 'no-such-room'
//   proctor hello, room known                → join; replaces any earlier proctor socket
//   a member leaves                          → its slot empties; the peer is told 'left'.
//                                             An empty participant slot starts the grace period
//   sweep(now)                               → removes rooms past the grace period with no
//                                             participant, and rooms older than maxRoomAgeMs
import type { RefusedReason, RelayRole } from '@shared/partner/relay'

export type RoomTableOptions = {
  maxRooms: number
  roomGraceMs: number
  maxRoomAgeMs: number
  now?: () => number           // default Date.now; tests pass a fake clock
}

// What entering a room did, so server.ts knows whom to close and whom to tell
export type EnterResult<S> =
  | {
      ok: true
      replaced: S | null       // an older socket of the same role, now out of the room: close it
      peer: S | null           // the other member, if present: send it 'peer: joined'
    }
  | { ok: false; reason: Extract<RefusedReason, 'room-taken' | 'server-full' | 'no-such-room'> }

// What a socket leaving did. null when the socket wasn't in a room (or was already replaced,
// which is not a leave)
export type LeaveResult<S> = { room: string; role: RelayRole; peer: S | null } | null

export type RoomTable<S> = {
  enterAsParticipant: (room: string, claim: string, socket: S) => EnterResult<S>
  enterAsProctor: (room: string, socket: S) => EnterResult<S>
  peerOf: (socket: S) => S | null           // where a 'data' frame from this socket goes
  leave: (socket: S) => LeaveResult<S>
  sweep: () => { room: string; members: S[] }[]  // expired rooms; server.ts closes their members
  size: () => number
}

export function createRoomTable<S>(options: RoomTableOptions): RoomTable<S> {
  // TODO:
  //   rooms: Map<code, { claim, participant: S | null, proctor: S | null, createdAt,
  //                      participantLeftAt: number | null }>
  //   memberOf: Map<S, { room, role }>, so peerOf and leave are O(1)
  //   Claim comparison here can be plain ===: it's not the access token, and a room is only
  //   reachable by someone who already passed the token check
  void options
  throw new Error('createRoomTable is not implemented yet')
}
