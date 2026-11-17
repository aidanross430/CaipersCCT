// The messages sent between the participant app and the proctor page, for the human partner
// condition. Both transports (LAN host in main, or the external relay) carry exactly these
// messages as JSON, so nothing here may depend on which one is in use.
// Shared by main, the renderer and the proctor page, so no Node or DOM imports in this file.

import { CardFlip, RoundEndReason, Advice, Phase, Block, RoundConfig, ChatMessage } from '../types';

// PROTOCOL_VERSION
//   A number bumped whenever the shape of message data changes. This is verified
//   in the proctor-participent handshake when starting the task to make sure
//   everything worked.
export const PROTOCOL_VERSION = 3;

// Character limit on proctor messages to participant
export const MAX_MESSAGE_LENGTH = 256

// A trimmed version of the RoundConfig used only by the proctor view
export type PublicRoundConfig = Pick<RoundConfig,
    'roundIndex' | 'blockIndex' | 'gainAmount' | 'lossAmount' | 'numberLossCards' | 'totalCards'>

// LiveRound is a trimmed version of the roundState kept only in the renderer (from scoring.ts)
// contains only the information that the proctor needs to see to keep round state live
export type LiveRound = {
    config:PublicRoundConfig
    flips: CardFlip[]
    roundScore: number
    roundEnded: boolean
    endReason: RoundEndReason | null
}

// ProctorView
//   Everything the proctor page shows, sent whole on every change (see ToProctor). Roughly:
//     phase, block                           where the participant is in the task
//     roundNumber, totalRounds, trialScore   the header numbers
//     betweenRounds                          true on the break screen (the only time chat is open)
//     round: LiveRound | null                the round being played, or the one that just ended
//     upcoming: { round info, advice } | null
//                                            on the break: the next round and the Advice for it,
//                                            computed participant-side so the proctor page needs
//                                            no Options/ files
//     chat: ChatMessage[]                    this break's messages, so a reconnect redraws the chat
export type ProctorView = {
    phase: Phase
    block: Block
    roundNumber: number
    totalRounds: number
    trialScore: number
    betweenRounds: boolean  // True when the participant is in their between-round state
    round: LiveRound | null // contains the live info displayed during a round
    upcoming: { round: PublicRoundConfig, advice: Advice } | null // The important thing here is advice, as we want to give the same advice
                                            // that the LLM is told to provide
    chat: ChatMessage[] // The memory-only kept log of chat messages 
}

// ToProctor (participant -> proctor)
//   | { type: 'welcome' }                    pairing accepted
//   | { type: 'rejected'; reason }           wrong code, version mismatch, or a proctor already paired
//   | { type: 'view'; view: ProctorView }    the full current view; replaces whatever the page had
//   Chat messages travel inside the view, not as their own message, so the page never has to
//   merge events and can't get out of step
export type ToProctor =
    | { type: 'welcome' }
    | { type: 'rejected'; reason: string }
    | { type: 'view'; view: ProctorView }

// ToParticipant (proctor -> participant)
//   | { type: 'handshake'; version; code }       first message after connecting
//   | { type: 'chat'; text }                 just the text: the participant app builds the
//                                            ChatMessage (sentAt, roundIndex, advice) and saves it,
//                                            so the participant machine stays the only writer
//   | { type: 'typing'; isTyping: boolean }        drives the "is typing..." indicator
export type ToParticipant =
    | { type: 'handshake'; version: number; code: string }
    | { type: 'chat'; text: string }
    | { type: 'typing'; isTyping: boolean }