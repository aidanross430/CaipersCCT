import type { JSX } from 'react'
import type { LiveRound as LiveRoundData } from '../../../shared/partner/protocol'
import type { RoundEndReason } from '../../../shared/types'

type LiveRoundProps = {
  round: LiveRoundData | null // the round being played, or the one that just ended
}

const END_REASONS: Record<RoundEndReason, string> = {
  stopped: 'Stopped and kept their points',
  loss: 'Turned over a loss card',
  allGainsRevealed: 'Turned over every gain card'
}

// What the participant is doing right now, read-only. A small copy of their board: only the
// cards they've turned over are shown, since loss positions are never sent
export default function LiveRound({ round }: LiveRoundProps): JSX.Element {
  if (!round) return <p className="proctor-note">Waiting for the round to start.</p>

  const { config, flips } = round
  const flipped = new Map(flips.map((f) => [f.cardPosition, f.outcome]))

  return (
    <section className="info proctor-round" aria-label="Live round">
      <h2>Live round</h2>
      <div className="info-row">
        <span>Gain per card: {config.gainAmount}</span>
        <span>Loss amount: {config.lossAmount}</span>
        <span>
          Loss cards: {config.numberLossCards} of {config.totalCards}
        </span>
      </div>

      <p className="round-score">
        Round score: {round.roundScore} · {flips.length} card{flips.length === 1 ? '' : 's'} turned
      </p>

      <div className="grid mini-grid">
        {Array.from({ length: config.totalCards }, (_, i) => {
          const outcome = flipped.get(i)
          return (
            <div key={i} className={`card${outcome ? ` ${outcome}` : ''}`}>
              {outcome === 'gain'
                ? `+${config.gainAmount}`
                : outcome === 'loss'
                  ? `−${config.lossAmount}`
                  : ''}
            </div>
          )
        })}
      </div>

      {round.roundEnded && round.endReason && (
        <p className="round-message proctor-end">{END_REASONS[round.endReason]}</p>
      )}
    </section>
  )
}
