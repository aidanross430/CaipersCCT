import type { JSX } from 'react'

type CodeEntryProps = {
  problem: string | null // why the last room ended, or null
  onConnect: (code: string) => Promise<void> // rejects with a message if the code is refused
}

// The first screen: the 6-character session code shown on the participant's Welcome page
export default function CodeEntry(props: CodeEntryProps): JSX.Element {
  // TODO:
  //   - one text field, upper-cased as typed, maxLength ROOM_CODE_LENGTH, autoFocus
  //   - Connect enabled once isRoomCode(value) (shared/partner/relay.ts)
  //   - on submit: await onConnect(code); on rejection show the error's message under the field
  //     (main's wording), and keep what was typed
  //   - problem (if any) shown above the field, e.g. why the participant's app refused
  //   Styles: reuse .welcome / .pid-field / .btn-primary from main.css, so it matches the
  //   participant app's Welcome page
  void props
  return (
    <main className="welcome">
      <h1>Proctor</h1>
      <p>TODO: session code entry</p>
    </main>
  )
}
