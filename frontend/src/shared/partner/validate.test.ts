import { describe, it, expect } from 'vitest'
import { parseToParticipant, parseToProctor } from './validate'
import { MAX_MESSAGE_LENGTH, type ProctorView } from './protocol'

// Most tests build a message as an object; the parsers take the JSON text a socket delivers
const send = (value: unknown): string => JSON.stringify(value)

describe('parseToParticipant', () => {
  it('accepts a well-formed handshake, chat and typing message', () => {
    expect(parseToParticipant(send({ type: 'handshake', version: 1, code: '4K8M2X' }))).toEqual({
      ok: true,
      message: { type: 'handshake', version: 1, code: '4K8M2X' }
    })
    expect(parseToParticipant(send({ type: 'chat', text: 'Try 5 flips' }))).toEqual({
      ok: true,
      message: { type: 'chat', text: 'Try 5 flips' }
    })
    expect(parseToParticipant(send({ type: 'typing', isTyping: true }))).toEqual({
      ok: true,
      message: { type: 'typing', isTyping: true }
    })
  })

  it('trims chat text', () => {
    expect(parseToParticipant(send({ type: 'chat', text: '  hi  ' }))).toEqual({
      ok: true,
      message: { type: 'chat', text: 'hi' }
    })
  })

  it('rejects text that is not JSON', () => {
    expect(parseToParticipant('{not json').ok).toBe(false)
  })

  it('rejects JSON that is not a message object', () => {
    expect(parseToParticipant(send([1, 2])).ok).toBe(false)
    expect(parseToParticipant(send(null)).ok).toBe(false)
    expect(parseToParticipant(send({ text: 'no type' })).ok).toBe(false)
  })

  it('rejects an unknown type', () => {
    expect(parseToParticipant(send({ type: 'view' }))).toEqual({
      ok: false,
      problem: 'unknown message type "view"'
    })
  })

  it('rejects unknown keys', () => {
    const result = parseToParticipant(send({ type: 'chat', text: 'hi', advice: 'risky' }))
    expect(result).toEqual({ ok: false, problem: '"chat" message has an unknown field "advice"' })
  })

  it('rejects a handshake whose version is not an integer', () => {
    expect(parseToParticipant(send({ type: 'handshake', version: '1', code: '4K8M2X' })).ok).toBe(
      false
    )
    expect(parseToParticipant(send({ type: 'handshake', version: 1.5, code: '4K8M2X' })).ok).toBe(
      false
    )
  })

  it('rejects a handshake whose code is not a room code', () => {
    expect(parseToParticipant(send({ type: 'handshake', version: 1, code: '4K8M2' })).ok).toBe(false) // too short
    expect(parseToParticipant(send({ type: 'handshake', version: 1, code: '4K8M2O' })).ok).toBe(false) // O not in alphabet
    expect(parseToParticipant(send({ type: 'handshake', version: 1, code: '4k8m2x' })).ok).toBe(false) // lower case
    expect(parseToParticipant(send({ type: 'handshake', version: 1, code: 482122 })).ok).toBe(false) // not text
  })

  it('rejects chat text that is missing or empty after trimming', () => {
    expect(parseToParticipant(send({ type: 'chat' })).ok).toBe(false)
    expect(parseToParticipant(send({ type: 'chat', text: '   ' })).ok).toBe(false)
  })

  it('rejects chat text longer than MAX_MESSAGE_LENGTH', () => {
    const atLimit = 'a'.repeat(MAX_MESSAGE_LENGTH)
    expect(parseToParticipant(send({ type: 'chat', text: atLimit })).ok).toBe(true)
    expect(parseToParticipant(send({ type: 'chat', text: atLimit + 'a' })).ok).toBe(false)
  })

  it('rejects a typing message whose isTyping is not a boolean', () => {
    expect(parseToParticipant(send({ type: 'typing', isTyping: 'yes' })).ok).toBe(false)
    expect(parseToParticipant(send({ type: 'typing' })).ok).toBe(false)
  })
})

describe('parseToProctor', () => {
  const view: ProctorView = {
    phase: 'task',
    block: 'advised',
    roundNumber: 3,
    totalRounds: 24,
    trialScore: -120,
    betweenRounds: true,
    round: null,
    upcoming: null,
    chat: []
  }

  it('accepts welcome, rejected and view messages', () => {
    expect(parseToProctor(send({ type: 'welcome' }))).toEqual({
      ok: true,
      message: { type: 'welcome' }
    })
    expect(parseToProctor(send({ type: 'rejected', reason: 'wrong code' }))).toEqual({
      ok: true,
      message: { type: 'rejected', reason: 'wrong code' }
    })
    expect(parseToProctor(send({ type: 'view', view }))).toEqual({
      ok: true,
      message: { type: 'view', view }
    })
  })

  it('rejects a view without the expected top-level fields', () => {
    // JSON drops undefined keys, so this sends a view with no chat at all
    expect(parseToProctor(send({ type: 'view', view: { ...view, chat: undefined } })).ok).toBe(
      false
    )
    expect(parseToProctor(send({ type: 'view', view: { ...view, phase: 'practice' } })).ok).toBe(
      false
    )
    expect(parseToProctor(send({ type: 'view', view: { ...view, roundNumber: '3' } })).ok).toBe(
      false
    )
    expect(parseToProctor(send({ type: 'view', view: { ...view, round: 'r1' } })).ok).toBe(false)
  })

  it('rejects a rejected message without a reason', () => {
    expect(parseToProctor(send({ type: 'rejected' })).ok).toBe(false)
  })
})
