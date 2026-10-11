import { describe, it, expect } from 'vitest'
import type { RoundConfig } from '../../../../shared/types'
import { getAdvice } from './advice'
import { startRound, flipCard, type RoundState } from '../cct/scoring'

const config: RoundConfig = {
  roundIndex: 0,
  isPractice: false,
  gainAmount: 20,
  lossAmount: 250,
  numberLossCards: 1,
  totalCards: 32,
  lossPositions: [31], // the last card, so flipping 0..30 is always safe in these tests
  rigged: false,
  lossOnFlipNum: null
}

function roundWithFlips(n: number): RoundState {
  let state = startRound(config, 0)
  for (let i = 0; i < n; i++) state = flipCard(state, i, i + 1)
  return state
}

describe('getAdvice (risky)', () => {
  it('says to flip before reaching the suggested total', () => {
    expect(getAdvice(roundWithFlips(0), 'risky').action).toBe('flip')
  })

  it('still says to flip at and past the suggested total', () => {
    const total = getAdvice(roundWithFlips(0), 'risky').suggestedTotalFlips
    expect(getAdvice(roundWithFlips(total), 'risky').action).toBe('flip')
    expect(getAdvice(roundWithFlips(total + 2), 'risky').action).toBe('flip')
  })

  it('keeps the same suggested total throughout the round', () => {
    const total = getAdvice(roundWithFlips(0), 'risky').suggestedTotalFlips
    expect(getAdvice(roundWithFlips(5), 'risky').suggestedTotalFlips).toBe(total)
  })
})
