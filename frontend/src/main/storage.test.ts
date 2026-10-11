import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { ChatMessage, RoundResponse, SessionFile } from '../shared/types'
import { appendMessage, appendRound, createSession, finishSession } from './storage'

const session: SessionFile = {
  participantId: 'P001',
  trialConfig: { designSeed: 1, chatDisplayCondition: 'ai' },
  roundConfigs: [
    {
      roundIndex: 0,
      isPractice: false,
      gainAmount: 10,
      lossAmount: 250,
      numberLossCards: 1,
      totalCards: 32,
      lossPositions: [5],
      rigged: false,
      lossOnFlipNum: null
    }
  ],
  sessionStart: '2026-10-11T12:00:00.000Z',
  localDate: '10/11/2026',
  appVersion: 'test'
}

const round: RoundResponse = {
  roundIndex: 0,
  flips: [],
  endReason: 'stopped',
  gainCardsFlipped: 0,
  trialScore: 0,
  roundScore: 0
}

const message = (text: string, sender: ChatMessage['sender'] = 'participant'): ChatMessage => ({
  sender,
  text,
  sentAt: '2026-10-11T12:00:01.000Z',
  roundIndex: 0,
  flipsSoFar: 0
})

// Splits CSV text into rows, keeping quoted line breaks inside their row
function csvRows(text: string): string[] {
  const rows: string[] = []
  let current = ''
  let inQuotes = false
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes
    if (ch === '\n' && !inQuotes) {
      rows.push(current)
      current = ''
    } else current += ch
  }
  return rows
}

describe('messages.csv', () => {
  let dataDir: string
  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'cct-test-'))
  })
  afterEach(async () => {
    await rm(dataDir, { recursive: true })
  })

  it('writes one row per message, with advice only on partner rows', async () => {
    const { dir } = await createSession(dataDir, session)
    await appendRound(dir, round)
    await appendMessage(dir, message('how many?'))
    await appendMessage(dir, {
      ...message("i'd go for about 11", 'advice_giver'),
      advice: { condition: 'risky', suggestedTotalFlips: 11, flipsSoFar: 0, action: 'flip' },
      source: 'llm'
    })
    await finishSession(dir)

    const rows = csvRows(await readFile(join(dir, 'messages.csv'), 'utf8'))
    expect(rows[0]).toBe(
      'participantId,roundIndex,sentAt,sender,flipsSoFar,text,adviceCondition,suggestedTotalFlips,adviceAction,source,error'
    )
    expect(rows).toHaveLength(3)
    expect(rows[1]).toBe('P001,0,2026-10-11T12:00:01.000Z,participant,0,how many?,,,,,')
    expect(rows[2]).toBe("P001,0,2026-10-11T12:00:01.000Z,advice_giver,0,i'd go for about 11,risky,11,flip,llm,")
  })

  it('quotes participant text containing commas, quotes and line breaks', async () => {
    const { dir } = await createSession(dataDir, session)
    await appendRound(dir, round)
    await appendMessage(dir, message('ok, "really"?\r\nsure'))
    await finishSession(dir)

    const rows = csvRows(await readFile(join(dir, 'messages.csv'), 'utf8'))
    expect(rows).toHaveLength(2)
    expect(rows[1]).toBe('P001,0,2026-10-11T12:00:01.000Z,participant,0,"ok, ""really""?\r\nsure",,,,,')
  })

  it('writes a header-only messages.csv when the participant never chatted', async () => {
    const { dir } = await createSession(dataDir, session)
    await appendRound(dir, round)
    await finishSession(dir)

    const rows = csvRows(await readFile(join(dir, 'messages.csv'), 'utf8'))
    expect(rows).toHaveLength(1)
  })
})
