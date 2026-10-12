// In charge of constructing the prompt that is given to the AI each time the user
// sends a message

import type { Advice, ChatMessage } from '../../../../shared/types'
import type { ChatRequest, ChatTurn } from '../../../../shared/ipc'
import type { Options, Persona, PromptPlaceholder } from '../../../../shared/options'
import type { RoundState } from '../cct/scoring'




// Stops the entire session's chat history from accumulating in the prompt.
const MAX_HISTORY = 20

export type PromptInput = {
    persona: Persona
    displayCondition: 'human' | 'ai'
    advice: Advice
    round: RoundState
    totalScore: number
    history: ChatMessage[]
    prompts: Options['prompts']     // the templates from Options/
}

export function buildPrompt(input: PromptInput): ChatRequest {
    const { persona, displayCondition, advice, round, totalScore, history, prompts } = input

    // Merges the information needed by each prompt with the relevant round information
    // This array needs to include everything the AI should be able to answer
    // Typed against PROMPT_PLACEHOLDERS, so this list and the one the loader checks
    // templates against can't drift apart
    const values: Record<PromptPlaceholder, string | number> = {
        partnerName: persona.name,
        roundNumber: round.config.roundIndex + 1,   // 1-based, as participants see it
        gainAmount: round.config.gainAmount,
        lossAmount: round.config.lossAmount,
        numberLossCards: round.config.numberLossCards,
        totalCards: round.config.totalCards,
        flipsSoFar: advice.flipsSoFar,
        roundScore: round.roundScore,
        totalScore: totalScore,
        suggestedTotalFlips: advice.suggestedTotalFlips,
        adviceText: adviceText(advice)
    }

    const identity = displayCondition === 'human' ? prompts.identityHuman : prompts.identityAi
    const system = [identity, prompts.style, prompts.rules, prompts.situation]
        .map((template) => fillTemplate(template,values))
        .join('\n\n')

        return {system, messages: toTurns(history, round.config.roundIndex)}
}

// Takes in markdown text and fills in the fields with the provided values.
// HTML comments (<!-- ... -->) are notes for researchers and are removed first, so they're
// never sent to the model
function fillTemplate(template: string, values: Record<string, string | number>): string {
  const withoutComments = template.replace(/<!--[\s\S]*?-->/g, '')
  const filled = withoutComments.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (!(key in values)) throw new Error(`Prompt template uses unknown placeholder {{${key}}}`)
    return String(values[key])
  })
  if (filled.includes('{{') || filled.includes('}}')) {
    throw new Error('Prompt template has a malformed placeholder')
  }
  return filled.trim()
}

// Provides a template 'action' for the participant to take based on the flips
// The advice as an instruction to the model. Past the suggested total, risky advice still
// says to keep going, so there's no number left to give: just "another card"
function adviceText(advice: Advice): string {
  const { suggestedTotalFlips: total, flipsSoFar } = advice
  if (advice.action === 'stop') return 'tell them to stop now and keep their points'
  if (flipsSoFar === 0) return `tell them to go for about ${total} cards this round`
  if (flipsSoFar < total) {
    return `tell them to keep going, about ${total - flipsSoFar} more, for about ${total} cards in total this round`
  }
  return 'tell them to keep going and turn over another card'
}

// Converts the chat history into a format useable by the LLM
// Only the current round's messages are sent. Each round has new cards, point values and
// advice, so earlier rounds' numbers would only tempt the model to compare or "correct"
// itself; leaving them out also keeps every round's advice delivered the same way
function toTurns(history: ChatMessage[], roundIndex: number): ChatTurn[] {
  const thisRound = history.filter((m) => m.roundIndex === roundIndex)
  const turns: ChatTurn[] = thisRound.slice(-MAX_HISTORY).map((m) => ({
    role: m.sender === 'participant' ? 'user' : 'assistant',
    content: m.text
  }))
  // The API requires the conversation to start with a user turn. Trimming can leave a
  // partner message first, so drop any leading ones
  while (turns.length > 0 && turns[0].role === 'assistant') turns.shift()
  return turns
}
