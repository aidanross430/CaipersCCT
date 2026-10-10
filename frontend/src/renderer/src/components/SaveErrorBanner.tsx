import type { JSX } from 'react'
import { useSession } from '../state/SessionContext'

// Shown at the top of every page when saving data fails. It can't be dismissed on purpose:
// a research assistant needs to see it, since rounds after a failure may not be saved either
export default function SaveErrorBanner(): JSX.Element | null {
  const { saveError } = useSession()
  if (!saveError) return null

  return (
    <div className="save-error" role="alert">
      <strong>Your responses could not be saved.</strong> Please tell the research assistant.
      <span className="save-error-detail">{saveError}</span>
    </div>
  )
}
