import type { ParticipantLink, PartnerStatus } from '../../shared/partner/link'
import type { ToParticipant, ToProctor } from '../../shared/partner/protocol'

// A stand-in proctor for development, used until lanHost.ts exists. It "pairs" after a second,
// then answers every new participant message in the published view with an echo, showing
// "is typing..." first. Lets the whole renderer side run in `npm run dev` with no sockets
export function createFakeLink(): ParticipantLink {
  const messageListeners = new Set<(message: ToParticipant) => void>()
  const statusListeners = new Set<(status: PartnerStatus) => void>()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let connected = false
  let answered = 0 // how many participant messages have been echoed so far

  const later = (ms: number, fn: () => void): void => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      fn()
    }, ms)
    timers.add(timer)
  }
  const emitStatus = (status: PartnerStatus): void => statusListeners.forEach((cb) => cb(status))
  const emitMessage = (message: ToParticipant): void => messageListeners.forEach((cb) => cb(message))

  // Deferred so main has subscribed before the first status goes out
  later(0, () => emitStatus({ state: 'waiting', join: { url: 'fake://proctor', code: '0000' } }))
  later(1000, () => {
    connected = true
    emitStatus({ state: 'connected' })
  })

  return {
    send: (message: ToProctor) => {
      if (!connected || message.type !== 'view') return
      // Participant messages are counted across breaks, so the echo only answers new ones
      const fromParticipant = message.view.chat.filter((m) => m.sender === 'participant')
      if (fromParticipant.length <= answered) {
        // A new break starts with an empty chat: start counting again
        if (fromParticipant.length === 0) answered = 0
        return
      }
      const latest = fromParticipant[fromParticipant.length - 1]
      answered = fromParticipant.length
      later(500, () => emitMessage({ type: 'typing', isTyping: true }))
      later(2000, () => {
        emitMessage({ type: 'typing', isTyping: false })
        emitMessage({ type: 'chat', text: `echo: ${latest.text}` })
      })
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
      timers.forEach(clearTimeout)
      timers.clear()
      connected = false
    }
  }
}
