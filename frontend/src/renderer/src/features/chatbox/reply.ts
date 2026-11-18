import type { AdviceCondition, ChatMessage, RoundConfig, TrialConfig } from '../../../../shared/types'
import type { ChatRequest, ChatResult } from '../../../../shared/ipc'
import type { ChatConfig, Options, Persona } from '../../../../shared/options'
import { getAdvice } from './advice'
import { buildPrompt, type RoundProgress } from './prompt'

const REPLY_TIMEOUT_MS = 12_000 // the longest a participant waits on "..."

export type ReplyOutcome =
  | { kind: 'reply'; message: ChatMessage }
  | { kind: 'failed'; error: string }

export type ReplyDeps = {
  chatReply: (request: ChatRequest) => Promise<ChatResult>
  sleep: (ms: number) => Promise<void>        // passed in so tests can skip real waiting
}

export type ReplyInput = {
  round: RoundConfig                          // the round being played
  adviceCondition: AdviceCondition
  perceivedPartner: TrialConfig['perceivedPartner']
  actualPartner: TrialConfig['actualPartner']
  persona: Persona
  totalScoreBefore: number
  progress: RoundProgress                     // the round as it stood when the message was sent
  history: ChatMessage[]                      // includes the message just sent
  chat: ChatConfig                            // from Chat.config.json
  prompts: Options['prompts']                 // the templates from Options/
}

// The advice depends only on the round's settings, not on the cards turned so far, so it can't
// go out of date while waiting. Whether the participant is still in the round when the reply
// arrives is useChat's job
export async function requestPartnerReply(deps: ReplyDeps, input: ReplyInput): Promise<ReplyOutcome> {
  const advice = getAdvice(input.round, input.adviceCondition, input.chat)
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
      roundIndex: input.round.roundIndex,
      advice,
      source: 'llm'
      // + model, latencyMs, promptVersion: PROMPT_VERSION, tokens once ChatMessage has those fields
    }
  }
}

// This is the human-partner condition equivalent to the above requestPartnerReply
// This one handles human replies and the above method handles llm replies
export function toProctorMessage(
  text: string, round: RoundConfig, adviceCondition: AdviceCondition, chat: ChatConfig
): ChatMessage {
  return {
    sender: 'advice_giver',
    text,
    sentAt: new Date().toISOString(),
    roundIndex: round.roundIndex,
    // the advice for this round, so messages.csv has the same advice columns as the LLM path
    advice: getAdvice(round, adviceCondition, chat),
    source: 'student'
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
