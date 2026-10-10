import type { JSX, ReactNode } from 'react'
import type { Phase } from '../../shared/types'

// Logic Imports
import { Routes, HashRouter, Route, Navigate, useLocation } from 'react-router-dom'
import { SessionProvider, useSession } from './state/SessionContext'

// Page Imports
import WelcomePage from './pages/WelcomePage'
import Task from './pages/Task'
import CompletePage from './pages/CompletePage'
import SaveErrorBanner from './components/SaveErrorBanner'

// phaseToPath converts the SessionProvider's current phase into url paths.
// Typed as Record<Phase, string> so adding a phase without a path is a compile error
const phaseToPath: Record<Phase, string> = {
  welcome: '/',
  task: '/task',
  complete: '/complete'
}

// The PhaseGuard prevents a participant from forcing themselves out of the current
// expected phase of the task
function PhaseGuard({ children }: { children: ReactNode }): JSX.Element {
  const { session } = useSession()
  const location = useLocation()
  const expected = phaseToPath[session.phase]
  // If the current location does not match the expected location, move to the expected
  // location
  if (location.pathname !== expected) return <Navigate to={expected} replace />
  return <>{children}</>
}

export default function App(): JSX.Element {
  return (
    <SessionProvider>
      {/* Outside the router so it stays visible on every page */}
      <SaveErrorBanner />
      <HashRouter>
        <PhaseGuard>
          <Routes>
            <Route path="/" element={<WelcomePage />} />
            <Route path="/task" element={<Task />} />
            <Route path="/complete" element={<CompletePage />} />
          </Routes>
        </PhaseGuard>
      </HashRouter>
    </SessionProvider>
  )
}
