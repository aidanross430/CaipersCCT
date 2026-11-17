import { describe, it } from 'vitest'

// Room rules with plain objects as sockets and a fake clock: no network, no waiting

describe('createRoomTable', () => {
  describe('participant', () => {
    it.todo('opens an unknown room')
    it.todo('reclaims its room with the same claim, replacing the old socket')
    it.todo('is refused room-taken for a known room with a different claim')
    it.todo('is refused server-full at maxRooms')
  })

  describe('proctor', () => {
    it.todo('is refused no-such-room for an unknown room')
    it.todo('joins an open room and is returned as the participant\'s peer')
    it.todo('replaces an earlier proctor socket in the same room')
    it.todo('can join while the participant is away (room in its grace period)')
  })

  describe('leaving', () => {
    it.todo('returns the peer to tell when a member leaves')
    it.todo('treats a replaced socket closing as no leave at all')
    it.todo('returns null for a socket that was never in a room')
  })

  describe('sweep', () => {
    it.todo('keeps a room within its grace period after the participant leaves')
    it.todo('removes a room once the grace period passes with no participant')
    it.todo('removes any room older than maxRoomAgeMs, returning its members to close')
  })
})
