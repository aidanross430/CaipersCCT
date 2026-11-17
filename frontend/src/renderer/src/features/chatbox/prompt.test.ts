import { describe, it, expect } from 'vitest'
import type { RoundConfig } from '../../../../shared/types'
import { buildPrompt, type PromptInput } from './prompt'

const round: RoundConfig = {
  roundIndex: 0,
  blockIndex: 1,
  gainAmount: 10,
  lossAmount: 250,
  numberLossCards: 1,
  totalCards: 32,
  fillerLossPositions: [],
  riggedLossFlip: 32,
  roundType: 'rigged'
}

const input: PromptInput = {
  persona: { name: 'Pat', avatar: 'P' },
  perceivedPartner: 'ai',
  advice: { condition: 'risky', suggestedTotalFlips: 23 },
  upcomingRound: round,
  totalScore: 0,
  history: [],
  prompts: {
    styleHuman: 'HUMAN STYLE for {{partnerName}}',
    styleAi: 'AI STYLE for {{partnerName}}',
    rules: 'RULES',
    situation: 'SITUATION'
  }
}

describe('buildPrompt style', () => {
  it('uses style.human.md when the participant is told their partner is a person', () => {
    const { system } = buildPrompt({ ...input, perceivedPartner: 'human' })
    expect(system).toContain('HUMAN STYLE for Pat')
    expect(system).not.toContain('AI STYLE')
  })

  it('uses style.ai.md when the participant is told their partner is an AI', () => {
    const { system } = buildPrompt({ ...input, perceivedPartner: 'ai' })
    expect(system).toContain('AI STYLE for Pat')
    expect(system).not.toContain('HUMAN STYLE')
  })

  it('keeps the style first, then the rules and situation', () => {
    expect(buildPrompt(input).system).toBe('AI STYLE for Pat\n\nRULES\n\nSITUATION')
  })
})
