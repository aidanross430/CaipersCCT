import { describe, it, expect } from 'vitest'
import type { RoundConfig } from '../../../../shared/types'
import { getAdvice } from './advice'

// Fixed settings, so these tests don't change when someone edits Chat.config.json
const SETTINGS = { riskyFlips: 7, safeFlips: 7 }

const config: RoundConfig = {
  roundIndex: 0,
  blockIndex: 1,
  gainAmount: 20,
  lossAmount: 250,
  numberLossCards: 1,
  totalCards: 32,
  fillerLossPositions: [31],
  riggedLossFlip: null,
  roundType: 'filler'
}

describe('getAdvice (risky)', () => {
  it('suggests the optimal number of flips plus riskyFlips', () => {
    // optimal for 1 loss card in 32 is ceil(32 / 2) = 16
    expect(getAdvice(config, 'risky', SETTINGS).suggestedTotalFlips).toBe(16 + 7)
  })

  it('never suggests turning over every gain card', () => {
    const advice = getAdvice(config, 'risky', { ...SETTINGS, riskyFlips: 100 })
    expect(advice.suggestedTotalFlips).toBe(config.totalCards - config.numberLossCards - 1)
  })

  it('records the advice condition', () => {
    expect(getAdvice(config, 'risky', SETTINGS).condition).toBe('risky')
  })
})
