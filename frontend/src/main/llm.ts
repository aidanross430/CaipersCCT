import Anthropic from '@anthropic-ai/sdk'
import type { ChatRequest, ChatResult } from '../shared/ipc'

// The preferred model for a response
const MODEL = 'claude-opus-5-5'

let client: Anthropic | null = null
// Created on first use, not at startup: the constructor throws if no API key is configured,
// and the task must still run (on fallback replies) without one
function getClient(): Anthropic {
  client ??= new Anthropic({ timeout: 8_000, maxRetries: 1 }) // timeout is in ms
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
