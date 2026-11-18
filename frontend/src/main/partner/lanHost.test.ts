import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest'
import { WebSocket } from 'ws'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createLanHost, type LanHost, type LanHostOptions } from './lanHost'
import type { PartnerStatus } from '../../shared/partner/link'
import { isRoomCode } from '../../shared/partner/relay'
import { PROTOCOL_VERSION, type ProctorView, type ToParticipant, type ToProctor } from '../../shared/partner/protocol'

// These run a real server on port 0 (any free port) and connect real `ws` clients to
// localhost, so everything but the two-machine network path is covered

const view: ProctorView = {
  phase: 'task',
  block: 'advised',
  roundNumber: 3,
  totalRounds: 24,
  trialScore: 40,
  betweenRounds: true,
  round: null,
  upcoming: null,
  chat: []
}

const hosts: LanHost[] = []
const clients: WebSocket[] = []
afterEach(async () => {
  clients.splice(0).forEach((c) => c.terminate())
  for (const host of hosts.splice(0)) {
    host.close()
    await host.closed
  }
})

type Started = {
  host: LanHost
  statuses: PartnerStatus[]
  problems: string[]
  messages: ToParticipant[]
  join: { url: string; code: string }
  port: number
}

type FakeProctor = {
  socket: WebSocket
  received: ToProctor[]
  isClosed: () => boolean
  send: (message: unknown) => void
}

// Starts a host on localhost and waits until it's listening
async function start(options: Partial<LanHostOptions> = {}): Promise<Started> {
  const statuses: PartnerStatus[] = []
  const problems: string[] = []
  const messages: ToParticipant[] = []
  const host = createLanHost({ port: 0, hostname: '127.0.0.1', onProblem: (p) => problems.push(p), ...options })
  hosts.push(host)
  host.onStatus((s) => statuses.push(s))
  host.onMessage((m) => messages.push(m))
  const join = await vi.waitFor(() => {
    const waiting = statuses.find((s) => s.state === 'waiting')
    if (!waiting) throw new Error('not listening yet')
    return waiting.join
  })
  return { host, statuses, problems, messages, join, port: Number(new URL(join.url).port) }
}

// A proctor stand-in: a ws client that records what it receives
async function connect(port: number, options: { autoPong?: boolean } = {}): Promise<FakeProctor> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, options)
  clients.push(socket)
  const received: ToProctor[] = []
  let closed = false
  socket.on('message', (data) => received.push(JSON.parse(String(data))))
  socket.on('close', () => (closed = true))
  await new Promise((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })
  return {
    socket,
    received,
    isClosed: () => closed,
    send: (message: unknown) => socket.send(typeof message === 'string' ? message : JSON.stringify(message))
  }
}

// Connects and completes the handshake
async function pairWith(
  port: number,
  code: string,
  options: { autoPong?: boolean } = {}
): Promise<FakeProctor> {
  const proctor = await connect(port, options)
  proctor.send({ type: 'handshake', version: PROTOCOL_VERSION, code })
  await vi.waitFor(() => expect(proctor.received[0]).toEqual({ type: 'welcome' }))
  return proctor
}

const otherCode = (code: string): string => (code === '222222' ? '333333' : '222222')

