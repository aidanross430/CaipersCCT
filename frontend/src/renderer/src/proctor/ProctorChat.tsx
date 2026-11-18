import { useEffect, useRef, useState, type FormEvent, type JSX } from 'react'
import { MAX_MESSAGE_LENGTH } from '../../../shared/partner/protocol'
import type { ChatMessage } from '../../../shared/types'

type ProctorChatProps = {
  messages: ChatMessage[] // this round's messages, from the view: the participant app is the writer
  open: boolean // during a round in the advised block, until it ends, as for the participant
  connected: boolean // messages are dropped by the link otherwise
  onSend: (text: string) => void
  onTyping: (isTyping: boolean) => void
}

// After this long without a keystroke, the participant's "is typing..." is turned off
const TYPING_IDLE_MS = 3_000

// The chat from the proctor's side. Not ChatPanel: that one is drawn from the participant's
// side (their messages outgoing, the partner's incoming), and this is the mirror image.
// A sent message appears once the participant app has saved it and sent the next view, so there
// is no local copy to get out of step
export default function ProctorChat({
  messages,
  open,
  connected,
  onSend,
  onTyping
}: ProctorChatProps): JSX.Element {
  const [draft, setDraft] = useState('')
  const canSend = open && connected

  // Typing signal: on with the first keystroke, off after TYPING_IDLE_MS idle, on send, and
  // whenever the chat closes or this unmounts, so the participant's indicator never sticks
  const typing = useRef(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // The idle timer can fire after a re-render, so it calls the latest onTyping through a ref
  const onTypingRef = useRef(onTyping)
  useEffect(() => {
    onTypingRef.current = onTyping
  }, [onTyping])
  const stopTyping = (): void => {
    clearTimeout(idleTimer.current)
    if (typing.current) {
      typing.current = false
      onTypingRef.current(false)
    }
  }
  const noteKeystroke = (): void => {
    if (!typing.current) {
      typing.current = true
      onTypingRef.current(true)
    }
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(stopTyping, TYPING_IDLE_MS)
  }
  useEffect(() => {
    if (!canSend) stopTyping()
  }, [canSend])
  useEffect(() => stopTyping, [])

  // Keep the newest message in view
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages.length])

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault() // stop the form from reloading the page
    if (!draft.trim() || !canSend) return
    stopTyping()
    onSend(draft)
    setDraft('')
  }

  // System records (failed replies and the like) are data, never chat bubbles
  const shown = messages.filter((m) => m.sender !== 'system')

  return (
    <aside className="chat" aria-labelledby="proctor-chat-title">
      <h2 id="proctor-chat-title">Chat with the participant</h2>

      <div className="messages" ref={listRef} aria-live="polite">
        {shown.length === 0 && (
          <p className="typing-status">
            {open
              ? 'No messages this round yet.'
              : 'The chat opens during rounds in the advised block.'}
          </p>
        )}
        {shown.map((m, i) =>
          m.sender === 'participant' ? (
            <div key={i} className="msg-in">
              <div className="avatar" aria-hidden="true">
                P
              </div>
              <div>
                <div className="name">Participant</div>
                <div className="bubble-in">{m.text}</div>
              </div>
            </div>
          ) : (
            <div key={i} className="bubble-out">
              {m.text}
            </div>
          )
        )}
      </div>

      <form className="composer-row" onSubmit={handleSubmit}>
        <input
          className="composer"
          type="text"
          placeholder={
            !open ? 'Chat is closed right now' : !connected ? 'Not connected' : 'Type a message...'
          }
          aria-label="Message the participant"
          autoComplete="off"
          maxLength={MAX_MESSAGE_LENGTH}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            if (e.target.value) noteKeystroke()
            else stopTyping()
          }}
          disabled={!canSend}
        />
        <button className="send-btn" type="submit" disabled={!canSend || !draft.trim()}>
          Send
        </button>
      </form>
    </aside>
  )
}
