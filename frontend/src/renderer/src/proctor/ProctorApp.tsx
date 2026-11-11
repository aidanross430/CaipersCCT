import type { JSX } from 'react'
import { PROTOCOL_VERSION } from '../../../shared/partner/protocol'

// Where the page's WebSocket will connect. Served by the participant app, that's the server the
// page came from. In `npm run dev` the page comes from the Vite dev server instead, so lanHost
// redirects here with ?host=<lanHost's address> to say where the real server is
function partnerSocketUrl(): string {
  const host = new URLSearchParams(location.search).get('host') || location.host
  return `ws://${host}`
}

// For now just proves the page is built and served. Next: the pairing form and live view
export default function ProctorApp(): JSX.Element {
  return (
    <main className="trial">
      <h1>Hello, proctor</h1>
      <p>This page was served from {location.host}.</p>
      <p>
        It will connect to <code>{partnerSocketUrl()}</code> using protocol version {PROTOCOL_VERSION}.
      </p>
    </main>
  )
}
