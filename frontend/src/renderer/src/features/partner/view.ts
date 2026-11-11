import type { Advice, ChatMessage, RoundConfig, SessionData } from '../../../../shared/types'
import type { LiveRound, ProctorView, PublicRoundConfig } from '../../../../shared/partner/protocol'

// What the Task page adds to the view while it's on screen. Null on every other page
export type LiveTask = {
  round: LiveRound | null                         // Task's RoundState fits (it has more fields)
  betweenRounds: boolean
  upcoming: { round: RoundConfig; advice: Advice } | null
  chat: ChatMessage[]                             // this break's messages
}

// Builds the snapshot sent to the proctor. Every round and config is copied field by field
// rather than spread: RoundState and RoundConfig carry the loss positions and rigging, and a
// spread would send those too, since TypeScript only checks fields are present, not absent
export function buildView(session: SessionData, live: LiveTask | null): ProctorView {
  return {
    phase: session.phase,
    block: session.block,
    // 1-based, as the participant sees it: the round being played, or the one after the break
    roundNumber: session.roundResponses.length + 1,
    totalRounds: session.roundConfigs.length,
    trialScore: session.roundResponses.at(-1)?.trialScore ?? 0,
    betweenRounds: live?.betweenRounds ?? false,
    round: live?.round ? toLiveRound(live.round) : null,
    upcoming: live?.upcoming
      ? { round: toPublicConfig(live.upcoming.round), advice: live.upcoming.advice }
      : null,
    chat: live?.chat ?? []
  }
}

export function toLiveRound(round: LiveRound): LiveRound {
  return {
    config: toPublicConfig(round.config),
    flips: round.flips,
    roundScore: round.roundScore,
    roundEnded: round.roundEnded,
    endReason: round.endReason
  }
}

export function toPublicConfig(config: PublicRoundConfig): PublicRoundConfig {
  return {
    roundIndex: config.roundIndex,
    blockIndex: config.blockIndex,
    gainAmount: config.gainAmount,
    lossAmount: config.lossAmount,
    numberLossCards: config.numberLossCards,
    totalCards: config.totalCards
  }
}
