import { describe, it } from 'vitest'

// These run a real relay on port 0 (any free port) and connect real `ws` clients to
// 127.0.0.1, in the style of the participant app's lanHost.test.ts. Short timings are passed
// through the config so heartbeat and timeout cases don't wait seconds

describe('createRelayServer', () => {
  describe('http', () => {
    it.todo('answers GET /health with 200')
    it.todo('answers any other path with 404')
  })

  describe('hello', () => {
    it.todo('accepts a participant hello: ready with peerPresent false')
    it.todo('pairs a proctor: ready with peerPresent true, participant gets peer joined')
    it.todo('refuses a bad token, then closes')
    it.todo('refuses a version mismatch')
    it.todo('refuses a malformed first frame as bad-hello')
    it.todo('closes a socket that sends no hello within helloTimeoutMs')
  })

  describe('forwarding', () => {
    it.todo('forwards data frames both ways, byte for byte')
    it.todo('drops data while there is no peer')
    it.todo('closes a socket that sends a second hello')
    it.todo('refuses frames over MAX_FRAME_BYTES')
  })

  describe('presence', () => {
    it.todo('tells the peer when a member leaves')
    it.todo('lets a participant reconnect with the same claim, replacing the old socket silently')
    it.todo('terminates a socket that stops answering pings')
  })

  describe('close', () => {
    it.todo('terminates every socket and releases the port')
  })
})
