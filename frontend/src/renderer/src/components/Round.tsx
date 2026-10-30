import type { JSX } from 'react'
import type { RoundEndReason } from '../../../shared/types'
import type { LiveRound } from '../../../shared/partner/protocol'

// TODO (proctor page, step 4): readOnly?: boolean   cards disabled, no Stop / Next buttons. The
//   round-end message still shows so the proctor can see why the round ended
//   (onFlip / onStop / onNext become optional, or are required unless readOnly)

type RoundProps = {
  // LiveRound rather than RoundState so the proctor page can pass what it receives. Task's
  // RoundState still fits: it has every field LiveRound has, plus more
  round: LiveRound
  isLastRound: boolean
  onFlip: (position: number, clickedAt: number) => void
  onStop: () => void
  onNext: () => void
}

const endMessages: Record<RoundEndReason, string> = {
  stopped: 'You stopped and kept your points.', // not shown: stopping moves on immediately
  loss: 'You turned over a loss card. The round is over.',
  allGainsRevealed: 'You turned over every gain card. The round is over.'
}

// Displays one round: the info panel, the card grid and the stop/next buttons. It holds no
// state of its own; everything comes from Task through props. Kept separate from the Task
// page so the proctor page can show the same board
export default function Round({
  round,
  isLastRound,
  onFlip,
  onStop,
  onNext
}: RoundProps): JSX.Element {
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
    </>
  )
}
