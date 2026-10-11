import { describe, it, expect } from 'vitest'
import type { ChatMessage, RoundConfig } from '../../../../shared/types'
import { chatReducer, initialChatState, partnerReply } from './conversation'
import { startRound, flipCard } from '../cct/scoring'

const msg = (text: string, sender: ChatMessage['sender'] = 'participant'): ChatMessage => ({
  sender,
  text,
  sentAt: '2026-10-10T12:00:00.000Z',
  roundIndex: 0,
  flipsSoFar: 0
})

describe('chatReducer', () => {
  it('SEND adds the message and waits for one reply', () => {
    const s = chatReducer(initialChatState, { type: 'SEND', message: msg('hi') })
    expect(s.messages.map((m) => m.text)).toEqual(['hi'])
    expect(s.pendingReplies).toBe(1)
  })

  it('REPLY adds the message and clears one pending reply', () => {
    let s = chatReducer(initialChatState, { type: 'SEND', message: msg('hi') })
    s = chatReducer(s, { type: 'REPLY', message: msg('hello', 'advice_giver') })
    expect(s.messages.map((m) => m.text)).toEqual(['hi', 'hello'])
    expect(s.pendingReplies).toBe(0)
  })

  it('keeps waiting while a second quick message is still unanswered', () => {
    let s = chatReducer(initialChatState, { type: 'SEND', message: msg('a') })
    s = chatReducer(s, { type: 'SEND', message: msg('b') })
    s = chatReducer(s, { type: 'REPLY', message: msg('re a', 'advice_giver') })
    expect(s.pendingReplies).toBe(1)
  })

  it('CANCEL_REPLY clears a pending reply without adding a message', () => {
    let s = chatReducer(initialChatState, { type: 'SEND', message: msg('hi') })
    s = chatReducer(s, { type: 'CANCEL_REPLY' })
    expect(s.messages).toHaveLength(1)
    expect(s.pendingReplies).toBe(0)
  })

  it('REPLY_FAILED clears the pending reply and records the error', () => {
    let s = chatReducer(initialChatState, { type: 'SEND', message: msg('hi') })
    s = chatReducer(s, { type: 'REPLY_FAILED', error: 'Reply timed out' })
    expect(s.pendingReplies).toBe(0)
    expect(s.error).toBe('Reply timed out')
    expect(s.messages).toHaveLength(1) // no bubble added for the failure
  })

  it('sending again clears an earlier error', () => {
    let s = chatReducer(initialChatState, { type: 'SEND', message: msg('hi') })
    s = chatReducer(s, { type: 'REPLY_FAILED', error: 'Reply timed out' })
    s = chatReducer(s, { type: 'SEND', message: msg('hello?') })
    expect(s.error).toBeNull()
  })

  it('a successful reply clears an earlier error', () => {
    let s = chatReducer(initialChatState, { type: 'SEND', message: msg('a') })
    s = chatReducer(s, { type: 'SEND', message: msg('b') })
    s = chatReducer(s, { type: 'REPLY_FAILED', error: 'x' })
    s = chatReducer(s, { type: 'REPLY', message: msg('re', 'advice_giver') })
    expect(s.error).toBeNull()
  })

  it('SEND records the round the message was sent in', () => {
    const s = chatReducer(initialChatState, { type: 'SEND', message: { ...msg('hi'), roundIndex: 4 } })
    expect(s.lastSendRound).toBe(4)
    // a reply doesn't change it
    expect(chatReducer(s, { type: 'REPLY', message: msg('re', 'advice_giver') }).lastSendRound).toBe(4)
  })

  it('"is typing" shows only after TYPING_START, and only while a reply is owed', () => {
    let s = chatReducer(initialChatState, { type: 'SEND', message: msg('hi') })
    expect(s.typingVisible).toBe(false) // still "reading"
    s = chatReducer(s, { type: 'TYPING_START' })
    expect(s.typingVisible).toBe(true)
    s = chatReducer(s, { type: 'REPLY', message: msg('re', 'advice_giver') })
    expect(s.typingVisible).toBe(false)
    // a late TYPING_START after the reply already arrived does nothing
    expect(chatReducer(s, { type: 'TYPING_START' }).typingVisible).toBe(false)
  })

  it('a new message hides "is typing" until its own read delay ends', () => {
    let s = chatReducer(initialChatState, { type: 'SEND', message: msg('a') })
    s = chatReducer(s, { type: 'TYPING_START' })
    s = chatReducer(s, { type: 'SEND', message: msg('b') })
    expect(s.typingVisible).toBe(false)
  })

  it('never counts below zero pending replies', () => {
    expect(chatReducer(initialChatState, { type: 'CANCEL_REPLY' }).pendingReplies).toBe(0)
  })

  it('does not change the state it was given', () => {
    const before = chatReducer(initialChatState, { type: 'SEND', message: msg('hi') })
    chatReducer(before, { type: 'REPLY', message: msg('hello', 'advice_giver') })
    expect(before.messages).toHaveLength(1)
    expect(initialChatState.messages).toHaveLength(0)
  })
})

describe('partnerReply', () => {
  const config: RoundConfig = {
    roundIndex: 3,
    isPractice: false,
    gainAmount: 10,
    lossAmount: 250,
    numberLossCards: 1,
    totalCards: 32,
    lossPositions: [31],
    rigged: false,
    lossOnFlipNum: null
  }

  it('builds a fallback partner message from the round as it is now', () => {
    let state = startRound(config, 0)
    state = flipCard(state, 0, 100)
    state = flipCard(state, 1, 200)
    const reply = partnerReply(state, 'risky', '2026-10-10T12:00:00.000Z')

    expect(reply.sender).toBe('advice_giver')
    expect(reply.source).toBe('fallback')
    expect(reply.roundIndex).toBe(3)
    expect(reply.flipsSoFar).toBe(2)
    expect(reply.advice?.flipsSoFar).toBe(2)
    expect(reply.text.length).toBeGreaterThan(0)
  })
})
