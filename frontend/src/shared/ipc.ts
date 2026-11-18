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

// ---------------------------------------------------------------------------------------
// Proctor mode (--mode=proctor): the proctor client's window and main. A separate preload
// (preload/proctor.ts) exposes only this API, so the proctor window can't reach the session,
// saving or LLM channels above. The relay link and its token stay in main (main/proctor.ts)
// ---------------------------------------------------------------------------------------

export const PROCTOR_IPC = {
    connect: 'proctor:connect',         // renderer -> main: join the room with this code
    disconnect: 'proctor:disconnect',   // renderer -> main: leave, back to code entry
    send: 'proctor:send',               // renderer -> main: chat / typing to the participant
    state: 'proctor:state',             // main -> renderer: ProctorState changes
    view: 'proctor:view',               // main -> renderer: each new ProctorView
    snapshot: 'proctor:snapshot'        // renderer asks once on load: the current state and view
} as const

// Where the proctor client is. The link's PartnerStatus alone can't say "no room joined", so
// main wraps it:
//   idle    no room joined: the window shows code entry, with why the last room ended (a
//           rejection, a wrong key, ...) or null on first launch and after Disconnect
//   joined  a link to this code exists; status is that link's PartnerStatus
//           (waiting = no participant paired yet, connected, disconnected = retrying)
export type ProctorState =
    | { connection: 'idle'; problem: string | null }
    | { connection: 'joined'; code: string; status: PartnerStatus }

export type ProctorSnapshot = { state: ProctorState; view: ProctorView | null }

export type ProctorApi = {
    connect: (code: string) => Promise<void>    // rejects if the code isn't a room code
    disconnect: () => void
    send: (message: PartnerMessage) => void     // dropped by the link unless connected
    onState: (cb: (state: ProctorState) => void) => () => void
    onView: (cb: (view: ProctorView) => void) => () => void
    getSnapshot: () => Promise<ProctorSnapshot>
}
