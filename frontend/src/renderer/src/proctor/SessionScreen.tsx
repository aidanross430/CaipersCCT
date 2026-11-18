import type { JSX } from 'react'
import type { PartnerMessage } from '../../../shared/ipc'
import type { PartnerStatus } from '../../../shared/partner/link'
import type { ProctorView } from '../../../shared/partner/protocol'
import LiveRound from './LiveRound'
import ProctorChat from './ProctorChat'

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
  const connected = status.state === 'connected'
  // Same rule as the participant's screen: the chat is open during a round in the advised block,
  // until the round ends (the participant's panel stays visible after that, but can't send)
  const chatOpen =
    view !== null &&
    view.phase === 'task' &&
    !view.betweenRounds &&
    view.block === 'advised' &&
    view.round !== null &&
    !view.round.roundEnded

  return (
    <main className="trial proctor">
      <header className="proctor-bar">
        <span className="trial-badge">
          Session <span className="code">{code}</span>
        </span>
        <StatusPill status={status} />
        <button className="btn-secondary" type="button" onClick={onDisconnect}>
          Disconnect
        </button>
      </header>

      {view === null ? (
        <p className="proctor-note">
          {connected
            ? "Connected. Waiting for the participant's screen..."
            : 'Waiting for the participant app to connect. Check the code on its Welcome page.'}
        </p>
      ) : (
        <>
          <Summary view={view} />
          <div className="proctor-layout">
            <div>
              <Activity view={view} />
            </div>
            <ProctorChat
              messages={view.chat}
              open={chatOpen}
              connected={connected}
              onSend={(text) => onSend({ type: 'chat', text })}
              onTyping={(isTyping) => onSend({ type: 'typing', isTyping })}
            />
          </div>
        </>
      )}
    </main>
  )
}

function StatusPill({ status }: { status: PartnerStatus }): JSX.Element {
  switch (status.state) {
    case 'waiting':
      return <span className="status-pill">Waiting for the participant</span>
    case 'connected':
      return <span className="status-pill ok">Connected</span>
    case 'disconnected':
      return <span className="status-pill bad">Reconnecting: {status.reason}</span>
  }
}

// The header numbers, as the participant sees them
function Summary({ view }: { view: ProctorView }): JSX.Element {
  // roundNumber is the round being played or the one after the break, so it passes
  // totalRounds once the last round is done
  const round = Math.min(view.roundNumber, view.totalRounds)
  return (
    <div className="info proctor-summary">
      <div className="info-row">
        <span>
          Round {round} of {view.totalRounds}
        </span>
        <span>Total score: {view.trialScore}</span>
        <span>
          {view.block === 'advised' ? 'Advised block (chat on breaks)' : 'Solo block (no chat)'}
        </span>
      </div>
    </div>
  )
}

// The left column: what the participant is doing now
function Activity({ view }: { view: ProctorView }): JSX.Element {
  switch (view.phase) {
    case 'welcome':
      return <p className="proctor-note">The participant hasn&apos;t started the task yet.</p>
    case 'interlude':
      return <p className="proctor-note">The participant is between blocks.</p>
    case 'complete':
      return <p className="proctor-note">The participant has finished the task.</p>
    case 'task':
      if (!view.betweenRounds) return <LiveRound round={view.round} />
      return <p className="proctor-note">The participant is on the break before the next round.</p>
  }
}
