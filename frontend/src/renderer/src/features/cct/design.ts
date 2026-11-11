// Holds the logic for the creating each trials design -

import type { RoundConfig } from '../../../../shared/types'
import type { DesignConfig } from '../../../../shared/options'

// two blocks, one where the user plays solo and one where they are given advice between rounds
export const NUM_BLOCKS = 2

// The parts of a round that come from the factorial design (gain x loss x number of loss cards)
export type Condition = Pick<RoundConfig, 'gainAmount' | 'lossAmount' | 'numberLossCards'>

// Seeded random number generator (mulberry32). Returns a function that yields floats in [0, 1).
// The same seed always produces the same sequence, so a participant's design can be rebuilt
// from the designSeed stored in their TrialConfig.
export function createRng(seed: number): () => number {
  let state = seed >>> 0 // force to an unsigned 32-bit integer
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Every gain x loss x loss-card-count combination, repeated repititionsPerConditionPerBlock times.
// Order is deterministic (not shuffled); shuffling happens in buildRoundConfigs.
export function buildConditions(config: DesignConfig): Condition[] {
  const conditions: Condition[] = []
  for (let rep = 0; rep < config.repititionsPerConditionPerBlock; rep++) {
    for (const gainAmount of config.gainAmounts) {
      for (const lossAmount of config.lossAmounts) {
        for (const numberLossCards of config.lossCardCounts) {
          conditions.push({ gainAmount, lossAmount, numberLossCards })
        }
      }
    }
  }
  return conditions
}

// Randomizes the order of the conditions built using buildConditions.
// Takes in both the condition array returned by buildConditions and the rng
// function in order to create a reproducable order of events. 
export function shuffle<T>(items: T[], rng: () => number): T[] {
  // Fisher Yates shuffle on provided array of general type T.
  // Copies first so the caller's array keeps its original order.
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    // pick a random index from the unshuffled portion [0, i], inclusive
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}


// Given how many loss cards there should be and how many total cards there are,
// provide three random positions for the loss cards (sorted)
export function placeLossCards(numberLossCards: number, totalCards: number, rng: ()=> number): number[] {
    // build an array of the 0-indexed positions of each card
    const positions = Array.from(
        {length: totalCards}, (_, i) => i
    )
    // shuffle that array and take the first numberLossCards values, sorted
    return shuffle(positions, rng).slice(0, numberLossCards).sort((a, b) => a-b)
}


// Extra features I plan on later 

// function buildPracticeRounds(config: TrialConfig): RoundConfig[] {
// }

// All rounds EXCEPT filler rounds should be rigged. A rigged round has no fixed loss positions:
// whichever card is turned on flip riggedLossFlip is the loss, and every other card is a gain.
// The loss flip is picked at random from the last riggedLossCardWindow flips it could fall on
export function assignRigging(rounds: RoundConfig[], config: DesignConfig, rng: () => number): RoundConfig[] {
  return rounds.map((round) => {
    // The latest flip a loss can be on: right after all (totalCards - numberLossCards) gain cards
    const lastPossibleFlip = round.totalCards - round.numberLossCards + 1
    return {
      ...round,
      roundType: 'rigged',
      // one of lastPossibleFlip - (riggedLossCardWindow - 1) ... lastPossibleFlip, each equally likely
      riggedLossFlip: lastPossibleFlip - Math.floor(rng() * config.riggedLossCardWindow),
      fillerLossPositions: []
    }
  })
}

// Creates numFillerRoundsPerBlock non-rigged filler rounds for one block and disperses them
// randomly among that block's rigged rounds.
// The round's conditions are randomly selected from the possible conditions
// The loss card for filler rounds are randomly selected among the 32 cards
export function buildFillerRounds(
  config: DesignConfig,
  rounds: RoundConfig[],
  blockIndex: number,
  rng: () => number
): RoundConfig[] {
  // picks one item from a list using the seeded rng
  const pick = <T,>(items: T[]): T => items[Math.floor(rng() * items.length)]

  const fillers = Array.from({ length: config.numFillerRoundsPerBlock }, (): RoundConfig => {
    const numberLossCards = pick(config.lossCardCounts)
    return {
      roundIndex: 0, // temp value, set once the blocks are joined in buildRoundConfigs
      blockIndex,
      gainAmount: pick(config.gainAmounts),
      lossAmount: pick(config.lossAmounts),
      numberLossCards,
      totalCards: config.totalCards,
      fillerLossPositions: placeLossCards(numberLossCards, config.totalCards, rng),
      riggedLossFlip: null,
      roundType: 'filler'
    }
  })

  // Shuffle the filler rounds in with the rigged rounds so they can land anywhere in the block
  return shuffle([...rounds, ...fillers], rng)
}

// Make sure the provided round configs make sense
// export function validateRoundConfig() {

// }

export function buildRoundConfigs(config: DesignConfig, seed: number): RoundConfig[] {
    // Create an rng
    const rng = createRng(seed)
    // Build condition array and shuffle it so each condition appears randomly
    const conditions = shuffle(buildConditions(config), rng)

    // Each block gets its own array: every condition once per repetition (all rigged),
    // plus that block's filler rounds dispersed among them
    const blocks = Array.from({ length: NUM_BLOCKS }, (_, blockIndex) => {
      const rounds = shuffle(conditions, rng).map((condition): RoundConfig => ({
        roundIndex: 0, // temp value before blocks are joined in this functions return
        blockIndex,
        ...condition,
        totalCards: config.totalCards,
        fillerLossPositions: [], // rigged rounds don't use loss positions; assignRigging sets the loss flip
        riggedLossFlip: null,
        roundType: 'rigged'
      }))
      return buildFillerRounds(config, assignRigging(rounds, config, rng), blockIndex, rng)
    })

    return blocks.flat().map((round, i) => ({
      ...round,
      roundIndex: i
    }))
}
