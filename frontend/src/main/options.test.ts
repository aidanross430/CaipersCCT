import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  loadOptions,
  optionsHash,
  OptionsError,
  validateChatConfig,
  validateDesignConfig,
  validateTemplate
} from './options'
import { CONFIG_FILES, PROMPT_FILES } from '../shared/options'

// The real defaults shipped with the app, so these tests also check that they're valid
const DEFAULTS = join(__dirname, '..', '..', 'defaults', 'Options')
const ALL_FILES = [...Object.values(CONFIG_FILES), ...Object.values(PROMPT_FILES)].sort()

describe('loadOptions', () => {
  let root: string
  let optionsDir: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cct-options-'))
    optionsDir = join(root, 'Options')
  })
  afterEach(async () => {
    await rm(root, { recursive: true })
  })

  it('accepts the shipped defaults', async () => {
    const options = await loadOptions(optionsDir, DEFAULTS)
    expect(options.design.totalCards).toBeGreaterThan(0)
    expect(options.chat.personas.ai.name).not.toBe('')
    expect(options.prompts.situation).toContain('{{')
  })

  it('creates a missing Options folder with every default file', async () => {
    await loadOptions(optionsDir, DEFAULTS)
    expect((await readdir(optionsDir)).sort()).toEqual(ALL_FILES)
  })

  it('restores a single missing file without touching the others', async () => {
    await cp(DEFAULTS, optionsDir, { recursive: true })
    const edited = (await readFile(join(optionsDir, 'style.md'), 'utf8')) + '\nEdited by a researcher.'
    await writeFile(join(optionsDir, 'style.md'), edited)
    await rm(join(optionsDir, 'rules.md'))

    const options = await loadOptions(optionsDir, DEFAULTS)
    expect(options.prompts.style).toBe(edited) // kept
    expect(options.prompts.rules).toBe(await readFile(join(DEFAULTS, 'rules.md'), 'utf8')) // restored
  })

  it('reports invalid JSON with the file name', async () => {
    await cp(DEFAULTS, optionsDir, { recursive: true })
    await writeFile(join(optionsDir, CONFIG_FILES.chat), '{ "riskyFlips": 7, }')
    await expect(loadOptions(optionsDir, DEFAULTS)).rejects.toThrow(/Chat\.config\.json: isn't valid JSON/)
  })

  it('collects problems from several files at once', async () => {
    await cp(DEFAULTS, optionsDir, { recursive: true })
    const chat = JSON.parse(await readFile(join(optionsDir, CONFIG_FILES.chat), 'utf8'))
    await writeFile(join(optionsDir, CONFIG_FILES.chat), JSON.stringify({ ...chat, readDelayMs: [900, 100] }))
    await writeFile(join(optionsDir, 'style.md'), 'Write like {{partnrName}}')

    const error = await loadOptions(optionsDir, DEFAULTS).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(OptionsError)
    const problems = (error as OptionsError).problems
    expect(problems.some((p) => p.startsWith('Chat.config.json: readDelayMs'))).toBe(true)
    expect(problems.some((p) => p.startsWith('style.md: uses {{partnrName}}'))).toBe(true)
  })
})

