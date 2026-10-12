// Loads the Options/ folder next to the app: the design and chat configs and the prompt
// templates. Runs once at startup, in the main process (the renderer can't read files).
//
//  1. Any file missing from Options/ is copied in from the defaults bundled with the app,
//     so the first launch creates a complete, editable set
//  2. Every file is read and checked. All problems are collected, so a researcher can fix
//     everything in one go rather than one error per launch
//  3. If anything is wrong, loadOptions throws an OptionsError and the app refuses to start

import { constants } from 'fs'
import { copyFile, mkdir, readFile } from 'fs/promises'
import { createHash } from 'crypto'
import { join } from 'path'
import {
  ADVICE_CONDITIONS,
  DISPLAY_CONDITIONS,
  CONFIG_FILES,
  PROMPT_FILES,
  PROMPT_PLACEHOLDERS,
  type ChatConfig,
  type DesignConfig,
  type Options
} from '../shared/options'

// Thrown when Options/ has problems. message lists every problem, one per line
export class OptionsError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('\n'))
    this.name = 'OptionsError'
  }
}

export async function loadOptions(optionsDir: string, defaultsDir: string): Promise<Options> {
  // 1. Fill in anything missing from the bundled defaults. Existing files are never touched
  await mkdir(optionsDir, { recursive: true })
  for (const file of [...Object.values(CONFIG_FILES), ...Object.values(PROMPT_FILES)]) {
    await copyIfMissing(join(defaultsDir, file), join(optionsDir, file))
  }

  // 2. Read and check everything, collecting problems as "File: problem"
  const problems: string[] = []
  const report = (file: string, found: string[]): void => {
    for (const p of found) problems.push(`${file}: ${p}`)
  }

  const design = await readJson(join(optionsDir, CONFIG_FILES.design))
  if (design.error) report(CONFIG_FILES.design, [design.error])
  else report(CONFIG_FILES.design, validateDesignConfig(design.value))

  const chat = await readJson(join(optionsDir, CONFIG_FILES.chat))
  if (chat.error) report(CONFIG_FILES.chat, [chat.error])
  else report(CONFIG_FILES.chat, validateChatConfig(chat.value))

  const prompts = {} as Options['prompts']
  for (const [key, file] of Object.entries(PROMPT_FILES) as [keyof Options['prompts'], string][]) {
    prompts[key] = await readFile(join(optionsDir, file), 'utf8')
    report(file, validateTemplate(prompts[key]))
  }

  // 3. Refuse to continue with a broken setup
  if (problems.length > 0) throw new OptionsError(problems)
  return {
    design: design.value as DesignConfig,
    chat: chat.value as ChatConfig,
    prompts
  }
}

// A short fingerprint of the options, stored in every session.json. Sessions with the same
// hash ran with identical settings and wording, which makes them easy to group in analysis
export function optionsHash(options: Options): string {
  return createHash('sha256').update(JSON.stringify(options)).digest('hex').slice(0, 12)
}

async function copyIfMissing(from: string, to: string): Promise<void> {
  try {
    // COPYFILE_EXCL: fail rather than overwrite, so an edited file is never replaced
    await copyFile(from, to, constants.COPYFILE_EXCL)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
  }
}

async function readJson(path: string): Promise<{ value?: unknown; error?: string }> {
  const text = await readFile(path, 'utf8')
  try {
    return { value: JSON.parse(text) }
  } catch (err) {
    return { error: `isn't valid JSON (${(err as Error).message})` }
  }
}

// ---------------------------------------------------------------------------------------
// Checks. Each takes whatever was in the file (unknown, since it's untrusted) and returns a
// list of problems in plain language; an empty list means it's fine
// ---------------------------------------------------------------------------------------

const DESIGN_KEYS = [
  'totalCards',
  'numRounds',
  'gainAmounts',
  'lossAmounts',
  'lossCardCounts',
  'repititionsPerCondition',
  'rigging'
]

