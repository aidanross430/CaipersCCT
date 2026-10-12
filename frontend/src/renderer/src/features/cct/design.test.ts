import { describe, it, expect } from 'vitest'
import { createRng, buildConditions, shuffle, placeLossCards, buildRoundConfigs } from './design'
import type { DesignConfig } from '../../../../shared/options'

// A fixed design for these tests, so they don't change when someone edits Design.config.json.
// Rigging is off, so every round is a plain one; rigging needs its own tests
const TEST_DESIGN: DesignConfig = {
  totalCards: 32,
  numRounds: 27,
  gainAmounts: [10, 20, 30],
  lossAmounts: [250, 500, 750],
  lossCardCounts: [1, 2, 3],
  repititionsPerCondition: 1,
  rigging: { roundsRigged: 0 }
}

// Draws n values from an rng
function draw(rng: () => number, n: number): number[] {
  return Array.from({ length: n }, () => rng())
}

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    expect(draw(createRng(42), 100)).toEqual(draw(createRng(42), 100))
  })

  it('produces different sequences for different seeds', () => {
    expect(draw(createRng(42), 100)).not.toEqual(draw(createRng(43), 100))
  })

  it('only yields values in [0, 1)', () => {
    const values = draw(createRng(1), 100_000)
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true)
  })

  it('is roughly uniform', () => {
    // 10 equal-width buckets should each get close to 10% of draws
    const n = 100_000
    const buckets = new Array(10).fill(0)
    for (const v of draw(createRng(7), n)) buckets[Math.floor(v * 10)]++
    for (const count of buckets) {
      expect(count / n).toBeGreaterThan(0.09)
      expect(count / n).toBeLessThan(0.11)
    }
  })

  it('treats seeds as unsigned 32-bit integers', () => {
    // -1 and 2^32 - 1 have the same 32-bit representation
    expect(draw(createRng(-1), 10)).toEqual(draw(createRng(2 ** 32 - 1), 10))
  })

  // Pins the generator's output. If this fails, the rng changed and every stored
  // designSeed will now rebuild a different design than participants actually saw.
  it('matches the recorded sequence for seed 12345', () => {
    expect(draw(createRng(12345), 5)).toMatchSnapshot()
  })
})

describe('buildConditions', () => {
  // Example minimal design config
  const small: DesignConfig = {
    ...TEST_DESIGN,
    gainAmounts: [10, 30],
    lossAmounts: [250, 750],
    lossCardCounts: [1, 3],
    repititionsPerCondition: 1
  }

  // key contains each possible combination of the provided gain, loss, and numberLoss
  const key = (c: { gainAmount: number; lossAmount: number; numberLossCards: number }): string =>
    `${c.gainAmount}/${c.lossAmount}/${c.numberLossCards}`

  it('returns gains x losses x loss counts x repetitions conditions', () => {
    const { gainAmounts, lossAmounts, lossCardCounts, repititionsPerCondition } = TEST_DESIGN
    const expected =
      gainAmounts.length * lossAmounts.length * lossCardCounts.length * repititionsPerCondition
    expect(buildConditions(TEST_DESIGN)).toHaveLength(expected)
  })

  it('includes every combination exactly once per repetition', () => {
    for (const reps of [1, 2, 3]) {
      const conditions = buildConditions({ ...small, repititionsPerCondition: reps })
      const counts = new Map<string, number>()
      for (const c of conditions) counts.set(key(c), (counts.get(key(c)) ?? 0) + 1)

      expect(counts.size).toBe(8)
      for (const count of counts.values()) expect(count).toBe(reps)
    }
  })

  it('only uses values from the config', () => {
    for (const c of buildConditions(small)) {
      expect(small.gainAmounts).toContain(c.gainAmount)
      expect(small.lossAmounts).toContain(c.lossAmount)
      expect(small.lossCardCounts).toContain(c.numberLossCards)
    }
  })

  it('returns conditions in a fixed order', () => {
    expect(buildConditions(small).map(key)).toEqual([
      '10/250/1',
      '10/250/3',
      '10/750/1',
      '10/750/3',
      '30/250/1',
      '30/250/3',
      '30/750/1',
      '30/750/3'
    ])
  })

  it('returns an empty list when any factor is empty or repetitions is 0', () => {
    expect(buildConditions({ ...small, gainAmounts: [] })).toEqual([])
    expect(buildConditions({ ...small, lossAmounts: [] })).toEqual([])
    expect(buildConditions({ ...small, lossCardCounts: [] })).toEqual([])
    expect(buildConditions({ ...small, repititionsPerCondition: 0 })).toEqual([])
  })
})

