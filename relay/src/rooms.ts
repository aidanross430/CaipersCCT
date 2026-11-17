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

// the room type
type Room<S> = {
  claim: string
  participant: S | null
  proctor: S | null
  createdAt: number
  participantLeftAt: number | null   // set while the participant slot is empty; null while held
}

export function createRoomTable<S>(options: RoomTableOptions): RoomTable<S> {
  const { maxRooms, roomGraceMs, maxRoomAgeMs, now = Date.now } = options

  // Two Maps:
  // rooms -> contains the code to each room, and contains data about that room
  //          (like the participant/proctor identities, the room claim, start time, etc.)
  // memberOf -> maps the individual client sockets to the room so that checking peerOf or
  //             leave doesn't need to go through every room. (basically its a way to get to
  //             the room when you only have the participant)
  const rooms = new Map<string, Room<S>>()
  const memberOf = new Map<S, { room: string; role: RelayRole }>()

  // seats the socket into the specified role in that room, returning whoever held that role before
  function seat(code: string, room: Room<S>, role: RelayRole, socket: S): S | null {
    const previous = room[role]
    if (previous !== null) memberOf.delete(previous)
    room[role] = socket
    memberOf.set(socket, { room: code, role })
    return previous
  }

  return {
    // When participant sends hello:
    //  create the room if it doesn't exist
    //  If it does exist and the claims don't match, that room was already taken (incredibly unlikely)
    enterAsParticipant(code, claim, socket) {
      const existing = rooms.get(code)

      if (!existing) {
        if (rooms.size >= maxRooms) return { ok: false, reason: 'server-full' }
        const room: Room<S> = {
          claim,
          participant: null,
          proctor: null,
          createdAt: now(),
          participantLeftAt: null
        }
        rooms.set(code, room)
        seat(code, room, 'participant', socket)
        return { ok: true, replaced: null, peer: null }
      }

      if (existing.claim !== claim) return { ok: false, reason: 'room-taken' }

      // Reclaim: after a drop (slot empty) or before the old socket was noticed as dead
      const replaced = seat(code, existing, 'participant', socket)
      existing.participantLeftAt = null
      return { ok: true, replaced, peer: existing.proctor }
    },

    // Check that the room the proctor is trying to enter exists
    enterAsProctor(code, socket) {
      const room = rooms.get(code)
      if (!room) return { ok: false, reason: 'no-such-room' }
      // Allowed while the participant is away (grace period): the proctor waits for them
      const replaced = seat(code, room, 'proctor', socket)
      return { ok: true, replaced, peer: room.participant }
    },

    // Returns the partner socket of this socket's room
    peerOf(socket) {
      const member = memberOf.get(socket)
      if (!member) return null
      const room = rooms.get(member.room)
      if (!room) return null
      return member.role === 'participant' ? room.proctor : room.participant
    },

    // Leave the room this socket is in
    leave(socket) {
      const member = memberOf.get(socket)
      if (!member) return null
      memberOf.delete(socket)

      const room = rooms.get(member.room)
      if (!room) return null
      room[member.role] = null
      // The room stays open for roomGraceMs so the participant can reclaim it with its claim
      if (member.role === 'participant') room.participantLeftAt = now()

      const peer = member.role === 'participant' ? room.proctor : room.participant
      return { room: member.room, role: member.role, peer }
    },

    // Deletes old rooms
    sweep() {
      const at = now()
      const expired: { room: string; members: S[] }[] = []

      for (const [code, room] of rooms) {
        const abandoned =
          room.participantLeftAt !== null && at - room.participantLeftAt >= roomGraceMs
        const tooOld = at - room.createdAt >= maxRoomAgeMs
        if (!abandoned && !tooOld) continue

        const members = [room.participant, room.proctor].filter((s): s is S => s !== null)
        // Out of the index first, so when server.ts closes them their leave() is a non-event
        // and the other member isn't told 'left' about a room that no longer exists
        for (const member of members) memberOf.delete(member)
        rooms.delete(code)
        expired.push({ room: code, members })
      }
      return expired
    },

    size: () => rooms.size
  }
}