export function validateDesignConfig(value: unknown): string[] {
  if (!isObject(value)) return ['must be a JSON object, { ... }']
  const problems = unknownKeys(value, DESIGN_KEYS)

  const { totalCards, numRounds, gainAmounts, lossAmounts, lossCardCounts, repititionsPerCondition, rigging } =
    value

  if (!isInt(totalCards) || totalCards < 2) problems.push(`totalCards must be a whole number of at least 2 (got ${show(totalCards)})`)
  if (!isInt(numRounds) || numRounds < 1) problems.push(`numRounds must be a whole number of at least 1 (got ${show(numRounds)})`)
  problems.push(...positiveList('gainAmounts', gainAmounts))
  problems.push(...positiveList('lossAmounts', lossAmounts))

  const countProblems = positiveList('lossCardCounts', lossCardCounts, true)
  problems.push(...countProblems)
  if (countProblems.length === 0 && isInt(totalCards)) {
    for (const count of lossCardCounts as number[]) {
      if (count >= totalCards) problems.push(`lossCardCounts: ${count} loss cards leaves no gain cards out of ${totalCards}`)
    }
  }

  if (!isInt(repititionsPerCondition) || repititionsPerCondition < 1) {
    problems.push(`repititionsPerCondition must be a whole number of at least 1 (got ${show(repititionsPerCondition)})`)
  }

  // numRounds must match the design, or the round count and the conditions disagree
  if (
    problems.length === 0 &&
    isInt(numRounds) &&
    Array.isArray(gainAmounts) &&
    Array.isArray(lossAmounts) &&
    Array.isArray(lossCardCounts) &&
    isInt(repititionsPerCondition)
  ) {
    const product = gainAmounts.length * lossAmounts.length * lossCardCounts.length * repititionsPerCondition
    if (numRounds !== product) {
      problems.push(
        `numRounds is ${numRounds}, but gainAmounts × lossAmounts × lossCardCounts × repititionsPerCondition = ` +
          `${gainAmounts.length} × ${lossAmounts.length} × ${lossCardCounts.length} × ${repititionsPerCondition} = ${product}`
      )
    }
  }

  if (!isObject(rigging)) {
    problems.push('rigging must be an object, { "roundsRigged": ... }')
  } else {
    problems.push(...unknownKeys(rigging, ['roundsRigged'], 'rigging.'))
    const { roundsRigged } = rigging
    if (!isInt(roundsRigged) || roundsRigged < 0 || (isInt(numRounds) && roundsRigged > numRounds)) {
      problems.push(`rigging.roundsRigged must be a whole number from 0 to numRounds (got ${show(roundsRigged)})`)
    }
  }
  return problems
}

const CHAT_KEYS = [
  'riskyFlips',
  'safeFlips',
  'adviceCondition',
  'displayCondition',
  'personas',
  'greeting',
  'readDelayMs',
  'typingDelayMs'
]

