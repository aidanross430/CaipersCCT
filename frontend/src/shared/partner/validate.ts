// Runtime checks for messages arriving over the network. The types in protocol.ts are only
// compile-time promises: anything read off a socket is `unknown` until it passes through here.
// Same approach as main/options.ts: hand-written checks, no schema library.
import type { Block, Phase } from '../types'
import {
  MAX_MESSAGE_LENGTH,
  type ProctorView,
  type ToParticipant,
  type ToProctor
} from './protocol'
import { fail, isInt, isObject, ok, parseMessage, show, unknownKey, type ParseResult } from '../check'

// Used by the participant side (main) on everything the proctor sends. Each accepted message
// is rebuilt field by field, so nothing unchecked can ride along into saved data
export function parseToParticipant(raw: string): ParseResult<ToParticipant> {
  const parsed = parseMessage(raw)
  if (!parsed.ok) return parsed
  const msg = parsed.message

  switch (msg.type) {
    case 'handshake': {
      const extra = unknownKey(msg, ['type', 'version', 'code'])
      if (extra) return fail(extra)
      // Only the shape is checked here: whether the version and code are the right ones is the
      // host's call, so it can answer with a 'rejected' that says why
      if (!isInt(msg.version))
        return fail(`handshake version must be a whole number (got ${show(msg.version)})`)
      if (typeof msg.code !== 'string' || !/^\d+$/.test(msg.code)) {
        return fail(`handshake code must be digits (got ${show(msg.code)})`)
      }
      return ok({ type: 'handshake', version: msg.version, code: msg.code })
    }
    case 'chat': {
      const extra = unknownKey(msg, ['type', 'text'])
      if (extra) return fail(extra)
      if (typeof msg.text !== 'string')
        return fail(`chat text must be text (got ${show(msg.text)})`)
      // Trimmed here so the saved text and the length limit both see what the participant sees
      const text = msg.text.trim()
      if (text === '') return fail('chat text is empty')
      if (text.length > MAX_MESSAGE_LENGTH) {
        return fail(`chat text is ${text.length} characters (limit ${MAX_MESSAGE_LENGTH})`)
      }
      return ok({ type: 'chat', text })
    }
    case 'typing': {
      const extra = unknownKey(msg, ['type', 'isTyping'])
      if (extra) return fail(extra)
      if (typeof msg.isTyping !== 'boolean')
        return fail(`typing isTyping must be true or false (got ${show(msg.isTyping)})`)
      return ok({ type: 'typing', isTyping: msg.isTyping })
    }
    default:
      return fail(`unknown message type ${show(msg.type)}`)
  }
}

// Used by the proctor page on everything the participant sends. The participant app is ours,
// so this mainly catches the two builds being out of step: it checks the top-level shape of a
// 'view', not every field of every flip or chat message
export function parseToProctor(raw: string): ParseResult<ToProctor> {
  const parsed = parseMessage(raw)
  if (!parsed.ok) return parsed
  const msg = parsed.message

  switch (msg.type) {
    case 'welcome':
      return ok({ type: 'welcome' })
    case 'rejected':
      if (typeof msg.reason !== 'string')
        return fail(`rejected reason must be text (got ${show(msg.reason)})`)
      return ok({ type: 'rejected', reason: msg.reason })
    case 'view': {
      const problem = viewProblem(msg.view)
      if (problem) return fail(problem)
      // Checked only as deep as viewProblem goes (see above)
      return ok({ type: 'view', view: msg.view as ProctorView })
    }
    default:
      return fail(`unknown message type ${show(msg.type)}`)
  }
}

// Typed as Record<Phase, true> so adding a phase without listing it here is a compile error
const PHASES = { welcome: true, task: true, complete: true, interlude: true } satisfies Record<
  Phase,
  true
>
const BLOCKS = { solo: true, advised: true } satisfies Record<Block, true>

function viewProblem(view: unknown): string | null {
  if (!isObject(view)) return `view must be an object (got ${show(view)})`
  if (typeof view.phase !== 'string' || !(view.phase in PHASES))
    return `view.phase is not a known phase (got ${show(view.phase)})`
  if (typeof view.block !== 'string' || !(view.block in BLOCKS))
    return `view.block is not a known block (got ${show(view.block)})`
  for (const key of ['roundNumber', 'totalRounds', 'trialScore']) {
    if (!isInt(view[key])) return `view.${key} must be a whole number (got ${show(view[key])})`
  }
  if (typeof view.betweenRounds !== 'boolean')
    return `view.betweenRounds must be true or false (got ${show(view.betweenRounds)})`
  if (view.round !== null && !isObject(view.round))
    return `view.round must be an object or null (got ${show(view.round)})`
  if (view.upcoming !== null && !isObject(view.upcoming))
    return `view.upcoming must be an object or null (got ${show(view.upcoming)})`
  if (!Array.isArray(view.chat)) return `view.chat must be a list (got ${show(view.chat)})`
  return null
}
