import type { JSX } from 'react'

// Shown once every round is done. No score is shown yet (an open question from the mockup)
export default function CompletePage(): JSX.Element {
  return (
    <main className="welcome">
      <h1>Thank you!</h1>
      <p>
        You have finished playing the Card Game. Please let your research assistant know you are
        done.
      </p>
      <p>You may now close this window.</p>
    </main>
  )
}
