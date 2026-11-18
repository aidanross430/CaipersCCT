import type { JSX } from 'react'
import type { ProctorView } from '../../../shared/partner/protocol'

type UpcomingAdviceProps = {
  upcoming: ProctorView['upcoming'] // on the break: the next round and the advice to give
}

// The advice the proctor should give for the next round. Computed by the participant app from
// its own Options/ (the same advice the LLM would be told), so the proctor never works it out
export default function UpcomingAdvice(props: UpcomingAdviceProps): JSX.Element | null {
  // TODO:
  //   - null outside the break: render nothing
  //   - the next round: gainAmount, lossAmount, numberLossCards of totalCards
  //   - the advice, prominent: what to suggest (e.g. how many cards to turn over), from the
  //     Advice type (shared/types.ts)
  void props
  return (
    <section>
      <h2>Advice for the next round</h2>
      <p>TODO</p>
    </section>
  )
}
