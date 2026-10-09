import type { JSX } from 'react'
import { useSession } from '../state/SessionContext'

// Shown once every round is done, with the participant's final score
export default function CompletePage(): JSX.Element {
  const { session } = useSession()
  // Each response's trialScore is the running total (practice rounds excluded), so the
  // last one is the final score
  const finalScore = session.roundResponses.at(-1)?.trialScore ?? 0

  return (
    <main className="welcome">
      <h1>Thank you!</h1>
      <p className="final-score">Final score: {finalScore}</p>
      <p>
        You have finished playing the Card Game. Please let your research assistant know you are
        done.
      </p>
      <p>You may now close this window.</p>
    </main>
  )
}
