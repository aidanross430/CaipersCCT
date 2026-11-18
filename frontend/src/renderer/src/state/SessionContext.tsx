import { createContext, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { RoundResponse, SessionData, ChatMessage } from '../../../shared/types'
import { sessionReducer, initialSession } from '../features/cct/session'
import { useOptions } from './optionsContext'
import { buildRoundConfigs } from '../features/cct/design'
import { buildView, type LiveTask } from '../features/partner/view'


// This file is responsible for handling data flow to the main process
// it should call the window.api.* endpoints to transfer each trial's
// number of cards selected, gain/loss, and eventually advice provided.

type SessionContextValue = {
    session: SessionData,
    startSession: (participantId: string) => void
    completeRound: (response: RoundResponse) => void
    finishSession: () => void
    completeBlock: () => void
    completeInterlude: () => void
    saveMessage: (message: ChatMessage) => void
    saveError: string | null    // message from the last failed save, or null if none failed
    setLiveTask: (live: LiveTask | null) => void  // Task reports its round, break and chat for the proctor view
}

const SessionContext = createContext<SessionContextValue | null>(null)

// Holds the state and wraps App
export function SessionProvider({ children }: {children: ReactNode}) {
    const [session, dispatch] = useReducer(sessionReducer, initialSession)
    const sessionIdRef = useRef<string | null>(null)
    const [saveError, setSaveError] = useState<string | null>(null)
    const options = useOptions()
    const [liveTask, setLiveTask] = useState<LiveTask | null>(null)

    // The proctor's view of the task, sent whole on every change. Published from here, not from
    // Task, so there's one publisher that keeps going on the pages Task isn't on (interlude,
    // complete). Main drops it when there's no human partner this session
    useEffect(() => {
        window.api.publishView(buildView(session, liveTask))
    }, [session, liveTask])

    // Action Definitions
    const startSession = async (participantId: string): Promise<void> => {
        const seed = crypto.getRandomValues(new Uint32Array(1))[0]
        const roundConfigs = buildRoundConfigs(options.design, seed)
        const now = new Date()
        const sessionStart = now.toISOString() // In UTC
        const localDate = now.toLocaleDateString('en-US')
        // The display condition comes from Chat.config.json, so it's set per computer/folder
        const trialConfig = {
            ...initialSession.trialConfig,
            designSeed: seed,
            perceivedPartner: options.chat.perceivedPartner,
            actualPartner: options.chat.actualPartner
        }

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
    const completeInterlude = (): void => {
        dispatch({ type: 'INTERLUDE_COMPLETE' })
    }
    const completeBlock = (): void => {
        dispatch({ type: 'BLOCK_COMPLETE' })
    }
    const saveMessage = (message: ChatMessage): void => {
        const id = sessionIdRef.current
        if (!id) return setSaveError('No active session, message not saved')
        window.api.saveMessage(id, message).catch((err: Error) => setSaveError(err.message))
    }

    return (
        <SessionContext.Provider value={{session, startSession, completeRound, finishSession, completeBlock, completeInterlude, saveMessage, saveError, setLiveTask}}>
            {children}
        </SessionContext.Provider>
    )
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession must be used inside <SessionProvider>')
  return context
}