describe('createLanHost', () => {
  describe('startup', () => {
    it('reports waiting with a join url and a 6-character room code once listening', async () => {
      const { join } = await start()
      expect(isRoomCode(join.code)).toBe(true)
      expect(join.url).toMatch(/^http:\/\/[\d.]+:\d+$/)
    })

    it('reports disconnected instead of throwing when the port is already in use', async () => {
      const { port } = await start()
      const statuses: PartnerStatus[] = []
      const second = createLanHost({ port, hostname: '127.0.0.1' })
      hosts.push(second)
      second.onStatus((s) => statuses.push(s))
      await vi.waitFor(() => expect(statuses[0]?.state).toBe('disconnected'))
    })
  })

  describe('pairing', () => {
    it('accepts a handshake with the right version and code: welcome, then connected', async () => {
      const { port, join, statuses } = await start()
      await pairWith(port, join.code)
      await vi.waitFor(() => expect(statuses.at(-1)).toEqual({ state: 'connected' }))
    })

    it('sends the last published view straight after welcome', async () => {
      const { host, port, join } = await start()
      host.send({ type: 'view', view })
      const proctor = await pairWith(port, join.code)
      await vi.waitFor(() => expect(proctor.received[1]).toEqual({ type: 'view', view }))
    })

    it('rejects a wrong code and closes the socket', async () => {
      const { port, join, statuses } = await start()
      const proctor = await connect(port)
      proctor.send({ type: 'handshake', version: PROTOCOL_VERSION, code: otherCode(join.code) })
      await vi.waitFor(() => expect(proctor.isClosed()).toBe(true))
      expect(proctor.received).toEqual([{ type: 'rejected', reason: 'Wrong pairing code' }])
      expect(statuses.some((s) => s.state === 'connected')).toBe(false)
    })

    it('rejects a different protocol version and closes the socket', async () => {
      const { port, join } = await start()
      const proctor = await connect(port)
      proctor.send({ type: 'handshake', version: PROTOCOL_VERSION + 1, code: join.code })
      await vi.waitFor(() => expect(proctor.isClosed()).toBe(true))
      expect(proctor.received[0]?.type).toBe('rejected')
    })

    it('closes a socket that sends no handshake within the time limit', async () => {
      const { port, problems } = await start({ handshakeTimeoutMs: 50 })
      const proctor = await connect(port)
      await vi.waitFor(() => expect(proctor.isClosed()).toBe(true))
      expect(problems).toHaveLength(1)
    })

    it('closes an unpaired socket that sends chat before a handshake', async () => {
      const { port, messages } = await start()
      const proctor = await connect(port)
      proctor.send({ type: 'chat', text: 'hi' })
      await vi.waitFor(() => expect(proctor.isClosed()).toBe(true))
      expect(messages).toEqual([])
    })

    it('a second valid proctor replaces the first, without reporting a disconnect', async () => {
      const { port, join, statuses } = await start()
      const first = await pairWith(port, join.code)
      const second = await pairWith(port, join.code)
      await vi.waitFor(() => expect(first.isClosed()).toBe(true))
      expect(second.isClosed()).toBe(false)
      expect(statuses.some((s) => s.state === 'disconnected')).toBe(false)
    })
  })

  describe('messages', () => {
    it('passes chat and typing from the paired proctor to onMessage', async () => {
      const { port, join, messages } = await start()
      const proctor = await pairWith(port, join.code)
      proctor.send({ type: 'typing', isTyping: true })
      proctor.send({ type: 'chat', text: '  Try 5 flips ' })
      await vi.waitFor(() =>
        expect(messages).toEqual([
          { type: 'typing', isTyping: true },
          { type: 'chat', text: 'Try 5 flips' }
        ])
      )
    })

    it('reports a malformed message with onProblem and keeps the connection', async () => {
      const { port, join, problems, messages } = await start()
      const proctor = await pairWith(port, join.code)
      proctor.send('{not json')
      proctor.send({ type: 'chat', text: 'still here' })
      await vi.waitFor(() => expect(messages).toEqual([{ type: 'chat', text: 'still here' }]))
      expect(problems).toHaveLength(1)
      expect(proctor.isClosed()).toBe(false)
    })

    it('drops send() while no proctor is paired, without throwing', async () => {
      const { host } = await start()
      expect(() => host.send({ type: 'view', view })).not.toThrow()
    })

    it('stops calling a listener after it unsubscribes', async () => {
      const { host, port, join, messages } = await start()
      const seen: ToParticipant[] = []
      const unsubscribe = host.onMessage((m) => seen.push(m))
      unsubscribe()
      const proctor = await pairWith(port, join.code)
      proctor.send({ type: 'chat', text: 'hi' })
      // start()'s own listener still hears it, so the unsubscribed one had the chance to
      await vi.waitFor(() => expect(messages).toHaveLength(1))
      expect(seen).toEqual([])
    })
  })

  describe('disconnects', () => {
    it('reports disconnected then waiting when the proctor closes', async () => {
      const { port, join, statuses } = await start()
      const proctor = await pairWith(port, join.code)
      proctor.socket.close()
      await vi.waitFor(() =>
        expect(statuses.slice(-2).map((s) => s.state)).toEqual(['disconnected', 'waiting'])
      )
    })

    it('terminates a proctor that stops answering pings', async () => {
      const { port, join, statuses } = await start({ heartbeatMs: 30 })
      const proctor = await pairWith(port, join.code, { autoPong: false })
      await vi.waitFor(() => expect(proctor.isClosed()).toBe(true))
      expect(statuses.some((s) => s.state === 'disconnected')).toBe(true)
    })

    it('keeps a proctor that answers pings, and re-sends the view as a heartbeat', async () => {
      const { host, port, join } = await start({ heartbeatMs: 30 })
      host.send({ type: 'view', view })
      const proctor = await pairWith(port, join.code)
      await vi.waitFor(() => expect(proctor.received.length).toBeGreaterThanOrEqual(5))
      expect(proctor.isClosed()).toBe(false)
    })

    it('close() shuts the server so the port can be reused', async () => {
      const { host, port, join } = await start()
      await pairWith(port, join.code)
      host.close()
      await host.closed
      const again = await start({ port })
      expect(again.port).toBe(port)
    })
  })

  describe('proctor page', () => {
    // A stand-in for out/renderer: the proctor page, the participant app, one asset, and a
    // file outside assets/ that must never be reachable
    let root: string
    let staticDir: string
    beforeAll(async () => {
      root = await mkdtemp(join(tmpdir(), 'cct-lanhost-'))
      staticDir = join(root, 'renderer')
      await mkdir(join(staticDir, 'assets'), { recursive: true })
      await writeFile(join(staticDir, 'proctor.html'), '<p>proctor</p>')
      await writeFile(join(staticDir, 'index.html'), '<p>participant</p>')
      await writeFile(join(staticDir, 'assets', 'proctor-abc.js'), 'console.log(1)')
      await writeFile(join(root, 'secret.txt'), 'secret')
    })
    afterAll(async () => {
      await rm(root, { recursive: true })
    })

    const get = async (port: number, path: string): Promise<Response> =>
      fetch(`http://127.0.0.1:${port}${path}`, { redirect: 'manual' })

    it('serves proctor.html at / and at /proctor.html', async () => {
      const { port } = await start({ staticDir })
      for (const path of ['/', '/proctor.html']) {
        const res = await get(port, path)
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toContain('text/html')
        expect(await res.text()).toBe('<p>proctor</p>')
      }
    })

    it('serves files from assets/ with their content type', async () => {
      const { port } = await start({ staticDir })
      const res = await get(port, '/assets/proctor-abc.js')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/javascript')
    })

    it('never serves the participant app or anything outside assets/', async () => {
      const { port } = await start({ staticDir })
      for (const path of ['/index.html', '/assets/missing.js', '/assets/..%2F..%2Fsecret.txt', '/secret.txt']) {
        expect((await get(port, path)).status).toBe(404)
      }
    })

    it('answers 404 for every page when there is no staticDir', async () => {
      const { port } = await start()
      expect((await get(port, '/')).status).toBe(404)
    })

    it('in dev, redirects to the Vite server with ?host set to this server', async () => {
      const { port } = await start({ staticDir, devServerUrl: 'http://localhost:5173' })
      const res = await get(port, '/')
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe(
        `http://localhost:5173/proctor.html?host=${encodeURIComponent(`127.0.0.1:${port}`)}`
      )
    })
  })
})
