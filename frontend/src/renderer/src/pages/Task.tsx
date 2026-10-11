import { useEffect, useState, type JSX, type ReactNode } from 'react'
import type { RoundEndReason } from '../../../shared/types'
import { useSession } from '../state/SessionContext'
import ChatPanel from '../components/chat/ChatPanel'
import { useChat } from '../features/chatbox/useChat'
import { CHAT_CONFIG } from '../features/chatbox/chat.config'
import {
  flipCard,
  startRound,
  stopRound,
  toRoundResponse,
  type RoundState
} from '../features/cct/scoring'

// How long the "get ready" screen between rounds is shown
const BETWEEN_ROUNDS_MS = 1500

// The task page. It owns the state of the round being played, so anything else on the page
// (the chat panel, later) can read the same round the card grid shows
export default function Task(): JSX.Element | null {
  const { session, completeRound, finishSession, saveMessage } = useSession()
  const [betweenRounds, setBetweenRounds] = useState(false)

  // The current round is the first one without a response
  const roundNumber = session.roundResponses.length
  const config = session.roundConfigs[roundNumber]
  const totalRounds = session.roundConfigs.length
  const isLastRound = roundNumber === totalRounds - 1
  const trialScoreBefore = session.roundResponses.at(-1)?.trialScore ?? 0

  // The round being played. The first round starts when the page first renders; every later
  // round starts when the break screen before it ends (see the effect below)
  const [round, setRound] = useState<RoundState | null>(() =>
    config ? startRound(config, performance.now()) : null
  )

  // The chat lives here (not in Round) so the conversation carries over between rounds.
  // Hooks have to run before the early returns below
  const persona = CHAT_CONFIG.personas[session.trialConfig.chatDisplayCondition]
  const chat = useChat({
    round,
    adviceCondition: CHAT_CONFIG.adviceCondition,
    displayCondition: session.trialConfig.chatDisplayCondition,
    persona,
    totalScoreBefore: trialScoreBefore,
    saveMessage
  })

  // End the break after BETWEEN_ROUNDS_MS and start the next round. Starting it here, rather
  // than when the previous round ended, keeps the break out of the first flip's timing.
  // The cleanup cancels the timer if the page unmounts first
  useEffect(() => {
    if (!betweenRounds || !config) return
    const timer = setTimeout(() => {
      setRound(startRound(config, performance.now()))
      setBetweenRounds(false)
    }, BETWEEN_ROUNDS_MS)
    return () => clearTimeout(timer)
  }, [betweenRounds, config])

  // Only happens if there are no rounds left; PhaseGuard moves on once the session finishes
  if (!config) return null

  // roundResponses already includes the round that just ended, so roundNumber is the next round
  if (betweenRounds) {
    return (
      <main className="trial between-rounds" aria-live="polite">
        <p className="total-score">Total score: {trialScoreBefore}</p>
        <p className="get-ready">Get ready for round {roundNumber + 1}...</p>
      </main>
    )
  }

  // As soon as a round is recorded, config moves on to the next round while `round` still
  // holds the finished one until the break ends. Treating that round as stale stops it being
  // shown or recorded twice (e.g. a double-click on Next round)
  if (!round || round.config.roundIndex !== config.roundIndex) return null

  // Record the finished round straight away; the break only delays when the next round appears
  const handleRoundDone = (finished: RoundState): void => {
    completeRound(toRoundResponse(finished, trialScoreBefore))
    if (isLastRound) finishSession()
    else setBetweenRounds(true)
  }

  // event.timeStamp is when the click happened, on the same clock as performance.now()
  const handleFlip = (position: number, clickedAt: number): void => {
    setRound((r) => (r ? flipCard(r, position, clickedAt) : r))
  }
  // Stopping ends the round and moves straight on (break screen, or the end of the task),
  // since there's no new card to look at. Rounds that end on a flip still show Next round
  const handleStop = (): void => {
    const stopped = stopRound(round)
    setRound(stopped) // so anything reading the round sees that it has ended
    handleRoundDone(stopped)
  }
  const handleNext = (): void => handleRoundDone(round)

  return (
    <main className="trial">
      <div className="trial-badge">
        Round {roundNumber + 1} of {totalRounds}
      </div>
      <Round
        round={round}
        isLastRound={isLastRound}
        onFlip={handleFlip}
        onStop={handleStop}
        onNext={handleNext}
        sidePanel={
          <ChatPanel
            persona={persona}
            greeting={CHAT_CONFIG.greeting}
            messages={chat.messages}
            partnerTyping={chat.partnerTyping}
            error={chat.error}
            disabled={round.roundEnded}
            onSend={chat.send}
          />
        }
      />
    </main>
  )
}

type RoundProps = {
  round: RoundState
  isLastRound: boolean
  onFlip: (position: number, clickedAt: number) => void
  onStop: () => void
  onNext: () => void
  sidePanel: ReactNode // shown to the right of the cards (the chat)
}

const endMessages: Record<RoundEndReason, string> = {
  stopped: 'You stopped and kept your points.', // not shown: stopping moves on immediately
  loss: 'You turned over a loss card. The round is over.',
  allGainsRevealed: 'You turned over every gain card. The round is over.'
}

// Displays one round: the info panel, the card grid and the stop/next buttons. It holds no
// state of its own; everything comes from Task through props
function Round({ round, isLastRound, onFlip, onStop, onNext, sidePanel }: RoundProps): JSX.Element {
  const { config } = round

  // Look up each card's flip (if any) by grid position
  const flipsByPosition = new Map(round.flips.map((f) => [f.cardPosition, f]))

  return (
    <>
      <section className="info" aria-labelledby="info-title">
        <h2 id="info-title">Round information</h2>
        <div className="info-row">
          <span>Number of loss cards: {config.numberLossCards}</span>
          <span>Points per gain card: {config.gainAmount}</span>
          <span>Points lost per loss card: {config.lossAmount}</span>
        </div>
      </section>

      <p className="round-score" aria-live="polite">
        Round score: {round.roundScore}
      </p>

      {/* Two columns, as in the mockup: cards and buttons on the left, side panel on the right */}
      <div className="play">
        <div>
          <div className="grid" aria-label="Cards">
            {Array.from({ length: config.totalCards }, (_, position) => {
              const flip = flipsByPosition.get(position)
              return (
                <button
                  key={position}
                  type="button"
                  className={flip ? `card ${flip.outcome}` : 'card'}
                  disabled={flip !== undefined || round.roundEnded}
                  onClick={(e) => onFlip(position, e.timeStamp)}
                  aria-label={flip ? `${flip.outcome} card` : `Card ${position + 1}, face down`}
                >
                  {flip === undefined
                    ? '?'
                    : flip.outcome === 'gain'
                      ? `+${config.gainAmount}`
                      : `−${config.lossAmount}`}
                </button>
              )
            })}
          </div>

          <div className="submit-row">
            {round.roundEnded ? (
              <>
                <button className="btn-primary" type="button" onClick={onNext} autoFocus>
                  {isLastRound ? 'Finish' : 'Next round'}
                </button>
                {round.endReason && (
                  <p className="round-message">{endMessages[round.endReason]}</p>
                )}
              </>
            ) : (
              <button className="btn-primary" type="button" onClick={onStop}>
                Stop and keep points
              </button>
            )}
          </div>
        </div>

        {sidePanel}
      </div>
    </>
  )
}
