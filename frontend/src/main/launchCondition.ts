// Which experimental condition this run is, from the launcher's command-line flag. The shipped
// folder has one launcher per condition (scripts/package.mjs writes them):
//
//   Condition A.bat   app\CaipersCCT.exe --condition=A
//
// The flag sets perceivedPartner and actualPartner, overriding Chat.config.json, so a launcher
// always runs the condition it's named for, whatever the file says. The override happens before
// the options are hashed and recorded, so session.json shows the condition that actually ran.
//
// Without a flag, `npm run dev` uses Chat.config.json's values as before, and a packaged build
// refuses to start, so double-clicking the bare .exe can't silently run some condition.
//
// The other launcher, Proctor.bat, passes --mode=proctor instead: the proctor client
// (main/proctor.ts), which runs no condition, so it can't be combined with --condition.
import type { ChatConfig, Options } from '../shared/options'

export type ConditionKey = 'A' | 'B' | 'C' | 'D'

// Neutral letters, so a participant who sees the folder can't tell the conditions apart.
// The key for research assistants is in packaging/README.txt
export const CONDITIONS = {
  A: { perceivedPartner: 'human', actualPartner: 'student' },
  B: { perceivedPartner: 'human', actualPartner: 'llm' },
  C: { perceivedPartner: 'ai', actualPartner: 'student' },
  D: { perceivedPartner: 'ai', actualPartner: 'llm' }
} as const satisfies Record<ConditionKey, Pick<ChatConfig, 'perceivedPartner' | 'actualPartner'>>

const FLAG = '--condition='

export type LaunchCondition =
  | { ok: true; condition: ConditionKey | null } // null: no flag given
  | { ok: false; problem: string }

// argv is process.argv. Chromium and electron-vite add flags of their own, so anything that
// isn't --condition= is ignored; only our flag is checked
export function readLaunchCondition(argv: readonly string[]): LaunchCondition {
  const values = argv.filter((arg) => arg.startsWith(FLAG)).map((arg) => arg.slice(FLAG.length))
  if (values.length === 0) return { ok: true, condition: null }

  const keys = new Set(values.map((v) => v.toUpperCase()))
  if (keys.size > 1) {
    return { ok: false, problem: `It was given more than one condition (${values.join(', ')}).` }
  }
  const key = values[0].toUpperCase()
  if (!Object.hasOwn(CONDITIONS, key)) {
    return {
      ok: false,
      problem: `"${values[0]}" isn't a condition. The conditions are A, B, C and D.`
    }
  }
  return { ok: true, condition: key as ConditionKey }
}

const MODE_FLAG = '--mode='

export type LaunchMode =
  | { ok: true; mode: 'participant' | 'proctor' } // participant: no --mode flag
  | { ok: false; problem: string }

// Checked before readLaunchCondition: proctor mode skips conditions entirely
export function readLaunchMode(argv: readonly string[]): LaunchMode {
  const values = argv
    .filter((arg) => arg.startsWith(MODE_FLAG))
    .map((arg) => arg.slice(MODE_FLAG.length))
  if (values.length === 0) return { ok: true, mode: 'participant' }

  const unknown = values.find((v) => v.toLowerCase() !== 'proctor')
  if (unknown !== undefined) {
    return { ok: false, problem: `"${unknown}" isn't a mode. The only mode is "proctor".` }
  }
  if (argv.some((arg) => arg.startsWith(FLAG))) {
    return {
      ok: false,
      problem:
        'It was started as both the proctor client and a condition. Use one launcher, not both.'
    }
  }
  return { ok: true, mode: 'proctor' }
}

// The options with the condition's two settings in place of Chat.config.json's
export function applyCondition(options: Options, key: ConditionKey): Options {
  return { ...options, chat: { ...options.chat, ...CONDITIONS[key] } }
}
