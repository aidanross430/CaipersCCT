import Versions from './components/Versions'
import electronLogo from './assets/electron.svg'

// Logic Imports
import { Routes, HashRouter, Route, Navigate, useLocation } from 'react-router-dom'
import { SessionProvider, useSession } from './state/SessionContext'

// Page Imports
import WelcomePage from './pages/WelcomePage';
import Task from './pages/Task';

// The PhaseGuard prevents a participant from forcing themselves out of the current
// expected phase of the task
function PhaseGuard({ children }: { children: React.ReactNode }) {
  const { session } = useSession()
  const location = useLocation()
  const expected = phaseToPath[session.phase]
  // If the current location does not match the expected location, move to the expected
  // location
  if (location.pathname !== expected) return <Navigate to={expected} replace />
  return <>{children}</>
}

// phaseToPath converts the SessionProvider's current phase into url paths
const phaseToPath = {
  welcome: '/', setup: '/setup', instructions: '/instructions',
  practice: '/practice', task: '/task', complete: '/complete'
} as const


export default function App() {
  return(
    <SessionProvider>
      <HashRouter>
        <PhaseGuard>
          <Routes>
            <Route path='/' element={<WelcomePage/>} />
            <Route path='/task' element={<Task/>} />
          </Routes>
        </PhaseGuard>
      </HashRouter>
    </SessionProvider>
  )
}
