// For now, this holds default behaviors for the trial as a whole.
// Ideally, this should be changed into a json file that could be loaded
// at runtime.


export type DesignConfig = {
  totalCards: number                 // 32
  numRounds: number
  gainAmounts: number[]              // e.g. [10, 20, 30] 
  lossAmounts: number[]              // e.g. [250, 500, 750]
  lossCardCounts: number[]           // e.g. [1, 2, 3]
  repititionsPerCondition: number
  // practiceRounds: Omit<RoundConfig, 'roundIndex'>[]   // listed explicitly, not generated
  rigging: {
    roundsRigged: number             
  }
}

export const DEFAULT_DESIGN: DesignConfig = {
  totalCards: 32,
  numRounds: 27,
  gainAmounts: [10, 20, 30],
  lossAmounts: [250, 500, 750],
  lossCardCounts: [1, 2, 3],
  repititionsPerCondition: 1,
  rigging: {
    roundsRigged: 27,
  }
}