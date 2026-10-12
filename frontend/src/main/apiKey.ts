// Reads the Anthropic API key from Options/api-key.txt.
//
// Kept separate from the other options on purpose: the key is never sent to the renderer
// and never recorded in session.json, so it can't end up in participant data.

import { constants } from 'fs'
import { copyFile, readFile } from 'fs/promises'
import { join } from 'path'
import { OptionsError } from './options'

export const API_KEY_FILE = 'api-key.txt'

// Returns the key, or null if the file holds no key (only its # instruction lines).
// A missing file is restored from the bundled template first, like the other options.
// Throws an OptionsError if the file holds something that isn't a key.
export async function readApiKey(optionsDir: string, defaultsDir: string): Promise<string | null> {
  const path = join(optionsDir, API_KEY_FILE)
  try {
    await copyFile(join(defaultsDir, API_KEY_FILE), path, constants.COPYFILE_EXCL)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
  }

  const lines = (await readFile(path, 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))

  if (lines.length === 0) return null
  if (lines.length > 1) {
    throw new OptionsError([`${API_KEY_FILE}: put only the key on its own line (found ${lines.length} lines of text)`])
  }
  const key = lines[0]
  // The key itself is never included in the message, in case it's shown on screen
  if (!/^sk-ant-\S+$/.test(key)) {
    throw new OptionsError([
      `${API_KEY_FILE}: that doesn't look like an Anthropic API key (keys start with "sk-ant-" and contain no spaces)`
    ])
  }
  return key
}

// The template that ships with the app must never contain a real key: it's committed to the
// repository and bundled into every build. Used by a test and by scripts/package.mjs
export function containsKey(text: string): boolean {
  return text.split(/\r?\n/).some((line) => line.trim() !== '' && !line.trim().startsWith('#'))
}
