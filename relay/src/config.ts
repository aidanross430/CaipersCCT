// The relay's settings. Secrets and anything that differs per deployment come from environment
// variables; timings are fixed defaults that tests can override through createRelayServer.
// Like the participant app's options.ts: every problem is collected and the relay refuses to
// start, rather than running with a setting it couldn't read

export type RelayConfig = {
  port: number                 // PORT. Most hosts set this themselves
  host: string                 // HOST. 0.0.0.0 in a container; tests use 127.0.0.1
  token: string                // RELAY_TOKEN. The lab access token every hello must carry
  maxRooms: number             // MAX_ROOMS. Open rooms at once; past it, hellos get 'server-full'

  helloTimeoutMs: number       // a new socket's time to send a valid hello
  heartbeatMs: number          // ping interval
  missedHeartbeats: number     // missed pongs before a socket is terminated
  roomGraceMs: number          // how long a room waits for its participant to come back
  maxRoomAgeMs: number         // any room is closed after this long, however busy
}

// Shortest token accepted. `openssl rand -hex 32` gives 64 characters
export const MIN_TOKEN_LENGTH = 32

export const DEFAULTS = {
  port: 8080,
  host: '0.0.0.0',
  maxRooms: 50,
  helloTimeoutMs: 5_000,       // = HELLO_TIMEOUT_MS in shared/partner/relay.ts
  heartbeatMs: 10_000,         // = HEARTBEAT_INTERVAL_MS in shared/partner/link.ts
  missedHeartbeats: 2,         // = MISSED_HEARTBEATS_BEFORE_DISCONNECT in shared/partner/link.ts
  roomGraceMs: 10 * 60_000,
  maxRoomAgeMs: 4 * 60 * 60_000
} satisfies Omit<RelayConfig, 'token'>

// Thrown when the environment has problems. message lists every problem, one per line
export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('\n'))
    this.name = 'ConfigError'
  }
}

export function readConfig(env: Record<string, string | undefined>): RelayConfig {
  const problems: string[] = []

  const token = env.RELAY_TOKEN?.trim() ?? ''
  if (token === '') {
    problems.push('RELAY_TOKEN is not set. Generate one with `openssl rand -hex 32`')
  } else if (token.length < MIN_TOKEN_LENGTH) {
    problems.push(`RELAY_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters (got ${token.length})`)
  }

  const port = readInt(env, 'PORT', DEFAULTS.port, 1, 65_535, problems)
  const maxRooms = readInt(env, 'MAX_ROOMS', DEFAULTS.maxRooms, 1, 10_000, problems)
  const host = env.HOST?.trim() || DEFAULTS.host

  if (problems.length > 0) throw new ConfigError(problems)
  return { ...DEFAULTS, port, host, maxRooms, token }
}

// A whole number in [min, max], or the fallback when the variable is unset or empty
function readInt(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
  min: number,
  max: number,
  problems: string[]
): number {
  const raw = env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    problems.push(`${name} must be a whole number from ${min} to ${max} (got "${raw}")`)
    return fallback
  }
  return value
}
