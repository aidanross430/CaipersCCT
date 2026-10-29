// Holds the reducer for the chatbox

import type { ChatMessage } from '../../../../shared/types'

// pendingReplies counts replies the partner still owes. A count rather than a true/false
// flag, so two quick messages in a row keep "typing..." showing until both are answered
// lastSendRound is the round the participant last sent a message in. The pending replies and
// any error always belong to that message (older requests are cancelled, not failed), so
// useChat uses it to hide "..." and the error once a new round starts
export type ChatState = {
    messages: ChatMessage[];
    pendingReplies: number;
    error: string | null;
    lastSendRound: number | null;
    typingVisible: boolean;     // "is typing..." is showing (it appears after the read delay)
}

export type ChatAction =
    | { type: 'SEND'; message: ChatMessage }    // participant sends a message
    | { type: 'REPLY'; message: ChatMessage }   // partner responds to the message
    | { type: 'CANCEL_REPLY' }                  // drop a reply that's out of date or arrived after the break
    | { type: 'REPLY_FAILED'; error: string }   // If the LLM fails to send a response
    | { type: 'TYPING_START' }                  // the read delay is over: show "is typing..."

export const initialChatState: ChatState = { messages: [], pendingReplies: 0, error: null, lastSendRound: null, typingVisible: false }

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
    const next = reduce(state, action)
    // "is typing..." goes away once the partner owes no more replies
    return next.pendingReplies === 0 && next.typingVisible ? { ...next, typingVisible: false } : next
}

function reduce(state: ChatState, action: ChatAction): ChatState {
    switch (action.type) {
        case 'SEND':
            return {
                messages: [...state.messages, action.message],
                pendingReplies: state.pendingReplies + 1,
                error: null,
                lastSendRound: action.message.roundIndex,
                // a new message is "read" before typing (re)starts, even if typing was showing
                typingVisible: false
            }
        case 'REPLY':
            return {
                ...state,
                messages: [...state.messages, action.message],
                pendingReplies: Math.max(state.pendingReplies - 1, 0),
                error: null
            }
        case 'CANCEL_REPLY':
            return { ...state, pendingReplies: Math.max(state.pendingReplies - 1, 0) }
        case 'REPLY_FAILED':
            return { ...state, pendingReplies: Math.max(state.pendingReplies - 1, 0), error: action.error }
        case 'TYPING_START':
            // ignored if every reply already arrived before the read delay ended
            return state.pendingReplies > 0 ? { ...state, typingVisible: true } : state
    }
}
