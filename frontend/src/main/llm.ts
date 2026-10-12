import Anthropic from '@anthropic-ai/sdk'
import type { ChatRequest, ChatResult } from '../shared/ipc'

// The preferred model for a response
const MODEL = 'claude-opus-5-5'

// The key from Options/api-key.txt, set once at startup. If it's null, the SDK falls back to
// the ANTHROPIC_API_KEY environment variable
let apiKey: string | null = null
export function setApiKey(key: string | null): void {
  apiKey = key
  client = null // build the next client with the new key
}

let client: Anthropic | null = null
// Created on first use, not at startup: the constructor throws if no key is available at
// all, and that should surface as a failed reply (shown and logged), not stop the app
function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: apiKey ?? undefined, timeout: 8_000, maxRetries: 1 }) // timeout is in ms
  return client
}

export async function chatReply(req: ChatRequest): Promise<ChatResult> {
    const started = Date.now()
    const response = await getClient().beta.messages.create({
        model: MODEL,
        max_tokens: 16000,                  // reduce to minimize cost
        output_config: { effort: 'low' }, // short, casual replies don't need deep reasoning
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default', // if the model declines, the API retries on another model
        system: req.system,
        messages: req.messages
    })

    if (response.stop_reason === 'refusal') throw new Error('Model declined to reply')
    const text = response.content
        .flatMap((b) => (b.type === 'text' ? [b.text] : []))
        .join('')
        .trim()
    if (!text) throw new Error('Empty reply')

    return { 
        text,
        model: response.model,
        latencyMs: Date.now() - started,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens
    }
}
