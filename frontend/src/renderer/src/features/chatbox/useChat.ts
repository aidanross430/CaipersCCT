import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { AdviceCondition, ChatMessage, TrialConfig } from '../../../../shared/types'
import type { RoundState } from '../cct/scoring'
import type { Persona } from './chat.config'
import { CHAT_CONFIG } from './chat.config'
import { chatReducer, initialChatState } from './conversation'
import { requestPartnerReply, type ReplyOutcome } from './reply'

// What does the chat need from the task page?
export type UseChatOptions = {
  round: RoundState | null
  adviceCondition: AdviceCondition
  displayCondition: TrialConfig['chatDisplayCondition']
  persona: Persona
  totalScoreBefore: number                      // total from earlier rounds
  saveMessage: (message: ChatMessage) => void   // from SessionContext; saves to disk
}

// What does the chat send back to the task page
export type UseChat = {
  messages: ChatMessage[]
  partnerTyping: boolean
  error: string | null   // set when the last reply failed; cleared when the participant sends again
  send: (text: string) => void
}

// Connects the pure chat logic (conversation.ts, advice.ts) to React: keeps the message
// list, waits a "typing" delay before each reply, and builds the reply from the round as it
// is when the reply appears, not when the message was sent.
// Call it from a component that stays mounted for the whole task (Task), so the
// conversation carries over between rounds.
export function useChat(options: UseChatOptions,): UseChat {
  const [state, dispatch] = useReducer(chatReducer, initialChatState)

  const optionsRef = useRef(options)
  useEffect(() => { optionsRef.current = options })

  const messagesRef = useRef(state.messages)
  useEffect(() => {messagesRef.current = state.messages}, [state.messages])

  // only response to the latest request, so keep track of which request we're on
  const latestRequest = useRef(0)

  // False once the page has closed, so a reply that arrives afterwards is ignored.
  // Set back to true in the effect because StrictMode mounts, unmounts and remounts in dev
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const send = useCallback(
    (text: string): void => {
      // Get the prompt text and round's live data
      const trimmed = text.trim()
      const options = optionsRef.current
      const round = options.round

      // Format the text and message data struct sent to the llm
      if (!trimmed || !round || round.roundEnded) return
      const participantMessage: ChatMessage = {
        sender: 'participant',
        text: trimmed,
        sentAt: new Date().toISOString(),
        roundIndex: round.config.roundIndex,
        flipsSoFar: round.flips.length
      }

      // send that message
      dispatch({
        type: 'SEND',
        message: participantMessage
      })
      optionsRef.current.saveMessage(participantMessage)

      const requestId = ++latestRequest.current
      const history = [...messagesRef.current, participantMessage]  // add the user's most recent chat to the history

      // The partner "reads" the message for a moment before "is typing..." appears
      const [readMin, readMax] = CHAT_CONFIG.readDelayMs
      const readDelay = readMin + Math.random() * (readMax - readMin)
      setTimeout(() => {
        // Only for the latest message: a newer one starts its own read delay
        if (mounted.current && requestId === latestRequest.current) dispatch({ type: 'TYPING_START' })
      }, readDelay)

      void requestPartnerReply(
        {
          chatReply: window.api.chatReply,
          getRound: () => optionsRef.current.round,
          // requestPartnerReply waits this out as the minimum typing time. Adding the read
          // delay means a fast reply still shows "is typing..." for a moment first
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, readDelay + ms))
        },
        { ...options, history}
      )
        // requestPartnerReply turns API errors into a 'failed' outcome itself, but anything
        // thrown outside that (e.g. a template typo in buildPrompt) would otherwise leave
        // "..." showing forever. Treat it as a failed reply too
        .catch((err: unknown): ReplyOutcome => ({ kind: 'failed', error: String(err) }))
        .then((outcome) => {
          if (!mounted.current) return  // the user went past the page
          if (requestId !== latestRequest.current || outcome.kind === 'discard') {
            dispatch({ type: 'CANCEL_REPLY' })
            return
          }
          if (outcome.kind === 'failed') {
            dispatch({ type: 'REPLY_FAILED', error: outcome.error })
            // Logged so the data shows which messages went unanswered and why, without
            // relying on anyone noticing. Never added to the chat state, so it isn't shown as
            // a bubble or sent to the model as part of the history
            optionsRef.current.saveMessage({
              sender: 'system',
              text: '',
              sentAt: new Date().toISOString(),
              roundIndex: participantMessage.roundIndex,
              flipsSoFar: optionsRef.current.round?.flips.length ?? participantMessage.flipsSoFar,
              error: outcome.error
            })
            return
          }
          dispatch({ type: 'REPLY', message: outcome.message })
          optionsRef.current.saveMessage(outcome.message)
        })
    }, [])

  // The chat shows only the current round: it starts empty each round. Every message is
  // still kept in state and saved to disk; this only changes what's displayed
  const currentRound = options.round?.config.roundIndex
  const sentThisRound = state.lastSendRound === currentRound
  return {
    messages: state.messages.filter((m) => m.roundIndex === currentRound),
    // A reply still pending from the previous round is discarded when it arrives, so don't
    // show "..." or that round's error in the new round's empty chat
    partnerTyping: state.pendingReplies > 0 && state.typingVisible && sentThisRound,
    error: sentThisRound ? state.error : null,
    send
  }
}
