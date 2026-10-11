import { createContext, useContext, useReducer, useRef, useState, type ReactNode } from 'react'
import { RoundResponse, SessionData, ChatMessage } from '../../../shared/types'
import { sessionReducer, initialSession } from '../features/cct/session'
import { DEFAULT_DESIGN } from '../features/cct/design.config'
import { buildRoundConfigs } from '../features/cct/design'


// This file is responsible for handling data flow to the main process
// it should call the window.api.* endpoints to transfer each trial's
// number of cards selected, gain/loss, and eventually advice provided.

type SessionContextValue = {
    session: SessionData,
    startSession: (participantId: string) => void
    completeRound: (response: RoundResponse) => void
    finishSession: () => void
    saveMessage: (message: ChatMessage) => void
    saveError: string | null    // message from the last failed save, or null if none failed
}

const SessionContext = createContext<SessionContextValue | null>(null)

// Holds the state and wraps App
export function SessionProvider({ children }: {children: ReactNode}) {
    const [session, dispatch] = useReducer(sessionReducer, initialSession)
    const sessionIdRef = useRef<string | null>(null)
    const [saveError, setSaveError] = useState<string | null>(null)

    // Action Definitions
    const startSession = async (participantId: string): Promise<void> => {
        const seed = crypto.getRandomValues(new Uint32Array(1))[0]
        const roundConfigs = buildRoundConfigs(DEFAULT_DESIGN, seed)
        const now = new Date()
        const sessionStart = now.toISOString() // In UTC
        const localDate = now.toLocaleDateString('en-US')
        const trialConfig = { ...initialSession.trialConfig, designSeed: seed}

        try {
            sessionIdRef.current = await window.api.startSession({
                participantId, trialConfig, roundConfigs, sessionStart, localDate
            })
        dispatch({type: 'START', participantId, trialConfig, roundConfigs, sessionStart, localDate})
        } catch (err) {
            setSaveError((err as Error).message)
        }
        
    }
    const completeRound = (response: RoundResponse): void => {
        dispatch({ type: 'ROUND_COMPLETE', response})
        const id = sessionIdRef.current
        if (!id) {
            setSaveError('No active session, round not saved')
            return
        }
        window.api.saveRound(id, response).catch((err) => setSaveError(err.message))
    }
    const finishSession = (): void => {
        dispatch({ type: 'FINISH'})
        const id = sessionIdRef.current
        if (!id) {
            setSaveError('No active session, results file could not be written')
            return
        }
        window.api.terminateSession(id).catch((err) => setSaveError(err.message))
    }
    const saveMessage = (message: ChatMessage): void => {
        const id = sessionIdRef.current
        if (!id) return setSaveError('No active session, message not saved')
        window.api.saveMessage(id, message).catch((err: Error) => setSaveError(err.message))
    }

    return (
        <SessionContext.Provider value={{session, startSession, completeRound, finishSession, saveMessage, saveError}}>
            {children}
        </SessionContext.Provider>
    )
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession must be used inside <SessionProvider>')
  return context
}