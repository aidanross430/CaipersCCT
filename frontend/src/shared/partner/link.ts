// The one interface both ends talk through, whatever carries the messages underneath.
// Implementations (later steps):
//   main/partner/lanHost.ts      participant side, LAN: ws server        (step 3)
//   main/partner/relayClient.ts  participant side, relay: ws client      (step 6, only if needed)
//   proctor/browserLink.ts       proctor side, both: browser WebSocket   (step 4)
// Code above this interface (useChat, the proctor UI) never knows which one it has.
// Shared, so no Node or DOM types here: implementations wrap their own socket types.

// TODO: PartnerStatus
//   | { state: 'waiting'; join: { url: string; code: string } }   listening/connected to the relay,
//                                                                  no partner yet; join is what
//                                                                  the participant screen shows
//   | { state: 'connected' }
//   | { state: 'disconnected'; reason: string }                    the partner dropped; the link
//                                                                  keeps trying (or keeps listening)

// TODO: PartnerLink<Out, In>
//   send(message: Out): void            silently dropped while not connected: the next 'view'
//                                       brings the other side up to date anyway
//   onMessage(cb: (message: In) => void): () => void      returns an unsubscribe function
//   onStatus(cb: (status: PartnerStatus) => void): () => void
//   close(): void
//   Messages handed to onMessage have already passed validate.ts; the link drops (and reports)
//   anything that doesn't

// TODO: aliases for the two directions
//   ParticipantLink = PartnerLink<ToProctor, ToParticipant>
//   ProctorLink     = PartnerLink<ToParticipant, ToProctor>

// TODO: heartbeat timing constants
//   e.g. ping every 10s, treat 2 missed pongs as disconnected. Kept here so every
//   implementation agrees

import type { ToParticipant, ToProctor } from './protocol'

export type PartnerStatus =
  | { state: 'waiting'; join: { url: string; code: string } } // no partner yet; join is what the participant screen shows
  | { state: 'connected' }                                     // paired and passing messages
  | { state: 'disconnected'; reason: string }                  // partner dropped; the link keeps trying or listening

export type PartnerLink<Out, In> = {
  send: (message: Out) => void
  onMessage: (cb: (message: In) => void) => () => void          // returns unsubscribe
  onStatus: (cb: (status: PartnerStatus) => void) => () => void
  close: () => void
}

export type ParticipantLink = PartnerLink<ToProctor, ToParticipant>
export type ProctorLink = PartnerLink<ToParticipant, ToProctor>

// The heartbeat is a kind of ping/pong connection that tries to keep 
// WS connection open during idling
export const HEARTBEAT_INTERVAL_MS = 10_000
export const MISSED_HEARTBEATS_BEFORE_DISCONNECT = 2
