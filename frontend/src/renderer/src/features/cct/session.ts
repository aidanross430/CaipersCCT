// Holds a small state machine that keeps track of the user's progress
// throughout the entire task.
// This state machine is used by the hash router to decide which page the 
// user is on

import { SessionData, TrialConfig, RoundResponse, RoundConfig } from '../../../../shared/types';

type SessionAction = 
    | {type: 'START'; participantId: string, trialConfig: TrialConfig, roundConfigs: RoundConfig[], sessionStart:string, localDate: string}
    | {type: 'ROUND_COMPLETE'; response: RoundResponse }
    | {type: 'FINISH'}
    | {type: 'BLOCK_COMPLETE'}
    | {type: 'INTERLUDE_COMPLETE'}


export const initialSession: SessionData = {
    participantId: '',
    phase: 'welcome',
    trialConfig: {
        designSeed: 0,
        perceivedPartner: 'ai',               // placeholders: replaced at START by perceivedPartner
        actualPartner: 'llm'                  //   and actualPartner from Chat.config.json
    },
    roundConfigs: [],
    roundResponses: [],
    localDate: '',
    sessionStart: '',
    block: 'solo'                       // Should first block always be solo?
}
// Takes the current state of the session and changes it depending on the user's action
export function sessionReducer(state: SessionData, action: SessionAction): SessionData {
    switch (action.type) {
        case "START":
            return {
                ...state,
                participantId: action.participantId,
                trialConfig: action.trialConfig,
                roundConfigs: action.roundConfigs,
                phase: 'task',
                localDate: action.localDate,
                sessionStart: action.sessionStart,
                // If we want counterbalancing to blocks, add that here
            }
        case "ROUND_COMPLETE":
            return {
                ...state,
                roundResponses: [...state.roundResponses, action.response]
            }
        case "FINISH":
            return {
                ...state,
                phase: 'complete'
            }
        case "BLOCK_COMPLETE":
            return {
                ...state,
                phase: 'interlude'
            }
        case "INTERLUDE_COMPLETE":
            return {
                ...state,
                phase: 'task',
                block: state.block === 'solo' ? 'advised' : 'solo' 
            }
    }        
}