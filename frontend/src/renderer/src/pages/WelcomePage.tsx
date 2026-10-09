import { useState, type FormEvent, type JSX } from 'react'
import { useSession } from '../state/SessionContext'

// Instructions for the hot CCT, plus the participant ID field that starts the session
export default function WelcomePage(): JSX.Element {
  const { startSession } = useSession()
  const [participantId, setParticipantId] = useState('')
  const trimmedId = participantId.trim()

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault() // stop the form from reloading the page
    if (trimmedId) startSession(trimmedId)
  }

  return (
    <main className="welcome">
      <h1>Card Game</h1>
      <p>
        In this game, you will be shown a set of 32 face-down cards. You will turn the cards over
        one at a time by clicking on them. Your goal is to have as many points as possible by the
        end of the game. There are a few rules to keep in mind:
      </p>
      <ol>
        <li>
          Most cards are gain cards. Each gain card you turn over adds points to your score for the
          round. The number of points for each gain card is listed at the top of your screen.
        </li>
        <li>
          Some cards are loss cards. If you turn over a loss card, the points listed at the top of
          your screen are taken away from your score, and the round ends right away.
        </li>
        <li>
          You can stop turning over cards at any time by clicking &quot;Stop and keep points.&quot;
          You keep the points you have earned in that round.
        </li>
      </ol>
      <p>
        The number of loss cards and the points for each card change from round to round. Decide
        how many cards to turn over based on how much each card is worth, how likely you are to
        turn over a loss card, and how many points a loss card will take away.
      </p>

      <form className="actions" onSubmit={handleSubmit}>
        <label className="pid-field">
          Participant ID
          <input
            value={participantId}
            onChange={(e) => setParticipantId(e.target.value)}
            autoFocus
            autoComplete="off"
          />
        </label>
        <button className="btn-primary" type="submit" disabled={!trimmedId}>
          Begin
        </button>
      </form>
    </main>
  )
}
