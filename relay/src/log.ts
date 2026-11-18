// The relay's only output: one JSON line per event on stdout, which the host collects.
// Events and counts only. Never a payload, chat text, view, token or claim: the relay must not
// become a record of the session. Room codes are allowed, since they're single-use and mean
// nothing without the participant's screen

type Field = string | number | boolean | null

export function log(event: string, fields: Record<string, Field> = {}): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }))
}
