import { useEffect, useState, type JSX } from 'react'
import type { RoundConfig, RoundEndReason, RoundResponse } from '../../../shared/types'
import { useSession } from '../state/SessionContext'
import {
  flipCard,
  startRound,
  stopRound,
  toRoundResponse,
  type RoundState
} from '../features/cct/scoring'

// How long the "get ready" screen between rounds is shown
const BETWEEN_ROUNDS_MS = 1500

// Session-level part of the task page: works out which round is current, hands the
// finished round back to the session, and shows the break screen between rounds
export default function Task(): JSX.Element | null {
  const { session, completeRound, finishSession } = useSession()
  const [betweenRounds, setBetweenRounds] = useState(false)

  // Hide the break screen after BETWEEN_ROUNDS_MS. The cleanup cancels the timer if the
  // page unmounts first
  useEffect(() => {
    if (!betweenRounds) return
    const timer = setTimeout(() => setBetweenRounds(false), BETWEEN_ROUNDS_MS)
    return () => clearTimeout(timer)
  }, [betweenRounds])

  // The current round is the first one without a response
  const roundNumber = session.roundResponses.length
  const config = session.roundConfigs[roundNumber]
  const totalRounds = session.roundConfigs.length
  const isLastRound = roundNumber === totalRounds - 1
  const trialScoreBefore = session.roundResponses.at(-1)?.trialScore ?? 0

  // Only happens if there are no rounds left; PhaseGuard moves on once the session finishes
  if (!config) return null

  // The round is recorded right away; the break only delays when the next round appears
  const handleRoundDone = (response: RoundResponse): void => {
    completeRound(response)
    if (isLastRound) finishSession()
    else setBetweenRounds(true)
  }

  // roundResponses already includes the round that just ended, so roundNumber is the next round
  if (betweenRounds) {
    return (
      <main className="trial between-rounds" aria-live="polite">
        <p className="total-score">Total score: {trialScoreBefore}</p>
        <p className="get-ready">Get ready for round {roundNumber + 1}...</p>
      </main>
    )
  }

  // The next Round only mounts after the break, so its start time (and the first flip's
  // timing) doesn't include the break
  return (
    <main className="trial">
      <div className="trial-badge">
        Round {roundNumber + 1} of {totalRounds}
      </div>
      {/* key makes React create a fresh Round (and fresh round state) for every new round */}
      <Round
        key={config.roundIndex}
        config={config}
        trialScoreBefore={trialScoreBefore}
        isLastRound={isLastRound}
        onDone={handleRoundDone}
      />
    </main>
  )
}

type RoundProps = {
  config: RoundConfig
  trialScoreBefore: number
  isLastRound: boolean
  onDone: (response: RoundResponse) => void
}

const endMessages: Record<RoundEndReason, string> = {
  stopped: 'You stopped and kept your points.', // not shown: stopping moves on immediately
  loss: 'You turned over a loss card. The round is over.',
  allGainsRevealed: 'You turned over every gain card. The round is over.'
}

// One round of the hot CCT: the info panel, the card grid and the stop/next buttons
function Round({ config, trialScoreBefore, isLastRound, onDone }: RoundProps): JSX.Element {
  // Started during the first render, a few ms before the cards are painted
  const [round, setRound] = useState<RoundState>(() => startRound(config, performance.now()))

  // event.timeStamp is when the click happened, on the same clock as performance.now()
  const handleFlip = (position: number, clickedAt: number): void => {
    setRound((r) => flipCard(r, position, clickedAt))
  }
  // Stopping ends the round and moves straight on (break screen, or the end of the task),
  // since there's no new card to look at. Rounds that end on a flip still show Next round
  const handleStop = (): void => onDone(toRoundResponse(stopRound(round), trialScoreBefore))
  const handleNext = (): void => onDone(toRoundResponse(round, trialScoreBefore))

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

      <div className="grid" aria-label="Cards">
        {Array.from({ length: config.totalCards }, (_, position) => {
          const flip = flipsByPosition.get(position)
          return (
            <button
              key={position}
              type="button"
              className={flip ? `card ${flip.outcome}` : 'card'}
              disabled={flip !== undefined || round.roundEnded}
              onClick={(e) => handleFlip(position, e.timeStamp)}
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
            <button className="btn-primary" type="button" onClick={handleNext} autoFocus>
              {isLastRound ? 'Finish' : 'Next round'}
            </button>
            {round.endReason && <p className="round-message">{endMessages[round.endReason]}</p>}
          </>
        ) : (
          <button className="btn-primary" type="button" onClick={handleStop}>
            Stop and keep points
          </button>
        )}
      </div>
    </>
  )
}
