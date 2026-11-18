// Reads the relay access key from Options/relay-key.txt: the lab's shared secret, which the
// relay (relay/, RELAY_TOKEN) checks in every hello. Only needed when actualPartner is "student".
//
// Kept separate from the other options for the same reason as api-key.txt: the key is never
// sent to the renderer and never recorded in session.json, so it can't end up in participant data.

import { constants } from 'fs'
import { copyFile, readFile } from 'fs/promises'
import { join } from 'path'
import { MIN_TOKEN_LENGTH } from '../shared/partner/relay'
import { OptionsError } from './options'

export const RELAY_KEY_FILE = 'relay-key.txt'

// Returns the key, or null if the file holds no key (only its # instruction lines).
// A missing file is restored from the bundled template first, like the other options.
// Throws an OptionsError if the file holds something that isn't a key.
export async function readRelayKey(optionsDir: string, defaultsDir: string): Promise<string | null> {
  const path = join(optionsDir, RELAY_KEY_FILE)
  try {
    await copyFile(join(defaultsDir, RELAY_KEY_FILE), path, constants.COPYFILE_EXCL)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
  }

  const lines = (await readFile(path, 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))

  if (lines.length === 0) return null
  if (lines.length > 1) {
    throw new OptionsError([`${RELAY_KEY_FILE}: put only the key on its own line (found ${lines.length} lines of text)`])
  }
  const key = lines[0]
  // The key itself is never included in the message, in case it's shown on screen
  if (key.length < MIN_TOKEN_LENGTH || /\s/.test(key)) {
    throw new OptionsError([
      `${RELAY_KEY_FILE}: that doesn't look like a relay key (keys are at least ${MIN_TOKEN_LENGTH} characters ` +
        'with no spaces). Copy it again exactly as it was given to you'
    ])
  }
  return key
}