export function validateChatConfig(value: unknown): string[] {
  if (!isObject(value)) return ['must be a JSON object, { ... }']
  const problems = unknownKeys(value, CHAT_KEYS)
  const { riskyFlips, safeFlips, adviceCondition, displayCondition, personas, greeting, readDelayMs, typingDelayMs } = value

  if (!isInt(riskyFlips) || riskyFlips < 0) problems.push(`riskyFlips must be a whole number of 0 or more (got ${show(riskyFlips)})`)
  if (!isInt(safeFlips) || safeFlips < 0) problems.push(`safeFlips must be a whole number of 0 or more (got ${show(safeFlips)})`)
  if (!ADVICE_CONDITIONS.includes(adviceCondition as never)) {
    problems.push(`adviceCondition must be one of ${ADVICE_CONDITIONS.map((c) => `"${c}"`).join(', ')} (got ${show(adviceCondition)})`)
  }
  if (!DISPLAY_CONDITIONS.includes(displayCondition as never)) {
    problems.push(`displayCondition must be one of ${DISPLAY_CONDITIONS.map((c) => `"${c}"`).join(', ')} (got ${show(displayCondition)})`)
  }

  if (!isObject(personas)) {
    problems.push('personas must be an object with "human" and "ai" entries')
  } else {
    problems.push(...unknownKeys(personas, ['human', 'ai'], 'personas.'))
    for (const which of ['human', 'ai']) {
      const persona = personas[which]
      if (!isObject(persona)) {
        problems.push(`personas.${which} is missing (it needs a "name" and an "avatar")`)
        continue
      }
      if (typeof persona.name !== 'string' || persona.name.trim() === '') problems.push(`personas.${which}.name must be some text`)
      if (typeof persona.avatar !== 'string' || persona.avatar.length < 1 || persona.avatar.length > 3) {
        problems.push(`personas.${which}.avatar must be 1 to 3 characters (it's shown in a small circle)`)
      }
    }
  }

  if (typeof greeting !== 'string') problems.push(`greeting must be text (got ${show(greeting)})`)
  problems.push(...delayRange('readDelayMs', readDelayMs))
  problems.push(...delayRange('typingDelayMs', typingDelayMs))
  return problems
}

// Checks a prompt template: it must have some text besides comments, and only use known
// {{placeholders}}. Mirrors how prompt.ts fills templates
export function validateTemplate(template: string): string[] {
  const text = template.replace(/<!--[\s\S]*?-->/g, '')
  if (text.trim() === '') return ['is empty (comments don\'t count)']

  const problems: string[] = []
  const known: readonly string[] = PROMPT_PLACEHOLDERS
  for (const [, name] of text.matchAll(/\{\{(\w+)\}\}/g)) {
    if (!known.includes(name)) {
      problems.push(`uses {{${name}}}, which isn't a known placeholder. Known: ${PROMPT_PLACEHOLDERS.join(', ')}`)
    }
  }
  // Anything left that looks like a placeholder but isn't one, e.g. "{{ gainAmount}" or "{gainAmount}}"
  if (text.replace(/\{\{\w+\}\}/g, '').match(/\{\{|\}\}/)) {
    problems.push('has a malformed placeholder: write placeholders exactly like {{gainAmount}}')
  }
  return problems
}

// --- small helpers ---

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isInt(v: unknown): v is number {
  return Number.isInteger(v)
}

// JSON.stringify shows strings in quotes and handles undefined (a missing key)
function show(v: unknown): string {
  return v === undefined ? 'nothing' : JSON.stringify(v)
}

// Unexpected keys are usually typos ("roundRigged"), which would otherwise be silently ignored
function unknownKeys(obj: Record<string, unknown>, allowed: string[], prefix = ''): string[] {
  return Object.keys(obj)
    .filter((k) => !allowed.includes(k))
    .map((k) => `unknown setting "${prefix}${k}" (expected: ${allowed.join(', ')})`)
}

function positiveList(name: string, v: unknown, wholeNumbers = false): string[] {
  if (!Array.isArray(v) || v.length === 0) return [`${name} must be a non-empty list, e.g. [10, 30] (got ${show(v)})`]
  const problems: string[] = []
  const valid = wholeNumbers ? (x: unknown) => isInt(x) && x > 0 : (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x > 0
  if (!v.every(valid)) problems.push(`${name} must contain only ${wholeNumbers ? 'whole numbers' : 'numbers'} above 0 (got ${show(v)})`)
  // A repeated value silently runs that condition twice and unbalances the design
  if (new Set(v).size !== v.length) problems.push(`${name} lists the same value more than once (got ${show(v)})`)
  return problems
}

function delayRange(name: string, v: unknown): string[] {
  if (
    !Array.isArray(v) ||
    v.length !== 2 ||
    !v.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0)
  ) {
    return [`${name} must be [min, max] in milliseconds, e.g. [600, 1500] (got ${show(v)})`]
  }
  return v[0] > v[1] ? [`${name}: min (${v[0]}) is larger than max (${v[1]})`] : []
}
