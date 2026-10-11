// handles all the file storage things

import { RoundResponse, SessionFile } from '../shared/types';
import { mkdir, writeFile, appendFile, readFile } from 'fs/promises'
import { join } from 'path'
import { ChatMessage } from '../shared/types';

export async function createSession(dataDir: string, data: SessionFile): Promise<{id, dir}> {
    // Sanitize the pid so that it works in a file name
    const safeId = data.participantId.replace(/[^A-Za-z0-9_-]/g, '_')
    // ISO time with characters Windows forbids in file names (:) swapped out
    const stamp = data.sessionStart.replace(/[:.]/g, '-')
    // Sessions saved to their pid and timestamp folder
    const id = `${safeId}_${stamp}`
    const dir = join(dataDir, id)

    // Create the base folder (if it doesn't exist) and the session folder
    await mkdir(dataDir, {recursive: true})
    await mkdir(dir)

    await writeFile(join(dir, 'session.json'), JSON.stringify(data, null, 2), {flag: 'wx'})
    return { id, dir }
}

export async function finishSession(dir: string): Promise<void> {
const session: SessionFile = JSON.parse(await readFile(join(dir, 'session.json'), 'utf8'))
  const rounds: RoundResponse[] = (await readFile(join(dir, 'rounds.jsonl'), 'utf8'))
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line))

  // A participant who never uses the chat has no messages.jsonl; that's not an error, they
  // just get a messages.csv with only the header row
  const messages = await readOptionalJsonl<ChatMessage>(join(dir, 'messages.jsonl'))

  await writeFile(join(dir, 'rounds.csv'), buildRoundsCsv(session, rounds), { flag: 'wx' })
  await writeFile(join(dir, 'flips.csv'), buildFlipsCsv(session, rounds), { flag: 'wx' })
  await writeFile(join(dir, 'messages.csv'), buildMessagesCsv(session, messages), { flag: 'wx' })
}

// Reads a .jsonl file into an array, one parsed object per line. Returns an empty array if
// the file was never created
async function readOptionalJsonl<T>(path: string): Promise<T[]> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as T)
}

// Creates a 'rounds csv' which builds out one round per code\

function buildRoundsCsv(session: SessionFile, rounds: RoundResponse[]): string {
    // Look up each round's settings by roundIndex
    const configs = new Map(session.roundConfigs.map((c) => [c.roundIndex, c]))

    // Builds out the csv header
    const header = [
        'participantId', 'roundIndex', 'isPractice', 'gainAmount', 'lossAmount',
        'numberLossCards', 'rigged', 'lossOnFlipNum', 'endReason',
        'gainCardsFlipped', 'roundScore', 'trialScore'
    ]

    // Indicates what the configuration was for each round
    const rows = rounds.map((r) => {
        const c = configs.get(r.roundIndex)
        return [
        session.participantId, r.roundIndex, c?.isPractice, c?.gainAmount, c?.lossAmount,
        c?.numberLossCards, c?.rigged, c?.lossOnFlipNum, r.endReason,
        r.gainCardsFlipped, r.roundScore, r.trialScore
        ]
    })

    // Creates the csv string
    return toCsv(header, rows)
}

// Builds out a csv file indicating each flip within a round
function buildFlipsCsv(session: SessionFile, rounds: RoundResponse[]): string {
    const header = [
        'participantId', 'roundIndex', 'flipIndex', 'cardPosition', 'outcome',
        'roundScoreAfterFlip', 'msSincePreviousFlip'
    ]

    const rows = rounds.flatMap((r) =>
        r.flips.map((f) => [
        session.participantId, r.roundIndex, f.flipIndex, f.cardPosition, f.outcome,
        f.roundScoreAfterFlip, f.msSincePreviousFlip
        ])
    )

    return toCsv(header, rows)
}

// Builds out a csv file with one row per chat message, from either side, in the order sent
function buildMessagesCsv(session: SessionFile, messages: ChatMessage[]): string {
    const header = [
        'participantId', 'roundIndex', 'sentAt', 'sender', 'flipsSoFar', 'text',
        'adviceCondition', 'suggestedTotalFlips', 'adviceAction', 'source', 'error'
    ]

    // Advice columns and source are only filled for partner messages, and error only for
    // system records of a failed reply; other rows leave them empty
    const rows = messages.map((m) => [
        session.participantId, m.roundIndex, m.sentAt, m.sender, m.flipsSoFar, m.text,
        m.advice?.condition, m.advice?.suggestedTotalFlips, m.advice?.action, m.source, m.error
    ])

    return toCsv(header, rows)
}

// Csv Building Helper functions
// Quotes any value containing a comma, quote or line break. Chat text is typed by
// participants, so it can contain any of these (\r included, from Windows line breaks)
function csvCell(value: unknown): string {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n'
}

export async function appendRound(dir: string, response: RoundResponse): Promise<void> {
  await appendFile(join(dir, 'rounds.jsonl'), JSON.stringify(response) + '\n')
}

export async function appendMessage(dir: string, message: ChatMessage): Promise<void> {
  await appendFile(join(dir, 'messages.jsonl'), JSON.stringify(message) + '\n')
}

