// In charge of calculating the flips that should be provided to the user according
// to the chosen advice policy

import type { Advice, AdviceCondition, RoundConfig } from '../../../../shared/types'
import type { ChatConfig } from '../../../../shared/options'
import type { RoundState } from '../cct/scoring'

// The parts of Chat.config.json the advice uses
export type AdviceSettings = Pick<ChatConfig, 'riskyFlips' | 'safeFlips'>

// Calculates the best number of flips for this round
function findOptimalFlips(round: RoundConfig): number {
    const {totalCards: totalCards, numberLossCards: numLossCards} = round
    const optimalFlips = Math.ceil(totalCards / (numLossCards + 1))         // Simplified expression for optimal card number
    return  Math.min(Math.max(optimalFlips, 0), totalCards-numLossCards)    // Don't recommend less than zero flips or more than amount of gain cards
}

// Adds a static number of flips to the optimal amount and suggests that
function riskyTotalFlips(round: RoundConfig, riskyFlips: number): number {
    const { totalCards: totalCards, numberLossCards: numLossCards } = round
    // Don't suggest more than the maximum number of cards
    return Math.min(findOptimalFlips(round) + riskyFlips, (totalCards - numLossCards - 1))
}

// TODO: add safe and optimal conditions (might just move that logic into getAdvice)

export function getAdvice(state: RoundState, condition: AdviceCondition, settings: AdviceSettings): Advice {
    // TODO: add safe and optimal conditions.
    const suggestedTotalFlips = riskyTotalFlips(state.config, settings.riskyFlips)
    const flipsSoFar = state.flips.length
    // Risky advice always says to keep flipping, even past the suggested total. Other
    // conditions suggest flipping until the suggested total, then stopping
    const action = condition === 'risky' || flipsSoFar < suggestedTotalFlips ? 'flip' : 'stop'
    return {
        condition,
        suggestedTotalFlips,
        flipsSoFar,
        action
    }
}