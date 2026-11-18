// Room codes for pairing a proctor with this participant app. Main only (Node crypto); the
// format and the check (isRoomCode) live in shared/partner/relay.ts so every side agrees.
// Used by lanHost.ts now, and by relayClient.ts, which also makes a fresh code on 'room-taken'
import { randomInt, randomBytes } from 'crypto'
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../../shared/partner/relay'

export function generateClaim(): string {
  return randomBytes(16).toString('hex')   // 32 hex characters, well over MIN_CLAIM_LENGTH
}

// crypto.randomInt is uniform over the alphabet (no modulo bias) and unpredictable, so a code
// can't be guessed from the previous one
export function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET.charAt(randomInt(ROOM_CODE_ALPHABET.length))
  }
  return code
}
