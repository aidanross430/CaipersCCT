// Small checks shared by all application components that turn unknown messages into 
// typed values

// Used for options files, app protocol messages, and relay frames

// --- value checks ---

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function isInt(v: unknown): v is number {
  return Number.isInteger(v)
}

// A value as it should appear in a problem message. JSON.stringify shows strings in quotes and
// handles undefined (a missing key). Cut short so a huge bad message can't flood the log
export function show(v: unknown): string {
  if (v === undefined) return 'nothing'
  const text = JSON.stringify(v)
  return text.length > 80 ? `${text.slice(0, 80)}...` : text
}

// *** Network messages (protocol and relay) ***

// Problems are returned rather than thrown so the caller can log them and keep the connection,
// instead of crashing on one bad message
export type ParseResult<T> = { ok: true; message: T } | { ok: false; problem: string }

export function ok<T>(message: T): ParseResult<T> {
  return { ok: true, message }
}

export function fail(problem: string): { ok: false; problem: string } {
  return { ok: false, problem }
}

// Every message is a JSON object with a string `type`; the per-type checks start from there
export function parseMessage(raw: string): ParseResult<Record<string, unknown>> {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return fail('message is not valid JSON')
  }
  if (!isObject(value)) return fail(`message must be an object (got ${show(value)})`)
  if (typeof value.type !== 'string')
    return fail(`message type must be text (got ${show(value.type)})`)
  return ok(value)
}

// The first key that isn't allowed, or null. Extra keys mean the two ends disagree on the
// protocol, which is worth hearing about rather than silently ignoring
export function unknownKey(obj: Record<string, unknown>, allowed: string[]): string | null {
  const key = Object.keys(obj).find((k) => !allowed.includes(k))
  return key === undefined ? null : `${show(obj.type)} message has an unknown field "${key}"`
}
