import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { API_KEY_FILE, containsKey, readApiKey } from './apiKey'
import { OptionsError } from './options'

const DEFAULTS = join(__dirname, '..', '..', 'defaults', 'Options')
const FAKE_KEY = 'sk-ant-api03-test0123456789'

describe('readApiKey', () => {
  let root: string
  let optionsDir: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cct-key-'))
    optionsDir = join(root, 'Options')
    await mkdir(optionsDir)
  })
  afterEach(async () => {
    await rm(root, { recursive: true })
  })

  it('restores a missing api-key.txt from the template, and finds no key in it', async () => {
    expect(await readApiKey(optionsDir, DEFAULTS)).toBeNull()
    expect(await readFile(join(optionsDir, API_KEY_FILE), 'utf8')).toBe(
      await readFile(join(DEFAULTS, API_KEY_FILE), 'utf8')
    )
  })

  it('reads a key pasted under the instructions, ignoring spaces around it', async () => {
    const template = await readFile(join(DEFAULTS, API_KEY_FILE), 'utf8')
    await writeFile(join(optionsDir, API_KEY_FILE), `${template}\r\n   ${FAKE_KEY}   \r\n`)
    expect(await readApiKey(optionsDir, DEFAULTS)).toBe(FAKE_KEY)
  })

  it('rejects text that is not a key, without echoing it', async () => {
    await writeFile(join(optionsDir, API_KEY_FILE), 'my key is secret123\n')
    const error = await readApiKey(optionsDir, DEFAULTS).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(OptionsError)
    expect((error as Error).message).toContain("doesn't look like an Anthropic API key")
    expect((error as Error).message).not.toContain('secret123')
  })

  it('rejects more than one line of text', async () => {
    await writeFile(join(optionsDir, API_KEY_FILE), `${FAKE_KEY}\n${FAKE_KEY}\n`)
    await expect(readApiKey(optionsDir, DEFAULTS)).rejects.toThrow('found 2 lines')
  })
})

describe('the shipped api-key.txt template', () => {
  it('contains instructions only, never a key', async () => {
    expect(containsKey(await readFile(join(DEFAULTS, API_KEY_FILE), 'utf8'))).toBe(false)
  })
})
