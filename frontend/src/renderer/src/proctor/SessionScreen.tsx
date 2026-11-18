import type { JSX } from 'react'
import type { PartnerMessage } from '../../../shared/ipc'
import type { PartnerStatus } from '../../../shared/partner/link'
import type { ProctorView } from '../../../shared/partner/protocol'
import LiveRound from './LiveRound'
import ProctorChat from './ProctorChat'
import UpcomingAdvice from './UpcomingAdvice'

type SessionScreenProps = {
  code: string
  status: PartnerStatus
  view: ProctorView | null // null until the participant's first view arrives
  onSend: (message: PartnerMessage) => void
  onDisconnect: () => void
}

// Joined a room: a status bar, then what the participant is doing and the chat.
// Everything shown comes from the participant's ProctorView; nothing is computed here
export default function SessionScreen({
  code,
  status,
  view,
  onSend,
  onDisconnect
}: SessionScreenProps): JSX.Element {
  // TODO: the status bar
  //   - code, and status in words: waiting → "Waiting for the participant", connected →
  //     "Connected", disconnected → "Reconnecting: <reason>"
  //   - a Disconnect button (onDisconnect), back to code entry
  //   - header numbers from view: roundNumber / totalRounds, trialScore, phase and block
  void code
  void status
  void onDisconnect
  return (
    <main className="trial">
      <p>TODO: status bar</p>
      {/* TODO: layout. During a round: LiveRound large, chat closed. On the break: UpcomingAdvice
          and the chat side by side, since that's when the proctor has to act */}
      <LiveRound round={view?.round ?? null} />
      <UpcomingAdvice upcoming={view?.upcoming ?? null} />
      <ProctorChat
        messages={view?.chat ?? []}
        open={view?.betweenRounds ?? false}
        onSend={(text) => onSend({ type: 'chat', text })}
        onTyping={(isTyping) => onSend({ type: 'typing', isTyping })}
      />
    </main>
  )
}