describe('shuffle', () => {
  const items = Array.from({ length: 20 }, (_, i) => i)

  it('does not modify the input array', () => {
    const input = [...items]
    shuffle(input, createRng(1))
    expect(input).toEqual(items)
  })

  it('returns a new array', () => {
    expect(shuffle(items, createRng(1))).not.toBe(items)
  })

  it('keeps the same items', () => {
    const result = shuffle(items, createRng(1))
    expect([...result].sort((a, b) => a - b)).toEqual(items)
  })

  it('produces the same order for the same seed', () => {
    expect(shuffle(items, createRng(99))).toEqual(shuffle(items, createRng(99)))
  })

  it('produces different orders for different seeds', () => {
    expect(shuffle(items, createRng(99))).not.toEqual(shuffle(items, createRng(100)))
  })

  it('handles empty and single-item arrays', () => {
    expect(shuffle([], createRng(1))).toEqual([])
    expect(shuffle(['a'], createRng(1))).toEqual(['a'])
  })

  it('reaches every permutation with roughly equal frequency', () => {
    // 4 items have 24 permutations; each should appear ~1/24 of the time
    const n = 48_000
    const rng = createRng(3)
    const counts = new Map<string, number>()
    for (let i = 0; i < n; i++) {
      const p = shuffle([1, 2, 3, 4], rng).join()
      counts.set(p, (counts.get(p) ?? 0) + 1)
    }
    expect(counts.size).toBe(24)
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(1600) // expected 2000
      expect(count).toBeLessThan(2400)
    }
  })

  it('shuffles conditions without losing any', () => {
    const conditions = buildConditions(TEST_DESIGN)
    const shuffled = shuffle(conditions, createRng(5))
    expect(shuffled).toHaveLength(conditions.length)
    expect(shuffled).toEqual(expect.arrayContaining(conditions))
  })
})

describe('placeLossCards', () => {
  it('returns exactly numberLossCards positions', () => {
    // every count from none to the whole grid, including the edges
    for (const numberLossCards of [0, 1, 2, 3, 16, 32]) {
      expect(placeLossCards(numberLossCards, 32, createRng(1))).toHaveLength(numberLossCards)
    }
  })

  it('all returned positions are different', () => {
    // many seeds, since a duplicate might only show up for some of them
    for (let seed = 0; seed < 1000; seed++) {
      const positions = placeLossCards(3, 32, createRng(seed))
      // a Set drops duplicates, so its size only matches if every position is distinct
      expect(new Set(positions).size).toBe(positions.length)
    }
  })

  it('numbers returned fall into the expected range', () => {
    for (let seed = 0; seed < 1000; seed++) {
      // makes sure no generated positions are less than 0 or more than 31
      for (const position of placeLossCards(3, 32, createRng(seed))) {
        expect(Number.isInteger(position)).toBe(true)
        expect(position).toBeGreaterThanOrEqual(0)
        expect(position).toBeLessThan(32)
      }
    }
  })

  it('the same seed provides the same positions', () => {
    expect(placeLossCards(3, 32, createRng(99))).toEqual(placeLossCards(3, 32, createRng(99)))
  })

  it('different seeds provide different positions', () => {
    expect(placeLossCards(3, 32, createRng(99))).not.toEqual(placeLossCards(3, 32, createRng(100)))
  })
})

describe('buildRoundConfig', () => {
  it('returns an array of round configs with correct number of rounds', () => {
    const rounds = buildRoundConfigs(TEST_DESIGN, 1)

    expect(Array.isArray(rounds)).toBe(true)
    expect(rounds.length).toEqual(TEST_DESIGN.numRounds)

    // every round has every RoundConfig field, with the right type.
    // expect.any(Number) matches any number, so this checks shape, not specific values
    for (const round of rounds) {
      expect(round).toEqual({
        roundIndex: expect.any(Number),
        isPractice: false,
        gainAmount: expect.any(Number),
        lossAmount: expect.any(Number),
        numberLossCards: expect.any(Number),
        totalCards: TEST_DESIGN.totalCards,
        lossPositions: expect.any(Array),
        rigged: false,
        lossOnFlipNum: null
      })
    }
  })

  it('round indexes are ordered correctly', () => {
    const rounds = buildRoundConfigs(TEST_DESIGN, 99)

    // pull out the indexes of the round in order and compare them to the expected order
    const indexes = rounds.map((round) => round.roundIndex)
    const expected = Array.from( {length: rounds.length}, (_, i) => i)

    expect(indexes).toEqual(expected)
  })

  it('each condition is unique when repitions=1', () => {
    const config = { ...TEST_DESIGN, repititionsPerCondition: 1}
    const rounds = buildRoundConfigs(config, 100)

    // Ensure each key created by the set of conditions is unique
    const keys = rounds.map((r) => `${r.gainAmount}/${r.lossAmount}/${r.numberLossCards}`)
    expect(new Set(keys).size).toBe(keys.length)    
  })

  it('identical seed gives identical result', () =>  {
    expect(buildRoundConfigs(TEST_DESIGN, 99)).toEqual(buildRoundConfigs(TEST_DESIGN, 99))
  })

  it('different seeds give different results', () => {
    expect(buildRoundConfigs(TEST_DESIGN, 99)).not.toEqual(buildRoundConfigs(TEST_DESIGN, 100))
  })
})