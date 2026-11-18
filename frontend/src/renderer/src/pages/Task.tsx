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
  const { session, completeRound, finishSession, completeBlock, saveMessage, setLiveTask } =
    useSession()
  const [betweenRounds, setBetweenRounds] = useState(false)

  // The current round is the first one without a response
  const roundNumber = session.roundResponses.length
  const config = session.roundConfigs[roundNumber]
  const totalRounds = session.roundConfigs.length
  const isLastRound = roundNumber === totalRounds - 1
  const trialScoreBefore = session.roundResponses.at(-1)?.trialScore ?? 0

  // The round being played. A block's first round starts when the page first renders; every
  // other round starts when the participant leaves the break screen before it
  const [round, setRound] = useState<RoundState | null>(() =>
    config ? startRound(config, performance.now()) : null
  )

  // The chat sits beside the cards during a round, in the advised block only, and starts empty
  // each round. It's open from the round's first card until the participant leaves it (Next
  // round / Stop): once the round has ended the panel stays visible but can't send. On the
  // break screen it gets no round, so a reply still pending is discarded instead of saved.
  // `round` still holds the finished round for a moment after it's recorded, so it's matched
  // against config. Hooks have to run before the early returns below
  const chatRound =
    session.block === 'advised' &&
    !betweenRounds &&
    config &&
    round?.config.roundIndex === config.roundIndex
      ? config
      : null
  const { chat: chatConfig, prompts } = useOptions()
  const persona = chatConfig.personas[session.trialConfig.perceivedPartner]
  const chat = useChat({
    round: chatRound,
    adviceCondition: chatConfig.adviceCondition,
    chat: chatConfig,
    prompts,
    perceivedPartner: session.trialConfig.perceivedPartner,
    actualPartner: session.trialConfig.actualPartner,
    persona,
    totalScoreBefore: trialScoreBefore,
    // Read when a message is sent, so the partner sees the board as it was at that moment
    progress: {
      cardsTurned: chatRound ? (round?.flips.length ?? 0) : 0,
      roundScore: chatRound ? (round?.roundScore ?? 0) : 0
    },
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
    return (
      <main className="trial between-rounds">
        <p className="total-score" aria-live="polite">
          Total score: {trialScoreBefore}
        </p>
        <p className="get-ready">Get ready for round {roundNumber + 1}</p>
        <button className="btn-primary" type="button" onClick={handleStartRound} autoFocus>
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
    const isLastRoundOfBlock =
      nextConfig !== undefined && nextConfig.blockIndex !== config.blockIndex

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

  // The chat is only shown in the advised block
  const showChat = session.block === 'advised'
  return (
    <main className="trial trial-play">
      <div className="trial-badge">
        Round {roundNumber + 1} of {totalRounds}
      </div>
      {/* Cards on the left, chat on the right, as in the mockup */}
      <div className={showChat ? 'play-columns with-chat' : 'play-columns'}>
        <div className="play-board">
          <Round
            round={round}
            isLastRound={isLastRound}
            onFlip={handleFlip}
            onStop={handleStop}
            onNext={handleNext}
          />
        </div>
        {showChat && (
          <ChatPanel
            persona={persona}
            greeting={chatConfig.greeting}
            messages={chat.messages}
            partnerTyping={chat.partnerTyping}
            error={chat.error}
            disabled={round.roundEnded}
            onSend={chat.send}
          />
        )}
      </div>
    </main>
  )
}
