// Holds the logic for the creating each trials design -

import type { RoundConfig, TrialConfig } from '../../../../shared/types'
import type { DesignConfig } from './design.config'

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

// Every gain x loss x loss-card-count combination, repeated repitionsPerCondition times.
// Order is deterministic (not shuffled); shuffling happens in buildRoundConfigs.
export function buildConditions(config: DesignConfig): Condition[] {
  const conditions: Condition[] = []
  for (let rep = 0; rep < config.repititionsPerCondition; rep++) {
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

// If wanted, rigged rounds that prevent data censorship
export function assignRigging(rounds: RoundConfig[], config: DesignConfig, rng: () => number): RoundConfig[] {
  // randomly pick rounds to be rigged. The indexes of these rounds are stored in the roundIndexes array
  const riggedIndexes = new Set(shuffle(rounds.map((_, i) => i), rng).slice(0, config.rigging.roundsRigged))

  return rounds.map((round, i) => 
    // Iterate through each round, and rig any rounds whose indexes match riggedIndexes
    riggedIndexes.has(i)
    ? {
      ...round,
      rigged: true,
      lossOnFlipNum: round.totalCards - round.numberLossCards,  // A rigged match has the loss card on the last possible flip
      lossPositions: []
    }
    : round
  )
}

// Make sure the provided round configs make sense
// export function validateRoundConfig() {

// }

export function buildRoundConfigs(config: DesignConfig, seed: number): RoundConfig[] {
    // TODO: Validate that the config makes sense

    // Create an rng
    const rng = createRng(seed)
    // Build condition array and shuffle it so each condition appears randomly
    const conditions = shuffle(buildConditions(config), rng)

    // Build the conditon array that is indexed with loss cards placed.
    const rounds = conditions.map((condition, i) => ({
        roundIndex: i,
        isPractice: false,
        ...condition,
        totalCards: config.totalCards,
        lossPositions: placeLossCards(condition.numberLossCards, config.totalCards, rng),
        rigged: false,
        lossOnFlipNum: null
    }))

    // Assign the rounds that are supposed to be rigged. Return the array
    return assignRigging(rounds, config, rng)
}