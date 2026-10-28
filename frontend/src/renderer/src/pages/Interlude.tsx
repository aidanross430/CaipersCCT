import { type JSX } from 'react';
import { useSession } from '../state/SessionContext';

export default function InterludePage(): JSX.Element {
    const { completeInterlude } = useSession()

    return (
        <main className='Interlude'>
            <h1>Advice Block</h1>
            <p>
                Advice Block instructions
            </p>
            <button className="btn-primary" type="button" onClick={completeInterlude} autoFocus>
                Continue
            </button>
        </main>
    )
}