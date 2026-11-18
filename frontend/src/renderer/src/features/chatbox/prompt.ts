// In charge of constructing the prompt that is given to the AI each time the user
// sends a message

import type { Advice, ChatMessage, RoundConfig, TrialConfig } from '../../../../shared/types'
import type { ChatRequest, ChatTurn } from '../../../../shared/ipc'
import type { Options, Persona, PromptPlaceholder } from '../../../../shared/options'




// Stops the entire session's chat history from accumulating in the prompt.
const MAX_HISTORY = 20

// Where the participant is in the round being played, when they sent their message. The chat
// is open mid-round, so the partner should know how far they've got, whatever the advice is
export type RoundProgress = {
    cardsTurned: number             // cards turned over so far this round
    roundScore: number              // points this round so far
}

export type PromptInput = {
    persona: Persona
    perceivedPartner: TrialConfig['perceivedPartner']  // picks the style template
    advice: Advice
    round: RoundConfig              // the round being played
    totalScore: number              // total from earlier rounds
    progress: RoundProgress
    history: ChatMessage[]
    prompts: Options['prompts']     // the templates from Options/
}

export function buildPrompt(input: PromptInput): ChatRequest {
    const { persona, perceivedPartner, advice, round, totalScore, progress, history, prompts } = input

    // Only the LLM path builds a prompt, so this is the perceived-partner choice for an LLM
    // partner: sound like a person when participants are told it's a person, like an AI otherwise
    const style = perceivedPartner === 'human' ? prompts.styleHuman : prompts.styleAi

    // Merges the information needed by each prompt with the relevant round information
    // This array needs to include everything the AI should be able to answer
    // Typed against PROMPT_PLACEHOLDERS, so this list and the one the loader checks
    // templates against can't drift apart
    const values: Record<PromptPlaceholder, string | number> = {
        partnerName: persona.name,
        roundNumber: round.roundIndex + 1,   // 1-based, as participants see it
        gainAmount: round.gainAmount,
        lossAmount: round.lossAmount,
        numberLossCards: round.numberLossCards,
        totalCards: round.totalCards,
        totalScore: totalScore,
        cardsTurned: progress.cardsTurned,
        roundScore: progress.roundScore,
        suggestedTotalFlips: advice.suggestedTotalFlips,
        adviceText: adviceText(advice)
    }

    const system = [style, prompts.rules, prompts.situation]
        .map((template) => fillTemplate(template,values))
        .join('\n\n')

        return {system, messages: toTurns(history, round.roundIndex)}
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

// The advice as an instruction to the model
function adviceText(advice: Advice): string {
  return `tell them to go for about ${advice.suggestedTotalFlips} cards in total this round`
}

// Converts the chat history into a format useable by the LLM
// Only this round's messages are sent. Each round has new cards, point values and
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
