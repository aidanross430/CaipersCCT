// Entry point: read the environment, start the server, and shut down cleanly when the host
// stops the container (SIGTERM) or on Ctrl+C in `npm run dev` (SIGINT)
import { ConfigError, readConfig, type RelayConfig } from './config'
import { log } from './log'
import { createRelayServer } from './server'

let config: RelayConfig
try {
  config = readConfig(process.env)
} catch (err) {
  const problems = err instanceof ConfigError ? err.problems : [(err as Error).message]
  console.error(`The relay can't start:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
  process.exit(1)
}

const server = createRelayServer(config)
log('listening', { port: await server.port, host: config.host, maxRooms: config.maxRooms })

let stopping = false
const stop = async (signal: string): Promise<void> => {
  if (stopping) return
  stopping = true
  log('stopping', { signal })
  await server.close()
  process.exit(0)
}
process.on('SIGTERM', () => void stop('SIGTERM'))
process.on('SIGINT', () => void stop('SIGINT'))
