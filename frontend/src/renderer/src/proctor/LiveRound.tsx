import type { JSX } from 'react'
import type { LiveRound as LiveRoundData } from '../../../shared/partner/protocol'

type LiveRoundProps = {
  round: LiveRoundData | null // the round being played, or the one that just ended
}

// What the participant is doing right now, read-only
export default function LiveRound(props: LiveRoundProps): JSX.Element {
  // TODO:
  //   - null: "Waiting for the next round"
  //   - config: gainAmount, lossAmount, numberLossCards of totalCards
  //   - flips in order (CardFlip: gain or loss) and roundScore
  //   - once roundEnded: endReason in words (stopped, turned a loss card, all cards turned)
  //   The participant's Round component draws cards; a compact list or a row of small cards is
  //   enough here. Loss positions are never sent, so nothing here can reveal them
  void props
  return (
    <section>
      <h2>Live round</h2>
      <p>TODO</p>
    </section>
  )
}
