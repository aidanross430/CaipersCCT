import { useEffect, useState } from 'react'
import type { ProctorState } from '../../../shared/ipc'
import type { ProctorView } from '../../../shared/partner/protocol'

// The proctor client's connection state and the participant's latest view, kept up to date
// from main (main/proctor.ts). Null until main has answered the first ask.
// Asks once and then listens, like usePartnerStatus: a push can land before this mounts
export function useProctorLink(): { state: ProctorState | null; view: ProctorView | null } {
  const [state, setState] = useState<ProctorState | null>(null)
  const [view, setView] = useState<ProctorView | null>(null)

  useEffect(() => {
    // A push can land while the first ask is still pending; it's newer, so it wins
    let pushedState = false
    let pushedView = false
    const offState = window.proctorApi.onState((next) => {
      pushedState = true
      setState(next)
      // Back at code entry: the old room's view no longer applies
      if (next.connection === 'idle') setView(null)
    })
    const offView = window.proctorApi.onView((next) => {
      pushedView = true
      setView(next)
    })
    window.proctorApi.getSnapshot().then((snapshot) => {
      if (!pushedState) setState(snapshot.state)
      if (!pushedView) setView(snapshot.view)
    })
    return () => {
      offState()
      offView()
    }
  }, [])

  return { state, view }
}
