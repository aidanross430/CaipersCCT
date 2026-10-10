// Exposes the inter process communication channels for sending
// task info between the frontend renderer and backend main process
import { RoundResponse, SessionData } from "./types"


export const IPC = {
    sessionStart: 'session:start',
    roundFinish: 'session:round',
    sessionFinish: 'session:finish'
} as const

// What data is exported at the beginning of the game?
export type SessionStartPayload = Pick<SessionData,
    'participantId' | 'trialConfig' | 'roundConfigs' | 'sessionStart' | 'localDate'>

export type CctApi = {
    startSession: (payload: SessionStartPayload) => Promise<string>             //return SessionId
    saveRound: (sessionId: string, response:RoundResponse) => Promise<void>
    terminateSession: (sessionId: string) => Promise<void>
}