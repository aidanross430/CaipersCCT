// Types will contain typescript logic for the CCT that will need to be shared across
// electron processes. Things like TrialConfig, TrialResponse, SessionData, Participant info
// Basically, anything that will be exported or needs to be shared with the LLM/chatbox/advice engine

export type TrialConfig = {
    designSeed: number                      // The rng seed for the design
    chatDisplayCondition: 'human' | 'ai'    // Is the participant told they are talking to a human or LLM?
}

// The settings for each round, determining number of loss cards and each card's point worth
export type RoundConfig = {
    roundIndex: number              // what number round are we on?
    isPractice: boolean             // will not add round score to final score.
    gainAmount: number              // how many points are each gain card worth?
    lossAmount: number              // how many points are each loss card worth?
    numberLossCards: number         // how many loss cards are in this round?
    totalCards: number               // The number of cards in this round
    lossPositions: number[]         // On non-rigged rounds, where are the loss cards?
    rigged: boolean                 // loss card position not determined by rng seed but by flip #
    lossOnFlipNum: number | null    // for rigged trials, what flip is the loss on?
}

// Data structure for each flip the participant performs
export type CardFlip = {
    flipIndex: number              // Within the round, which flip was this?
    cardPosition: number           // Which card did the user flip?
    outcome: 'gain'|'loss'         // was the flip a gain or a loss?
    roundScoreAfterFlip: number    // What is the round's score after the flip?
    msSincePreviousFlip: number    // How long has it been since the participant last flipped a card?
}

// helper type for round response data structure
export type RoundEndReason = 'stopped' | 'loss' | 'allGainsRevealed'

// Round Responses - this is basically the data that will be exported for each round
// in the trial
export type RoundResponse = {
    roundIndex: number         // Which Round was this?
    flips: CardFlip[]          // The set of flip data
    endReason: RoundEndReason  // Why did the round end?
    gainCardsFlipped: number   // How many gain cards were flipped?
    trialScore: number         // What is the trials score at the end of this round?
}

// Which phase of the trial is the user on
export type Phase = 'welcome' | 'task'  //Will have more phases: ex. practice, complete, setup

// The user's sessionData
export type SessionData = {
    participantId: string               // Pid
    phase: Phase                        // The current phase the user is on
    trialConfig: TrialConfig            // The settings for the entire trial
    roundConfigs: RoundConfig[]         // The set of settings for each individual round
    roundResponses: RoundResponse[]     // The set of outcomes for each round
    date: string                        // Timestamp data for session (was useful for PID fixing in the past)
    sessionStart: string
}



