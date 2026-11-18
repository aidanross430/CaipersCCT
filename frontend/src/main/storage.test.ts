import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { ChatMessage, RoundResponse, SessionFile } from '../shared/types'
import type { Options } from '../shared/options'
import { appendMessage, appendRound, checkWritable, createSession, finishSession } from './storage'

const session: SessionFile = {
  participantId: 'P001',
  trialConfig: { designSeed: 1, perceivedPartner: 'ai', actualPartner: 'llm' },
  roundConfigs: [
    {
      roundIndex: 0,
      blockIndex: 0,
      gainAmount: 10,
      lossAmount: 250,
      numberLossCards: 1,
      totalCards: 32,
      fillerLossPositions: [5],
      riggedLossFlip: null,
      roundType: 'filler'
    }
  ],
  sessionStart: '2026-10-11T12:00:00.000Z',
  localDate: '10/11/2026',
  appVersion: 'test',
  options: {
    design: {
      totalCards: 32,
      gainAmounts: [10],
      lossAmounts: [250],
      lossCardCounts: [1],
      repititionsPerConditionPerBlock: 1,
      numFillerRoundsPerBlock: 0,
      riggedLossCardWindow: 1
    },
    chat: {
      riskyFlips: 7,
      safeFlips: 7,
      adviceCondition: 'risky',
      perceivedPartner: 'ai',
      actualPartner: 'llm',
      personas: { human: { name: 'Pat', avatar: 'P' }, ai: { name: 'AI', avatar: 'AI' } },
      greeting: 'hi',
      readDelayMs: [0, 0],
      typingDelayMs: [0, 0]
    },
    prompts: { styleHuman: 'h', styleAi: 'a', rules: 'r', situation: 's' }
  } satisfies Options,
  optionsHash: 'test'
}

const round: RoundResponse = {
  roundIndex: 0,
  blockIndex: 0,
  block: 'solo',
  roundType: 'filler',
  gainAmount: 10,
  lossAmount: 250,
  numberLossCards: 1,
  fillerLossPositions: [5],
  riggedLossFlip: null,
  actualLossFlip: null,
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
  roundIndex: 0
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
      advice: { condition: 'risky', suggestedTotalFlips: 11 },
      source: 'llm'
    })
    await finishSession(dir)

    const rows = csvRows(await readFile(join(dir, 'messages.csv'), 'utf8'))
    expect(rows[0]).toBe(
      'participantId,roundIndex,sentAt,sender,text,adviceCondition,suggestedTotalFlips,source,error'
    )
    expect(rows).toHaveLength(3)
    expect(rows[1]).toBe('P001,0,2026-10-11T12:00:01.000Z,participant,how many?,,,,')
    expect(rows[2]).toBe("P001,0,2026-10-11T12:00:01.000Z,advice_giver,i'd go for about 11,risky,11,llm,")
  })

  it('quotes participant text containing commas, quotes and line breaks', async () => {
    const { dir } = await createSession(dataDir, session)
    await appendRound(dir, round)
    await appendMessage(dir, message('ok, "really"?\r\nsure'))
    await finishSession(dir)

    const rows = csvRows(await readFile(join(dir, 'messages.csv'), 'utf8'))
    expect(rows).toHaveLength(2)
    expect(rows[1]).toBe('P001,0,2026-10-11T12:00:01.000Z,participant,"ok, ""really""?\r\nsure",,,,')
  })

  it('writes a header-only messages.csv when the participant never chatted', async () => {
    const { dir } = await createSession(dataDir, session)
    await appendRound(dir, round)
    await finishSession(dir)

    const rows = csvRows(await readFile(join(dir, 'messages.csv'), 'utf8'))
    expect(rows).toHaveLength(1)
  })
})

describe('checkWritable', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cct-test-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true })
  })

  it('creates a missing Output folder and leaves no test file behind', async () => {
    const output = join(root, 'CaipersCCT', 'Output')
    await checkWritable(output)
    expect(await readdir(output)).toEqual([])
  })

  it('accepts an Output folder that already holds sessions', async () => {
    const output = join(root, 'Output')
    await checkWritable(output)
    await writeFile(join(output, 'existing.txt'), 'x')
    await checkWritable(output)
    expect(await readdir(output)).toEqual(['existing.txt'])
  })

  it('throws when the folder cannot be created', async () => {
    // A file where the folder should be: the folder can't be created there
    const blocked = join(root, 'Output')
    await writeFile(blocked, 'not a folder')
    await expect(checkWritable(blocked)).rejects.toThrow()
  })
})
