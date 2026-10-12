import { useEffect, useState, type JSX, type ReactNode } from 'react'
import type { Options } from '../../../shared/options'
import { OptionsContext } from './optionsContext'

// Asks the main process for the options once, and shows the app only when they've arrived.
// Main has already checked them before opening the window (and refuses to start if they're
// invalid), so the error screen here is only a fallback
export default function OptionsProvider({ children }: { children: ReactNode }): JSX.Element {
  const [options, setOptions] = useState<Options | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false // StrictMode runs this twice in development; ignore the first
    window.api.loadOptions().then(
      (loaded) => {
        if (!cancelled) setOptions(loaded)
      },
      (err: Error) => {
        if (!cancelled) setError(err.message)
      }
    )
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <main className="welcome">
        <h1>The task couldn&apos;t start</h1>
        <p>The settings in the Options folder couldn&apos;t be loaded. Please tell the research assistant.</p>
        <p>{error}</p>
      </main>
    )
  }
  if (!options) return <main className="welcome" aria-busy="true" />
  return <OptionsContext.Provider value={options}>{children}</OptionsContext.Provider>
}
