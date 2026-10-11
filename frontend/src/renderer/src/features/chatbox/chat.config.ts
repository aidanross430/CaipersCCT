import type { AdviceCondition } from '../../../../shared/types'

// How the chat partner is shown to the participant. Which one is used comes from
// trialConfig.chatDisplayCondition
export type Persona = {
    name: string
    avatar: string      // short text shown in the round avatar
}

export type ChatConfig = {
    riskyFlips: number,
    safeFlips: number,
    adviceCondition: AdviceCondition            // which advice policy the partner follows
    personas: Record<'human' | 'ai', Persona>
    greeting: string                            // first message shown in the chat
    readDelayMs: [number, number]               // "is typing..." appears after a random delay in this range, as if reading the message first
    typingDelayMs: [number, number]             // then the reply appears no sooner than a further random delay in this range
}

export const CHAT_CONFIG: ChatConfig = {
    riskyFlips: 7,
    safeFlips: 7,
    adviceCondition: 'risky',
    personas: {
        human: { name: 'Pat', avatar: 'P' },     // Alright to keep the same name across every trial?
        ai: { name: 'Claude Opus 5.5', avatar: 'AI' }
    },
    greeting: 'Feel free to ask the assistant for help!',
    readDelayMs: [600, 1500],
    typingDelayMs: [900, 1500]
}
