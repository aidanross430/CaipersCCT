import type { AdviceCondition, ChatMessage, TrialConfig } from '../../../../shared/types'
import type { ChatRequest, ChatResult } from '../../../../shared/ipc'
import type { RoundState } from '../cct/scoring'
import type { ChatConfig, Options, Persona } from '../../../../shared/options'
import { getAdvice } from './advice'
import { buildPrompt } from './prompt'

const REPLY_TIMEOUT_MS = 12_000 // the longest a participant waits on "..."

export type ReplyOutcome =
  | { kind: 'reply'; message: ChatMessage }
  | { kind: 'discard' }                       // the round ended or moved on while waiting
  | { kind: 'failed'; error: string }

export type ReplyDeps = {
  chatReply: (request: ChatRequest) => Promise<ChatResult>
  getRound: () => RoundState | null           // the round as it is right now
  sleep: (ms: number) => Promise<void>        // passed in so tests can skip real waiting
}

export type ReplyInput = {
  adviceCondition: AdviceCondition
  displayCondition: TrialConfig['chatDisplayCondition']
  persona: Persona
  totalScoreBefore: number
  history: ChatMessage[]                      // includes the message just sent
  chat: ChatConfig                            // from Chat.config.json
  prompts: Options['prompts']                 // the templates from Options/
}

export async function requestPartnerReply(deps: ReplyDeps, input: ReplyInput): Promise<ReplyOutcome> {
  const startRound = deps.getRound()
  if (!startRound || startRound.roundEnded) return { kind: 'discard' }

  // At most two attempts: the second only if cards were flipped while waiting on the first
  let round = startRound
  for (let attempt = 0; attempt < 2; attempt++) {
    const advice = getAdvice(round, input.adviceCondition, input.chat)
    const request = buildPrompt({ ...input, advice, round, totalScore: input.totalScoreBefore })

    let result: ChatResult
    try {
      ;[result] = await Promise.all([
        withTimeout(deps.chatReply(request), REPLY_TIMEOUT_MS),
        attempt === 0 ? deps.sleep(typingDelay(input.chat.typingDelayMs)) : Promise.resolve()   // only the first attempt "types"
      ])
    } catch (err) {
      return { kind: 'failed', error: (err as Error).message }
    }

    // Compare with the board as it is now
    const now = deps.getRound()
    if (!now || now.roundEnded || now.config.roundIndex !== round.config.roundIndex) return { kind: 'discard' }
    if (now.flips.length !== round.flips.length) {
      round = now        // advice is out of date: ask again with the current board
      continue
    }

    // TODO: checkReply(result.text, advice) once replyCheck.ts exists → { kind: 'failed', ... }
    return {
      kind: 'reply',
      message: {
        sender: 'advice_giver',
        text: result.text,
        sentAt: new Date().toISOString(),
        roundIndex: round.config.roundIndex,
        flipsSoFar: advice.flipsSoFar,
        advice,
        source: 'llm'
        // + model, latencyMs, promptVersion: PROMPT_VERSION, tokens once ChatMessage has those fields
      }
    }
  }
  return { kind: 'failed', error: 'Cards kept changing while waiting for a reply' }
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
