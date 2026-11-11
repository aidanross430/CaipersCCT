import { type JSX } from 'react';
import { useSession } from '../state/SessionContext';

export default function InterludePage(): JSX.Element {
    const { completeInterlude } = useSession()

    return (
        <main className='welcome'>
            <h1>Advice</h1>
            <p>
                You're halfway done! For the second half, the card game's rules will
                remain the same. However, before each round you will be allowed to chat
                with an LLM or person to strategize.
            </p>
            <ul>
                <li>
                    You are encouraged to discuss with your partner each round to find out how
                    many cards you should flip over to maximize your points.
                </li>
            </ul>
            <div className='actions'>
                <button className="btn-primary" type="button" onClick={completeInterlude} autoFocus>
                    Continue
                </button>
            </div>
        </main>
    )
}