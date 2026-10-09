// Handles the logic for scoring each trial. A question that will need
// to be answered is when scoring happens. For now, following Inquisit's
// CCT rules

import { CardFlip, RoundConfig, RoundEndReason, RoundResponse } from '../../../../shared/types';

export type RoundState = {
    config: RoundConfig
    flips: CardFlip[]
    roundScore: number
    roundEnded: boolean
    endReason: RoundEndReason | null
    lastEventAt: number     // ms timestamp of the round start or the most recent flip
}

// Timestamps (now) are passed in rather than read inside these functions so they stay
// pure and tests can control timing. The task page should pass performance.now().

// now should be the moment the cards become clickable, so the first flip's time
// doesn't include rendering or any between-round screen
export function startRound(config: RoundConfig, now: number): RoundState {
    return {
        config,
        flips: [],
        roundScore: 0,
        roundEnded: false,
        endReason: null,
        lastEventAt: now
    }
}

// Determines whether the card flipped was a gain or a loss
export function resolveFlip(config: RoundConfig, cardPosition: number, flipsSoFar: number): 'gain' | 'loss' {
    // Throw an error if the round is rigged
    if (config.rigged) {
        throw new Error(`Rigged rounds are not implemented yet (round ${config.roundIndex})`)
    }
    // Check the card position against the Round's loss positions
    return config.lossPositions.includes(cardPosition) ? 'loss' : 'gain'
}

// Processes everything that happened when a user flips over a card
export function flipCard(state: RoundState, cardPosition: number, now: number): RoundState {
    // A position outside the grid can't come from a real click, so it's a bug: throw
    if (!Number.isInteger(cardPosition) || cardPosition < 0 || cardPosition >= state.config.totalCards) {
        throw new Error(`Card position ${cardPosition} is outside the grid (0-${state.config.totalCards - 1})`)
    }
    // Clicks a participant can actually make but that shouldn't count (a double-click,
    // clicking after the round ended) are ignored: return the same state, unchanged
    if (state.roundEnded) return state
    if (state.flips.some((f) => f.cardPosition === cardPosition)) return state

    // Process what happened during the flip
    const flipsSoFar = state.flips.length
    const outcome = resolveFlip(state.config, cardPosition, flipsSoFar)
    const roundScore =
        outcome === 'gain' ? state.roundScore + state.config.gainAmount : state.roundScore - state.config.lossAmount

    // is the round over? (All gains flipped or loss card flipped)
    const gainsFlipped = state.flips.filter((f) => f.outcome === 'gain').length + (outcome === 'gain' ? 1 : 0)
    const allGainsRevealed = gainsFlipped === state.config.totalCards - state.config.numberLossCards

    let endReason: RoundEndReason | null = null
    if (outcome === 'loss') endReason = 'loss'
    else if (allGainsRevealed) endReason = 'allGainsRevealed'
    // else if end button?

    // Build out the new cardflip object
    const flip: CardFlip = {
        flipIndex: flipsSoFar+1,
        cardPosition,
        outcome,
        roundScoreAfterFlip: roundScore,
        msSincePreviousFlip: now - state.lastEventAt
    }

    return {
        ...state,
        flips: [...state.flips, flip],
        roundScore,
        roundEnded: endReason !== null,
        endReason,
        lastEventAt: now
    }
}

// Ends the currect round
export function stopRound(state: RoundState): RoundState {
    if (state.roundEnded) return state

    return {
        ...state,
        roundEnded: true,
        endReason: 'stopped'
    }
}

// Converts a completed round state into a RoundResponse.
export function toRoundResponse(state: RoundState, trialScoreBefore: number): RoundResponse {
    // Error if the round isn't finished
    if (!state.roundEnded || state.endReason === null) {
        throw new Error(`Round ${state.config.roundIndex} is not over yet.`)
    }

    // Final value calculations
    const gainCardsFlipped = state.flips.filter((f) => f.outcome === 'gain').length
    const trialScore = state.config.isPractice ? trialScoreBefore : trialScoreBefore + state.roundScore

    // return the round response
    return {
        roundIndex: state.config.roundIndex,
        flips: state.flips,
        endReason: state.endReason,
        gainCardsFlipped,
        roundScore: state.roundScore,
        trialScore
    }
}