describe('validateDesignConfig', () => {
  const valid = {
    totalCards: 32,
    numRounds: 8,
    gainAmounts: [10, 30],
    lossAmounts: [250, 750],
    lossCardCounts: [1, 3],
    repititionsPerCondition: 1,
    rigging: { roundsRigged: 2 }
  }

  it('accepts a valid design', () => {
    expect(validateDesignConfig(valid)).toEqual([])
  })

  it('rejects a round count that does not match the design', () => {
    const [problem] = validateDesignConfig({ ...valid, numRounds: 27 })
    expect(problem).toContain('numRounds is 27')
    expect(problem).toContain('= 8')
  })

  it('rejects repeated values, which would silently run a condition twice', () => {
    expect(validateDesignConfig({ ...valid, gainAmounts: [10, 10] })).toContainEqual(
      expect.stringContaining('gainAmounts lists the same value more than once')
    )
  })

  it('rejects a loss-card count that leaves no gain cards', () => {
    expect(validateDesignConfig({ ...valid, totalCards: 3, lossCardCounts: [1, 3] })).toContainEqual(
      expect.stringContaining('3 loss cards leaves no gain cards')
    )
  })

  it('rejects more rigged rounds than rounds', () => {
    expect(validateDesignConfig({ ...valid, rigging: { roundsRigged: 9 } })).toContainEqual(
      expect.stringContaining('rigging.roundsRigged')
    )
  })

  it('reports misspelled settings rather than ignoring them', () => {
    const misspelled: Record<string, unknown> = { ...valid, repetitionsPerCondition: 1 }
    delete misspelled.repititionsPerCondition
    const problems = validateDesignConfig(misspelled)
    expect(problems).toContainEqual(expect.stringContaining('unknown setting "repetitionsPerCondition"'))
    expect(problems).toContainEqual(expect.stringContaining('repititionsPerCondition must be'))
  })
})

describe('validateChatConfig', () => {
  const valid = {
    riskyFlips: 7,
    safeFlips: 7,
    adviceCondition: 'risky',
    personas: { human: { name: 'Pat', avatar: 'P' }, ai: { name: 'Claude', avatar: 'AI' } },
    greeting: 'hi',
    readDelayMs: [600, 1500],
    typingDelayMs: [900, 1500]
  }

  it('accepts a valid chat config', () => {
    expect(validateChatConfig(valid)).toEqual([])
  })

  it('rejects an unknown advice condition', () => {
    expect(validateChatConfig({ ...valid, adviceCondition: 'bold' })).toContainEqual(
      expect.stringContaining('adviceCondition must be one of')
    )
  })

  it('rejects a missing persona and an avatar too long for its circle', () => {
    const problems = validateChatConfig({ ...valid, personas: { human: { name: 'Pat', avatar: 'PAT1' } } })
    expect(problems).toContainEqual(expect.stringContaining('personas.ai is missing'))
    expect(problems).toContainEqual(expect.stringContaining('personas.human.avatar'))
  })

  it('rejects delays that are not [min, max] with min <= max', () => {
    expect(validateChatConfig({ ...valid, typingDelayMs: [1500, 900] })).toContainEqual(
      expect.stringContaining('min (1500) is larger than max (900)')
    )
    expect(validateChatConfig({ ...valid, readDelayMs: 600 })).toContainEqual(
      expect.stringContaining('readDelayMs must be [min, max]')
    )
  })
})

describe('validateTemplate', () => {
  it('accepts known placeholders and ignores comments', () => {
    expect(validateTemplate('<!-- note {{anything}} -->\nRound {{roundNumber}}: {{adviceText}}')).toEqual([])
  })

  it('rejects an unknown placeholder', () => {
    expect(validateTemplate('Hi {{partnrName}}')[0]).toContain('{{partnrName}}')
  })

  it('rejects a malformed placeholder', () => {
    expect(validateTemplate('Worth {{ gainAmount}} points')[0]).toContain('malformed')
  })

  it('rejects a template that is only comments', () => {
    expect(validateTemplate('<!-- todo -->\n')[0]).toContain('empty')
  })
})

describe('optionsHash', () => {
  it('is stable for the same options and changes when anything changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cct-hash-'))
    const options = await loadOptions(join(root, 'Options'), DEFAULTS)
    await rm(root, { recursive: true })

    expect(optionsHash(options)).toBe(optionsHash(structuredClone(options)))
    expect(optionsHash(options)).toMatch(/^[0-9a-f]{12}$/)
    const edited = { ...options, prompts: { ...options.prompts, style: options.prompts.style + '!' } }
    expect(optionsHash(edited)).not.toBe(optionsHash(options))
  })
})
