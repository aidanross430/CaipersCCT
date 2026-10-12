// Holds a small state machine that keeps track of the user's progress
// throughout the entire task.
// This state machine is used by the hash router to decide which page the 
// user is on

import { SessionData, TrialConfig, RoundResponse, RoundConfig } from '../../../../shared/types';

type SessionAction = 
    | {type: 'START'; participantId: string, trialConfig: TrialConfig, roundConfigs: RoundConfig[], sessionStart:string, localDate: string}
    | {type: 'ROUND_COMPLETE'; response: RoundResponse }
    | {type: 'FINISH'}


export const initialSession: SessionData = {
    participantId: '',
    phase: 'welcome',
    trialConfig: {
        designSeed: 0,
        chatDisplayCondition: 'ai'      // placeholder: replaced at START by displayCondition in Chat.config.json
    },
    roundConfigs: [],
    roundResponses: [],
    localDate: '',
    sessionStart: ''
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
                sessionStart: action.sessionStart
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
    }        
}