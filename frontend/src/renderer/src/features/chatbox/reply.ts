import type { AdviceCondition, ChatMessage, RoundConfig, TrialConfig } from '../../../../shared/types'
import type { ChatRequest, ChatResult } from '../../../../shared/ipc'
import type { ChatConfig, Options, Persona } from '../../../../shared/options'
import { getAdvice } from './advice'
import { buildPrompt } from './prompt'

const REPLY_TIMEOUT_MS = 12_000 // the longest a participant waits on "..."

export type ReplyOutcome =
  | { kind: 'reply'; message: ChatMessage }
  | { kind: 'failed'; error: string }

export type ReplyDeps = {
  chatReply: (request: ChatRequest) => Promise<ChatResult>
  sleep: (ms: number) => Promise<void>        // passed in so tests can skip real waiting
}

export type ReplyInput = {
  upcomingRound: RoundConfig                  // the round the break comes before
  adviceCondition: AdviceCondition
  displayCondition: TrialConfig['chatDisplayCondition']
  persona: Persona
  totalScoreBefore: number
  history: ChatMessage[]                      // includes the message just sent
  chat: ChatConfig                            // from Chat.config.json
  prompts: Options['prompts']                 // the templates from Options/
}

// The board can't change during a break, so one request is enough: the advice can't go out of
// date while waiting. Whether the break is still open when the reply arrives is useChat's job
export async function requestPartnerReply(deps: ReplyDeps, input: ReplyInput): Promise<ReplyOutcome> {
  const advice = getAdvice(input.upcomingRound, input.adviceCondition, input.chat)
  const request = buildPrompt({ ...input, advice, totalScore: input.totalScoreBefore })

  let result: ChatResult
  try {
    ;[result] = await Promise.all([
      withTimeout(deps.chatReply(request), REPLY_TIMEOUT_MS),
      deps.sleep(typingDelay(input.chat.typingDelayMs))
    ])
  } catch (err) {
    return { kind: 'failed', error: (err as Error).message }
  }

  // TODO: checkReply(result.text, advice) once replyCheck.ts exists → { kind: 'failed', ... }
  return {
    kind: 'reply',
    message: {
      sender: 'advice_giver',
      text: result.text,
      sentAt: new Date().toISOString(),
      roundIndex: input.upcomingRound.roundIndex,
      advice,
      source: 'llm'
      // + model, latencyMs, promptVersion: PROMPT_VERSION, tokens once ChatMessage has those fields
    }
  }
}

function typingDelay([min, max]: [number, number]): number {
  return min + Math.random() * (max - min)
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Reply timed out')), ms))
  ])
}
