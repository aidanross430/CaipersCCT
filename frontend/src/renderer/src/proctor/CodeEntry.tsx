import { useState, type FormEvent, type JSX } from 'react'
import { ROOM_CODE_LENGTH, isRoomCode } from '../../../shared/partner/relay'

type CodeEntryProps = {
  problem: string | null // why the last room ended, or null
  onConnect: (code: string) => Promise<string | null> // null: connecting; otherwise why the code was refused
}

// The first screen: the 6-character session code shown on the participant's Welcome page
export default function CodeEntry({ problem, onConnect }: CodeEntryProps): JSX.Element {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault() // stop the form from reloading the page
    if (!isRoomCode(code) || busy) return
    setBusy(true)
    // On success main switches to the session screen, which replaces this one
    const refused = await onConnect(code)
    setBusy(false)
    setError(refused)
  }

  return (
    <main className="welcome">
      <h1>Proctor</h1>
      {problem && (
        <p className="proctor-notice" role="alert">
          The last session ended: {problem}
        </p>
      )}
      <p>
        Type the session code shown on the participant&apos;s screen. You&apos;ll stay connected for
        every participant until their app is closed.
      </p>

      <form className="actions" onSubmit={handleSubmit}>
        <label className="pid-field">
          Session code
          <input
            className="code-input"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/\s/g, ''))
              setError(null)
            }}
            maxLength={ROOM_CODE_LENGTH}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error !== null}
            aria-describedby={error ? 'code-error' : undefined}
          />
          {error && (
            <span className="field-error" id="code-error" role="alert">
              {error}
            </span>
          )}
        </label>
        <button className="btn-primary" type="submit" disabled={!isRoomCode(code) || busy}>
          Connect
        </button>
      </form>
    </main>
  )
}
