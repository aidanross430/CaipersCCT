import type { JSX } from 'react'
import type { ChatMessage } from '../../../shared/types'

type ProctorChatProps = {
  messages: ChatMessage[] // this break's messages, from the view: the participant app is the writer
  open: boolean // only between rounds, as for the participant
  onSend: (text: string) => void
  onTyping: (isTyping: boolean) => void
}

// The chat from the proctor's side. Not ChatPanel: that one is drawn from the participant's
// side (their messages outgoing, the partner's incoming), and this is the mirror image
export default function ProctorChat(props: ProctorChatProps): JSX.Element {
  // TODO:
  //   - messages mirrored: the participant's incoming, the partner's (this proctor's) outgoing.
  //     A sent message appears once the participant app has saved it and sent the next view,
  //     so there's no local copy to get out of step
  //   - composer: maxLength MAX_MESSAGE_LENGTH (shared/partner/protocol.ts), disabled unless open
  //   - typing: onTyping(true) on the first keystroke, onTyping(false) after ~3 s idle, on send
  //     and when the chat closes, so the participant's "is typing..." never sticks
  void props
  return (
    <section>
      <h2>Chat</h2>
      <p>TODO</p>
    </section>
  )
}
