// Holds a small state machine that keeps track of the user's progress
// throughout the entire task.
// This state machine is used by the hash router to decide which page the 
// user is on

import { SessionData, TrialConfig, RoundResponse } from '../../../../shared/types';
import { buildRoundConfigs } from "./design";
import { DEFAULT_DESIGN } from './design.config';

type SessionAction = 
    | {type: 'START'; participantId: string, seed: number, startedAt: string, localDate: string}
    | {type: 'ROUND_COMPLETE'; response: RoundResponse }
    | {type: 'FINISH'}


export const initialSession: SessionData = {
    participantId: '',
    phase: 'welcome',
    trialConfig: {
        designSeed: 0,
        chatDisplayCondition: 'ai'
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
                trialConfig: { ...state.trialConfig, designSeed: action.seed },
                roundConfigs: buildRoundConfigs(DEFAULT_DESIGN, action.seed),
                phase: 'task',
                localDate: action.localDate,
                sessionStart: action.startedAt
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