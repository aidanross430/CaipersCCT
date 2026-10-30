import { useEffect, useState } from 'react'
import type { PartnerStatus } from '../../../../shared/partner/link'

// The connection to the proctor, kept up to date. Null when this session has no human partner,
// or before main has answered.
// Asks once and then listens, because a status change pushed before this page subscribed is
// lost: main may already be waiting for the proctor by the time React mounts
export function usePartnerStatus(): PartnerStatus | null {
  const [status, setStatus] = useState<PartnerStatus | null>(null)

  useEffect(() => {
    // A push can land while the first ask is still pending; it's newer, so it wins
    let pushed = false
    const unsubscribe = window.api.onPartnerStatus((next) => {
      pushed = true
      setStatus(next)
    })
    window.api.getPartnerStatus().then((current) => {
      if (!pushed) setStatus(current)
    })
    return unsubscribe
  }, [])

  return status
}
