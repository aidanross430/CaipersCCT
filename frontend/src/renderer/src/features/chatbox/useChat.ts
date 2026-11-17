import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { AdviceCondition, ChatMessage, RoundConfig, TrialConfig } from '../../../../shared/types'
import type { ChatConfig, Options, Persona } from '../../../../shared/options'
import { chatReducer, initialChatState } from './conversation'
import { requestPartnerReply, toProctorMessage, type ReplyOutcome } from './reply'

// What does the chat need from the task page?
export type UseChatOptions = {
  upcomingRound: RoundConfig | null             // the round the current break is before; null while a round is played
  adviceCondition: AdviceCondition
  perceivedPartner: TrialConfig['perceivedPartner']
  actualPartner: TrialConfig['actualPartner']
  persona: Persona
  totalScoreBefore: number                      // total from earlier rounds
  saveMessage: (message: ChatMessage) => void   // from SessionContext; saves to disk
  chat: ChatConfig                              // from Chat.config.json
  prompts: Options['prompts']                   // the templates from Options/
}

// What does the chat send back to the task page
export type UseChat = {
  messages: ChatMessage[]
  partnerTyping: boolean
  error: string | null   // set when the last reply failed; cleared when the participant sends again
  send: (text: string) => void
}

// Connects the pure chat logic (conversation.ts, advice.ts) to React: keeps the message
// list and waits a "typing" delay before each reply. The chat only happens on the break
// between rounds, so a reply that arrives after that break has ended is dropped.
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
      const trimmed = text.trim()
      const options = optionsRef.current
      const upcomingRound = options.upcomingRound

      // Format the text and message data struct sent to the llm
      if (!trimmed || !upcomingRound) return
      const participantMessage: ChatMessage = {
        sender: 'participant',
        text: trimmed,
        sentAt: new Date().toISOString(),
        roundIndex: upcomingRound.roundIndex
      }

      // Add the message to the chat and save it. Only the LLM owes a reply per message; a
      // student replies whenever they choose, so nothing is counted for them
      const isLlm = options.actualPartner === 'llm'
      dispatch({
        type: 'SEND',
        message: participantMessage,
        awaitReply: isLlm
      })
      options.saveMessage(participantMessage)

      // Student partner: they see this message through the proctor view Task publishes, and
      // their reply arrives through the onPartnerMessage effect below. Nothing to request here
      if (!isLlm) return

      // LLM partner: ask for one reply, with the fake read and typing delays
      const requestId = ++latestRequest.current
      const history = [...messagesRef.current, participantMessage]  // add the user's most recent chat to the history

      // The partner "reads" the message for a moment before "is typing..." appears
      const [readMin, readMax] = options.chat.readDelayMs
      const readDelay = readMin + Math.random() * (readMax - readMin)
      setTimeout(() => {
        // Only for the latest message: a newer one starts its own read delay
        if (mounted.current && requestId === latestRequest.current) dispatch({ type: 'TYPING_START' })
      }, readDelay)

      void requestPartnerReply(
        {
          chatReply: window.api.chatReply,
          // requestPartnerReply waits this out as the minimum typing time. Adding the read
          // delay means a fast reply still shows "is typing..." for a moment first
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, readDelay + ms))
        },
        { ...options, upcomingRound, history }
      )
        // requestPartnerReply turns API errors into a 'failed' outcome itself, but anything
        // thrown outside that (e.g. a template typo in buildPrompt) would otherwise leave
        // "..." showing forever. Treat it as a failed reply too
        .catch((err: unknown): ReplyOutcome => ({ kind: 'failed', error: String(err) }))
        .then((outcome) => {
          if (!mounted.current) return  // the user went past the page
          // A newer message is waiting on its own reply, or the participant started the round
          // before this reply arrived: they never see it, so it isn't shown or saved
          const breakEnded = optionsRef.current.upcomingRound?.roundIndex !== participantMessage.roundIndex
          if (requestId !== latestRequest.current || breakEnded) {
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
              error: outcome.error
            })
            return
          }
          dispatch({ type: 'REPLY', message: outcome.message })
          optionsRef.current.saveMessage(outcome.message)
        })
    }, [])

  // Student partner: their chat and typing arrive from main (the partner link), not as a reply
  // to a request, so listen for them for as long as the task page is up. The unsubscribe that
  // onPartnerMessage returns is the effect's cleanup
  const { actualPartner } = options
  useEffect(() => {
    if (actualPartner !== 'student') return
    return window.api.onPartnerMessage((partnerMessage) => {
      const { upcomingRound, adviceCondition, chat, saveMessage } = optionsRef.current

      if (partnerMessage.type === 'typing') {
        dispatch({ type: 'PARTNER_TYPING', isTyping: partnerMessage.isTyping })
        return
      }

      // partnerMessage.type === 'chat'
      if (!upcomingRound) {
        // A round is being played, so the chat is hidden and the participant would never see
        // this. Save it as a system record (roundIndex -1: it belongs to no break) so nothing
        // the student typed silently disappears from the data
        saveMessage({
          sender: 'system',
          text: partnerMessage.text,
          sentAt: new Date().toISOString(),
          roundIndex: -1,
          error: 'Student message arrived while a round was being played'
        })
        return
      }
      const message = toProctorMessage(partnerMessage.text, upcomingRound, adviceCondition, chat)
      dispatch({ type: 'PARTNER_MESSAGE', message })
      saveMessage(message)
    })
  }, [actualPartner])

  // A student whose connection drops mid-message never sends "stopped typing", so clear the
  // indicator whenever the link is anything but connected ('waiting' or 'disconnected')
  useEffect(() => {
    if (actualPartner !== 'student') return
    return window.api.onPartnerStatus((status) => {
      if (status.state !== 'connected') dispatch({ type: 'PARTNER_TYPING', isTyping: false })
    })
  }, [actualPartner])

  // The chat shows only the current break: it starts empty each time. Every message is
  // still kept in state and saved to disk; this only changes what's displayed
  const currentRound = options.upcomingRound?.roundIndex
  const sentThisRound = state.lastSendRound === currentRound

  // A student who was typing when the break ended may never send "stopped typing" for it,
  // so clear their indicator whenever the break changes (starts, ends, or moves on)
  useEffect(() => {
    if (actualPartner === 'student') dispatch({ type: 'PARTNER_TYPING', isTyping: false })
  }, [actualPartner, currentRound])
  // Memoized so the list only changes when a message does: Task passes it to an effect (the
  // proctor view), and a new array every render would re-run that effect every render
  const messages = useMemo(
    () => state.messages.filter((m) => m.roundIndex === currentRound),
    [state.messages, currentRound]
  )
  return {
    messages,
    partnerTyping:
      actualPartner === 'student'
        ? // the student's own typing signal, only while a break is open
          state.proctorTyping && currentRound !== undefined
        : // LLM: a reply still pending from the previous break is discarded when it arrives,
          // so don't show "..." or that break's error in the new break's empty chat
          state.pendingReplies > 0 && state.typingVisible && sentThisRound,
    error: sentThisRound ? state.error : null,
    send
  }
}
