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
    const edited = (await readFile(join(optionsDir, 'style.ai.md'), 'utf8')) + '\nEdited by a researcher.'
    await writeFile(join(optionsDir, 'style.ai.md'), edited)
    await rm(join(optionsDir, 'rules.md'))

    const options = await loadOptions(optionsDir, DEFAULTS)
    expect(options.prompts.styleAi).toBe(edited) // kept
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
    await writeFile(join(optionsDir, 'style.human.md'), 'Write like {{partnrName}}')

    const error = await loadOptions(optionsDir, DEFAULTS).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(OptionsError)
    const problems = (error as OptionsError).problems
    expect(problems.some((p) => p.startsWith('Chat.config.json: readDelayMs'))).toBe(true)
    expect(problems.some((p) => p.startsWith('style.human.md: uses {{partnrName}}'))).toBe(true)
  })

  it('loads both style templates', async () => {
    const options = await loadOptions(optionsDir, DEFAULTS)
    expect(options.prompts.styleHuman).toBe(await readFile(join(DEFAULTS, 'style.human.md'), 'utf8'))
    expect(options.prompts.styleAi).toBe(await readFile(join(DEFAULTS, 'style.ai.md'), 'utf8'))
  })

  it('refuses to start while an old style.md is still there, so its edits are not ignored', async () => {
    await cp(DEFAULTS, optionsDir, { recursive: true })
    await writeFile(join(optionsDir, 'style.md'), 'An edited style from before the split')

    const error = await loadOptions(optionsDir, DEFAULTS).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(OptionsError)
    expect((error as OptionsError).problems).toContainEqual(
      expect.stringMatching(/^style\.md: has been split into style\.human\.md .* and style\.ai\.md/)
    )
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
    perceivedPartner: 'ai',
    actualPartner: 'llm',
    personas: { human: { name: 'Pat', avatar: 'P' }, ai: { name: 'Claude', avatar: 'AI' } },
    greeting: 'hi',
    readDelayMs: [600, 1500],
    typingDelayMs: [900, 1500],
    relayUrl: 'wss://relay.example.org/v1'
  }

  it('accepts a valid chat config', () => {
    expect(validateChatConfig(valid)).toEqual([])
  })

  it('accepts every perceived x actual partner combination', () => {
    for (const perceivedPartner of ['human', 'ai']) {
      for (const actualPartner of ['student', 'llm']) {
        expect(validateChatConfig({ ...valid, perceivedPartner, actualPartner })).toEqual([])
      }
    }
  })

  it('rejects an unknown perceived partner', () => {
    expect(validateChatConfig({ ...valid, perceivedPartner: 'Human' })).toContainEqual(
      expect.stringContaining('perceivedPartner must be one of "human", "ai"')
    )
  })

  it('rejects an unknown actual partner', () => {
    expect(validateChatConfig({ ...valid, actualPartner: 'human' })).toContainEqual(
      expect.stringContaining('actualPartner must be one of "student", "llm"')
    )
  })

  it('rejects the old displayCondition setting', () => {
    // An Options/ folder from before the split still has it: reported as an unknown setting
    expect(validateChatConfig({ ...valid, displayCondition: 'ai' })).toContainEqual(
      expect.stringContaining('displayCondition')
    )
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
    const edited = { ...options, prompts: { ...options.prompts, styleHuman: options.prompts.styleHuman + '!' } }
    expect(optionsHash(edited)).not.toBe(optionsHash(options))
  })
})
