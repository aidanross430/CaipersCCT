import { useEffect, useRef, useState, type FormEvent, type JSX } from 'react'
import type { ChatMessage } from '../../../../shared/types'
import type { Persona } from '../../features/chatbox/chat.config'

type ChatPanelProps = {
  persona: Persona
  greeting: string
  messages: ChatMessage[]
  partnerTyping: boolean
  disabled: boolean // e.g. once the round has ended, since no reply would come
  error: string | null // the last reply failed
  onSend: (text: string) => void
}

// The chat box from the mockup: partner name, message list with a typing indicator, and
// the message composer. It only displays; useChat owns the conversation
export default function ChatPanel({
  persona,
  greeting,
  messages,
  partnerTyping,
  error,
  disabled,
  onSend
}: ChatPanelProps): JSX.Element {
  const [draft, setDraft] = useState('')

  // Keep the newest message in view
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages.length, partnerTyping, error])

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault() // stop the form from reloading the page
    if (!draft.trim() || disabled) return
    onSend(draft)
    setDraft('')
  }

  return (
    <aside className="chat" aria-labelledby="chat-title">
      <h2 id="chat-title">Chatting with {persona.name}</h2>

      <div className="messages" ref={listRef} aria-live="polite">
        <IncomingMessage persona={persona} text={greeting} />
        {messages.map((m, i) =>
          m.sender === 'participant' ? (
            <div key={i} className="bubble-out">
              {m.text}
            </div>
          ) : (
            <IncomingMessage key={i} persona={persona} text={m.text} />
          )
        )}
        {partnerTyping && <p className="typing-status">{persona.name} is typing...</p>}
        {/* The technical reason is logged, not shown: the participant only needs to know to get help */}
        {error && !partnerTyping && (
          <p className="chat-error" role="alert">
            {persona.name} couldn&apos;t reply. Please tell the research assistant.
          </p>
        )}
      </div>

      <form className="composer-row" onSubmit={handleSubmit}>
        <input
          className="composer"
          type="text"
          placeholder={disabled ? 'Chat opens again next round' : 'Type a message...'}
          aria-label={`Message ${persona.name}`}
          autoComplete="off"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={disabled}
        />
        <button className="send-btn" type="submit" disabled={disabled || !draft.trim()}>
          Send
        </button>
      </form>
    </aside>
  )
}

function IncomingMessage({ persona, text }: { persona: Persona; text: string }): JSX.Element {
  return (
    <div className="msg-in">
      <div className="avatar" aria-hidden="true">
        {persona.avatar}
      </div>
      <div>
        <div className="name">{persona.name}</div>
        <div className="bubble-in">{text}</div>
      </div>
    </div>
  )
}
