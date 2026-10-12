import type { AdviceCondition, TrialConfig } from "./types"

// Holds all of the options imported from files to run the test.
export type Options = {
  design: DesignConfig
  chat: ChatConfig
  prompts: { identityHuman: string; identityAi: string; style: string; rules: string; situation: string }
}

// The files in the Options/ folder. Shared so the loader (main) and anything that reports
// on options agree on the names
export const CONFIG_FILES = {
  design: 'Design.config.json',
  chat: 'Chat.config.json'
} as const

export const PROMPT_FILES = {
  identityHuman: 'identity-human.md',
  identityAi: 'identity-ai.md',
  style: 'style.md',
  rules: 'rules.md',
  situation: 'situation.md'
} as const satisfies Record<keyof Options['prompts'], string>

// The {{placeholders}} prompt templates may use. prompt.ts fills exactly these (its values
// object is typed against this list), and the loader rejects templates using any other name,
// so a typo in a template stops the app at startup instead of failing mid-session
export const PROMPT_PLACEHOLDERS = [
  'partnerName',
  'roundNumber',
  'gainAmount',
  'lossAmount',
  'numberLossCards',
  'totalCards',
  'flipsSoFar',
  'roundScore',
  'totalScore',
  'suggestedTotalFlips',
  'adviceText'
] as const
export type PromptPlaceholder = (typeof PROMPT_PLACEHOLDERS)[number]

// Every advice condition, for checking Chat.config.json at runtime
export const ADVICE_CONDITIONS = ['risky', 'optimal', 'safe'] as const satisfies readonly AdviceCondition[]

// Every display condition: whether participants are told they are chatting with a person or an AI
export const DISPLAY_CONDITIONS = ['human', 'ai'] as const satisfies readonly TrialConfig['chatDisplayCondition'][]

// The configuration across the entire trial
export type DesignConfig = {
  totalCards: number                 // 32
  numRounds: number
  gainAmounts: number[]              // e.g. [10, 20, 30] 
  lossAmounts: number[]              // e.g. [250, 500, 750]
  lossCardCounts: number[]           // e.g. [1, 2, 3]
  repititionsPerCondition: number
  // practiceRounds: Omit<RoundConfig, 'roundIndex'>[]   // listed explicitly, not generated
  rigging: {
    roundsRigged: number             
  }
}


// How the chat partner is shown to the participant. Which one is used comes from
// trialConfig.chatDisplayCondition
export type Persona = {
    name: string
    avatar: string      // short text shown in the round avatar
}

// The options for the chat feature
export type ChatConfig = {
    riskyFlips: number,
    safeFlips: number,
    adviceCondition: AdviceCondition            // which advice policy the partner follows
    displayCondition: TrialConfig['chatDisplayCondition']  // "human" or "ai": who participants are told they're chatting with
    personas: Record<'human' | 'ai', Persona>
    greeting: string                            // first message shown in the chat
    readDelayMs: [number, number]               // "is typing..." appears after a random delay in this range, as if reading the message first
    typingDelayMs: [number, number]             // then the reply appears no sooner than a further random delay in this range
}
