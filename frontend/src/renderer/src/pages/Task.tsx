import { useEffect, useState, type JSX } from 'react'
import { useSession } from '../state/SessionContext'
import ChatPanel from '../components/chat/ChatPanel'
import Round from '../components/Round'
import { useChat } from '../features/chatbox/useChat'
import { getAdvice } from '../features/chatbox/advice'
import { useOptions } from '../state/optionsContext'
import {
  flipCard,
  startRound,
  stopRound,
  toRoundResponse,
  type RoundState
} from '../features/cct/scoring'

// The task page. It owns the state of the round being played, so anything else on the page
// (the chat panel, later) can read the same round the card grid shows
export default function Task(): JSX.Element | null {
  const { session, completeRound, finishSession, completeBlock, saveMessage, setLiveTask } = useSession()
  // The advised block opens on the break screen too, so the chat is available before its first round
  const [betweenRounds, setBetweenRounds] = useState(session.block === 'advised')

  // The current round is the first one without a response
  const roundNumber = session.roundResponses.length
  const config = session.roundConfigs[roundNumber]
  const totalRounds = session.roundConfigs.length
  const isLastRound = roundNumber === totalRounds - 1
  const trialScoreBefore = session.roundResponses.at(-1)?.trialScore ?? 0

  // The round being played. The first solo round starts when the page first renders; every
  // other round starts when the participant leaves the break screen before it
  const [round, setRound] = useState<RoundState | null>(() =>
    config && !betweenRounds ? startRound(config, performance.now()) : null
  )

  // The chat lives here (not on the break screen) so the conversation state carries over
  // between rounds. Hooks have to run before the early returns below
  const { chat: chatConfig, prompts } = useOptions()
  const persona = chatConfig.personas[session.trialConfig.partnerType]
  const chat = useChat({
    // On the break screen the chat is about the upcoming round. While a round is played the
    // chat is hidden and gets no round, so a reply still pending when the round starts is
    // discarded instead of saved
    upcomingRound: betweenRounds ? (config ?? null) : null,
    adviceCondition: chatConfig.adviceCondition,
    chat: chatConfig,
    prompts,
    partnerType: session.trialConfig.partnerType,
    persona,
    totalScoreBefore: trialScoreBefore,
    saveMessage
  })

  // Report this page's part of the proctor view (SessionContext publishes it). On the break,
  // the advice is worked out the same way the LLM's is, so a proctor gives the same advice
  useEffect(() => {
    setLiveTask({
      round,
      betweenRounds,
      upcoming:
        betweenRounds && config
          ? { round: config, advice: getAdvice(config, chatConfig.adviceCondition, chatConfig) }
          : null,
      chat: chat.messages
    })
  }, [setLiveTask, round, betweenRounds, config, chatConfig, chat.messages])
  // Cleared when the page goes (interlude, complete), so the view doesn't show a stale round
  useEffect(() => () => setLiveTask(null), [setLiveTask])

  // Only happens if there are no rounds left; PhaseGuard moves on once the session finishes
  if (!config) return null

  // roundResponses already includes the round that just ended, so roundNumber is the next round
  if (betweenRounds) {
    // The round's clock starts on this click, which keeps the break out of the first flip's timing
    const handleStartRound = (): void => {
      setRound(startRound(config, performance.now()))
      setBetweenRounds(false)
    }
    // The chat is only shown in the advised block
    const showChat = session.block === 'advised'
    return (
      <main className="trial between-rounds">
        <p className="total-score" aria-live="polite">
          Total score: {trialScoreBefore}
        </p>
        <p className="get-ready">Get ready for round {roundNumber + 1}</p>
        {showChat && (
          <ChatPanel
            persona={persona}
            greeting={chatConfig.greeting}
            messages={chat.messages}
            partnerTyping={chat.partnerTyping}
            error={chat.error}
            disabled={false}
            onSend={chat.send}
          />
        )}
        {/* In the advised block focus is left for the chat box, so Enter can't skip the chat */}
        <button className="btn-primary" type="button" onClick={handleStartRound} autoFocus={!showChat}>
          Start round {roundNumber + 1}
        </button>
      </main>
    )
  }

  // As soon as a round is recorded, config moves on to the next round while `round` still
  // holds the finished one until the break ends. Treating that round as stale stops it being
  // shown or recorded twice (e.g. a double-click on Next round)
  if (!round || round.config.roundIndex !== config.roundIndex) return null

  // Record the finished round straight away; the break only delays when the next round appears
  const handleRoundDone = (finished: RoundState): void => {
    // Check if this block is over by checking if the next round exists and is part of a different block
    const nextConfig = session.roundConfigs[roundNumber + 1]
    const isLastRoundOfBlock = nextConfig !== undefined && nextConfig.blockIndex !== config.blockIndex

    completeRound(toRoundResponse(finished, trialScoreBefore, session.block))
    if (isLastRound) finishSession()
    else if (isLastRoundOfBlock) completeBlock()
    else setBetweenRounds(true)
  }

  // event.timeStamp is when the click happened, on the same clock as performance.now()
  const handleFlip = (position: number, clickedAt: number): void => {
    setRound((r) => (r ? flipCard(r, position, clickedAt) : r))
  }
  // Stopping ends the round and moves straight on (break screen, or the end of the task),
  // since there's no new card to look at. Rounds that end on a flip still show Next round
  const handleStop = (): void => {
    const stopped = stopRound(round)
    setRound(stopped) // so anything reading the round sees that it has ended
    handleRoundDone(stopped)
  }
  const handleNext = (): void => handleRoundDone(round)

  return (
    <main className="trial trial-play">
      <div className="trial-badge">
        Round {roundNumber + 1} of {totalRounds}
      </div>
      <Round
        round={round}
        isLastRound={isLastRound}
        onFlip={handleFlip}
        onStop={handleStop}
        onNext={handleNext}
      />
    </main>
  )
}
