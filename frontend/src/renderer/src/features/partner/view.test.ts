import { describe, it, expect } from 'vitest'
import type { RoundConfig, SessionData } from '../../../../shared/types'
import { initialSession } from '../cct/session'
import { startRound, flipCard } from '../cct/scoring'
import { buildView } from './view'

const config: RoundConfig = {
  roundIndex: 2,
  blockIndex: 1,
  isPractice: false,
  gainAmount: 10,
  lossAmount: 250,
  numberLossCards: 1,
  totalCards: 32,
  lossPositions: [7],
  rigged: false,
  lossOnFlipNum: null
}

const session: SessionData = {
  ...initialSession,
  phase: 'task',
  block: 'advised',
  roundConfigs: [config, config, config, config],
  roundResponses: [
    { roundIndex: 0, block: 'solo', flips: [], endReason: 'stopped', gainCardsFlipped: 3, trialScore: 30, roundScore: 30 },
    { roundIndex: 1, block: 'solo', flips: [], endReason: 'loss', gainCardsFlipped: 1, trialScore: -210, roundScore: -240 }
  ]
}

describe('buildView', () => {
  it('fills the header numbers from the session', () => {
    const view = buildView(session, null)
    expect(view).toMatchObject({ phase: 'task', block: 'advised', roundNumber: 3, totalRounds: 4, trialScore: -210 })
  })

  it('shows no round, break or chat when the Task page is not on screen', () => {
    expect(buildView(session, null)).toMatchObject({ betweenRounds: false, round: null, upcoming: null, chat: [] })
  })

  it('never includes the loss positions or rigging', () => {
    const round = flipCard(startRound(config, 0), 3, 100)
    const view = buildView(session, {
      round,
      betweenRounds: true,
      upcoming: { round: config, advice: { condition: 'risky', suggestedTotalFlips: 7 } },
      chat: []
    })
    // What actually goes over IPC and the network is the JSON
    const json = JSON.stringify(view)
    for (const key of ['lossPositions', 'rigged', 'lossOnFlipNum', 'lastEventAt']) {
      expect(json).not.toContain(key)
    }
    expect(view.round?.flips).toHaveLength(1)
    expect(view.upcoming?.advice.suggestedTotalFlips).toBe(7)
  })
})
