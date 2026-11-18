import { useEffect, useState, type JSX } from 'react'
import type { PartnerStatus } from '../../../../shared/partner/link'
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../../../../shared/partner/relay'
import { useOptions } from '../../state/optionsContext'
import { usePartnerStatus } from './usePartnerStatus'

// The code the proctor types into the proctor client to join this session, and whether they
// have. Shown on the Welcome page in every condition, so the screen can't hint at who the
// partner really is:
//   actualPartner "student"  the real relay status
//   actualPartner "llm"      a placeholder that acts out the same thing: a made-up code,
//                            "Waiting to connect", then "Connected" after a short delay
// Worded neutrally ("session code", never "proctor"): in the perceivedPartner "ai" condition the
// participant may be at the screen, and must not learn a person is on the other end
export default function SessionCode(): JSX.Element | null {
  const { chat } = useOptions()
  const isPlaceholder = chat.actualPartner === 'llm'
  // Both hooks always run (React's rules); only one result is used
  const real = usePartnerStatus()
  const placeholder = usePlaceholderStatus(isPlaceholder)
  const status = isPlaceholder ? placeholder : real
  if (!status) return null

  switch (status.state) {
    case 'waiting':
      return (
        <div className="session-code" role="status">
          Session code
          <span className="code">{status.join.code}</span>
          <span className="state">Waiting to connect</span>
        </div>
      )
    case 'connected':
      return (
        <div className="session-code" role="status">
          <span className="state ok">Connected</span>
        </div>
      )
    case 'disconnected':
      return (
        <div className="session-code" role="status">
          Session code
          <span className="state bad">Not connected: {status.reason}</span>
        </div>
      )
  }
}

// --- placeholder for the LLM conditions ---

// How long the placeholder "waits for the proctor": about as long as someone reading the code
// off this screen and typing it in. A random point in this range
const PLACEHOLDER_CONNECT_MS: [number, number] = [5_000, 15_000]

// Kept for the whole app run, like a real relay link: one code, and once connected it stays
// connected, so a second session in the same run looks like the proctor is still there
const placeholderCode = makeCode()
let placeholderConnected = false

function usePlaceholderStatus(enabled: boolean): PartnerStatus | null {
  const [connected, setConnected] = useState(placeholderConnected)

  useEffect(() => {
    if (!enabled || placeholderConnected) return
    const [min, max] = PLACEHOLDER_CONNECT_MS
    const timer = setTimeout(
      () => {
        placeholderConnected = true
        setConnected(true)
      },
      min + Math.random() * (max - min)
    )
    return () => clearTimeout(timer)
  }, [enabled])

  if (!enabled) return null
  return connected
    ? { state: 'connected' }
    : { state: 'waiting', join: { url: '', code: placeholderCode } }
}

// Same alphabet and length as a real room code (roomCode.ts), so the two can't be told apart.
// Math.random is enough: nothing ever joins this code
function makeCode(): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET.charAt(Math.floor(Math.random() * ROOM_CODE_ALPHABET.length))
  }
  return code
}
