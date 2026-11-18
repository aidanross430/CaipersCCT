import type { JSX } from 'react'
import CodeEntry from './CodeEntry'
import SessionScreen from './SessionScreen'
import { useProctorLink } from './useProctorLink'

// The proctor client: code entry until a room is joined, then the live session.
// All connection logic is in main (main/proctor.ts); this only shows its state
export default function ProctorApp(): JSX.Element | null {
  const { state, view } = useProctorLink()
  if (!state) return null // main hasn't answered yet: a blank frame, not a flash of code entry

  if (state.connection === 'idle') {
    return <CodeEntry problem={state.problem} onConnect={window.proctorApi.connect} />
  }
  return (
    <SessionScreen
      code={state.code}
      status={state.status}
      view={view}
      onSend={window.proctorApi.send}
      onDisconnect={window.proctorApi.disconnect}
    />
  )
}
