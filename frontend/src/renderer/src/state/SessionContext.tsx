import { createContext, useContext, useReducer, type ReactNode } from 'react'
import { RoundResponse, SessionData } from '../../../shared/types'
import { sessionReducer, initialSession } from '../features/cct/session'

// This file is responsible for handling data flow to the main process
// it should call the window.api.* endpoints to transfer each trial's
// number of cards selected, gain/loss, and eventually advice provided.

type SessionContextValue = {
    session: SessionData,
    startSession: (participantId: string) => void
    completeRound: (response: RoundResponse) => void
    finishSession: () => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

// Holds the state and wraps App
export function SessionProvider({ children }: {children: ReactNode}) {
    const [session, dispatch] = useReducer(sessionReducer, initialSession)

    // Action Definitions
    const startSession = (participantId: string): void => {
        const seed = crypto.getRandomValues(new Uint32Array(1))[0]
        const now = new Date()
        const startedAt = now.toISOString() // In UTC
        const localDate = now.toLocaleDateString('en-US')
        dispatch({type: 'START', participantId, seed, startedAt, localDate})
    }
    const completeRound = (response: RoundResponse): void => {
        dispatch({ type: 'ROUND_COMPLETE', response})
        // window.api.saveRound endpoint or whatever I call it
    }
    const finishSession = (): void => {
        dispatch({ type: 'FINISH'})
    }

    return (
        <SessionContext.Provider value={{session, startSession, completeRound, finishSession}}>
            {children}
        </SessionContext.Provider>
    )
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession must be used inside <SessionProvider>')
  return context
}