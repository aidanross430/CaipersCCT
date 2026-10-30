// Exposes the inter process communication channels for sending
// task info between the frontend renderer and backend main process
import { RoundResponse, SessionData } from "./types"
import type { ChatMessage } from "./types"
import type { Options } from "./options"
import type { ToParticipant, ProctorView } from "./partner/protocol"
import type { PartnerStatus } from "./partner/link"

export const IPC = {
    sessionStart: 'session:start',
    roundFinish: 'session:round',
    sessionFinish: 'session:finish',
    chatReply: 'chat:reply',        // ask the llm for a response
    messageSave: 'chat:save',     //saves chat responses to disk
    optionsLoad: 'options:load',   // the Options/ folder, loaded and checked by main at startup
    partnerPublish: 'partner:publish',     // renderer -> main: the current ProctorView
    partnerMessage: 'partner:message',     // main -> renderer: chat / typing from the proctor
    partnerStatus: 'partner:status',       // main -> renderer: status changes
    partnerStatusGet: 'partner:status:get' // renderer asks for the current status once, on load
} as const

// The handshake is handled in main, so the renderer only ever sees these
export type PartnerMessage = Exclude<ToParticipant, { type: 'handshake' }>

// What data is exported at the beginning of the game?
export type SessionStartPayload = Pick<SessionData,
    'participantId' | 'trialConfig' | 'roundConfigs' | 'sessionStart' | 'localDate'>

export type ChatTurn = { role: 'user' | 'assistant'; content: string }
export type ChatRequest = { system: string; messages: ChatTurn[] }

// What main sends back: the text plus what's needed for logging
export type ChatResult = {
  text: string
  model: string                   // the model that actually answered ex: opus-5.5
  latencyMs: number
  inputTokens: number
  outputTokens: number
}


export type CctApi = {
    startSession: (payload: SessionStartPayload) => Promise<string>             //return SessionId
    saveRound: (sessionId: string, response:RoundResponse) => Promise<void>
    terminateSession: (sessionId: string) => Promise<void>
    chatReply: (request: ChatRequest) => Promise<ChatResult>
    saveMessage: (sessionId: string, message: ChatMessage) => Promise<void>
    loadOptions: () => Promise<Options>
    publishView: (view: ProctorView) => void
    onPartnerMessage: (cb: (message: PartnerMessage) => void) => () => void
    onPartnerStatus: (cb: (status: PartnerStatus) => void) => () => void
    getPartnerStatus: () => Promise<PartnerStatus | null>  // null when there's no human partner this session
}