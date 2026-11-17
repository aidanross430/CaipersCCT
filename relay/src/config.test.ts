import { describe, it, expect } from 'vitest'
import { ConfigError, DEFAULTS, readConfig } from './config'

const token = 'a'.repeat(64)

describe('readConfig', () => {
  it('uses the defaults when only RELAY_TOKEN is set', () => {
    expect(readConfig({ RELAY_TOKEN: token })).toEqual({ ...DEFAULTS, token })
  })

  it('reads PORT, HOST and MAX_ROOMS', () => {
    const config = readConfig({ RELAY_TOKEN: token, PORT: '3000', HOST: '127.0.0.1', MAX_ROOMS: '5' })
    expect(config).toMatchObject({ port: 3000, host: '127.0.0.1', maxRooms: 5 })
  })

  it('refuses a missing or short token', () => {
    expect(() => readConfig({})).toThrow(ConfigError)
    expect(() => readConfig({ RELAY_TOKEN: 'short' })).toThrow(/at least 32/)
  })

  it('collects every problem at once', () => {
    try {
      readConfig({ PORT: 'eighty', MAX_ROOMS: '0' })
      expect.unreachable()
    } catch (err) {
      expect((err as ConfigError).problems).toHaveLength(3)
    }
  })
})
