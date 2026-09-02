export type AtrashRole = 'INFORMED' | 'ATRASH';

export type AtrashPhase =
  | 'LOBBY'
  | 'STARTING'
  | 'ROUND_SETUP'
  | 'QUESTION_PHASE'
  | 'DISCUSSION_PHASE'
  | 'VOTING'
  | 'VOTE_REVEAL'
  | 'ATRASH_LAST_CHANCE'
  | 'ROUND_RESULT'
  | 'MATCH_RESULT'
  | 'ENDED';

export type AtrashTurnStage = 'ASKING' | 'ANSWERING';

export interface AtrashCategoryDef {
  slug: string;
  nameAr: string;
  icon: string;
  descriptionAr: string;
}

export interface AtrashWordItem {
  id: string;
  word: string;
  categorySlug: string;
  hintsAr?: string[];
  distractors: string[]; // 3+ alternative words from same/similar category for last-chance options
}

export interface AtrashTurnState {
  currentTurnIndex: number;
  totalTurns: number;
  askerUserId: string;
  answererUserId: string;
  stage: AtrashTurnStage;
  questionText?: string;
  answerText?: string;
  turnStartedAt: number;
  turnDeadline: number;
}

export interface AtrashQnAPair {
  turnIndex: number;
  askerUserId: string;
  answererUserId: string;
  questionText: string;
  answerText: string;
  timestamp: number;
}

export interface AtrashVoteRecord {
  voterUserId: string;
  targetUserId: string;
  castAt: number;
}

export interface AtrashVoteRevealData {
  votes: Record<string, string>; // voterUserId -> targetUserId
  voteCounts: Record<string, number>; // targetUserId -> vote count
  highestVotedUserId?: string;
  isTie: boolean;
  tiedUserIds: string[];
  isRevote: boolean;
  atrashDetected: boolean;
  revealedAtrashUserId: string;
}

export interface AtrashLastChanceData {
  atrashUserId: string;
  deadline: number;
  options: string[]; // Exactly 4 options selected server-side
  selectedWord?: string;
  isCorrect?: boolean;
}

export interface AtrashRoundResultData {
  roundNumber: number;
  secretWord: string;
  categoryNameAr: string;
  atrashUserId: string;
  atrashDetected: boolean;
  lastChanceAttempted: boolean;
  lastChanceSuccess: boolean;
  lastChanceChoice?: string;
  scoreDeltas: Record<string, number>;
  scores: Record<string, number>;
  winnerUserId?: string;
}

export interface AtrashMatchResultData {
  matchId: string;
  winnerUserId: string;
  winnerUsername: string;
  finalScores: Record<string, number>;
  totalRounds: number;
  completedAt: number;
  participantDetails: Array<{
    userId: string;
    username: string;
    displayName?: string;
    finalScore: number;
  }>;
}

/**
 * Public room state projection broadcast to ALL participants.
 * Zero secret leakage: NEVER contains secret word or unrevealed role identities.
 */
export interface AtrashPublicState {
  roomId: string;
  gameMode: 'ATRASH';
  phase: AtrashPhase;
  roundNumber: number;
  scores: Record<string, number>;
  targetScore: number; // Race to 5
  participants: Array<{
    userId: string;
    username: string;
    displayName?: string;
    isReady: boolean;
    isConnected: boolean;
  }>;
  category?: {
    slug: string;
    nameAr: string;
    icon: string;
  };
  turn?: {
    currentTurnIndex: number;
    totalTurns: number;
    askerUserId: string;
    answererUserId: string;
    stage: AtrashTurnStage;
    questionText?: string;
    turnDeadline: number;
    timeRemainingSeconds: number;
  };
  dialogueHistory: AtrashQnAPair[];
  discussionDeadline?: number;
  votingDeadline?: number;
  votedUserIds: string[]; // User IDs who already submitted a vote (targets hidden!)
  voteReveal?: AtrashVoteRevealData;
  lastChance?: {
    atrashUserId: string;
    deadline: number;
    options: string[]; // Exactly 4 options for last chance
  };
  roundResult?: AtrashRoundResultData;
  matchResult?: AtrashMatchResultData;
  serverTimestamp: number;
}

/**
 * Player-specific private state projection.
 * Delivered strictly to the individual authenticated participant.
 */
export interface AtrashPlayerPrivateState {
  userId: string;
  role: AtrashRole;
  isAtrash: boolean;
  category?: {
    slug: string;
    nameAr: string;
    icon: string;
  };
  secretWord?: string; // STRICTLY UNDEFINED FOR ATRASH!
  isMyTurn: boolean;
  myTurnRole?: 'ASKER' | 'ANSWERER';
  hasVoted: boolean;
  myVoteTarget?: string;
  lastChanceOptions?: string[]; // Populated only for Atrash during LAST_CHANCE phase
  availableActions: string[];
}

export const ATRASH_CONSTANTS = {
  PUBLIC_PLAYER_COUNT: 5,
  INFORMED_COUNT: 4,
  ATRASH_COUNT: 1,
  TARGET_WIN_SCORE: 5,
  DEFAULT_TURN_TIMER_SECONDS: 25,
  DEFAULT_DISCUSSION_TIMER_SECONDS: 30,
  DEFAULT_VOTING_TIMER_SECONDS: 20,
  DEFAULT_LAST_CHANCE_TIMER_SECONDS: 15,
  DEFAULT_REVEAL_PAUSE_SECONDS: 6,
  DEFAULT_ROUND_RESULT_PAUSE_SECONDS: 8,
  POINTS: {
    CORRECT_VOTER: 1,
    ATRASH_SURVIVED: 2,
    ATRASH_LAST_CHANCE_CORRECT: 1,
  },
} as const;

export const AtrashActionTypes = {
  START_GAME: 'START_GAME',
  SUBMIT_QUESTION: 'SUBMIT_QUESTION',
  SUBMIT_ANSWER: 'SUBMIT_ANSWER',
  CAST_VOTE: 'CAST_VOTE',
  SUBMIT_LAST_CHANCE: 'SUBMIT_LAST_CHANCE',
  ADVANCE_PHASE: 'ADVANCE_PHASE',
} as const;

export type AtrashActionType = (typeof AtrashActionTypes)[keyof typeof AtrashActionTypes];

export const AtrashSystemEvents = {
  STATE_SNAPSHOT: 'atrash:state_snapshot',
  ROUND_STARTED: 'atrash:round_started',
  PRIVATE_ROLE_ASSIGNED: 'atrash:role_assigned',
  TURN_STARTED: 'atrash:turn_started',
  QUESTION_SUBMITTED: 'atrash:question_submitted',
  ANSWER_SUBMITTED: 'atrash:answer_submitted',
  DISCUSSION_STARTED: 'atrash:discussion_started',
  VOTING_STARTED: 'atrash:voting_started',
  VOTE_CAST: 'atrash:vote_cast',
  VOTE_REVEAL: 'atrash:vote_reveal',
  ATRASH_LAST_CHANCE_STARTED: 'atrash:last_chance_started',
  ROUND_RESULT: 'atrash:round_result',
  MATCH_RESULT: 'atrash:match_result',
} as const;

export type AtrashSystemEvent = (typeof AtrashSystemEvents)[keyof typeof AtrashSystemEvents];

export const AtrashErrorCodes = {
  NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
  TOO_MANY_PLAYERS: 'TOO_MANY_PLAYERS',
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  INVALID_TURN_STAGE: 'INVALID_TURN_STAGE',
  QUESTION_TOO_SHORT: 'QUESTION_TOO_SHORT',
  QUESTION_TOO_LONG: 'QUESTION_TOO_LONG',
  ANSWER_TOO_SHORT: 'ANSWER_TOO_SHORT',
  ANSWER_TOO_LONG: 'ANSWER_TOO_LONG',
  PROHIBITED_DIRECT_QUESTION: 'PROHIBITED_DIRECT_QUESTION',
  ALREADY_ACTED: 'ALREADY_ACTED',
  TIMER_EXPIRED: 'TIMER_EXPIRED',
  ALREADY_VOTED: 'ALREADY_VOTED',
  CANNOT_VOTE_FOR_SELF: 'CANNOT_VOTE_FOR_SELF',
  INVALID_VOTE_TARGET: 'INVALID_VOTE_TARGET',
  NOT_IN_VOTING_PHASE: 'NOT_IN_VOTING_PHASE',
  NOT_THE_ATRASH: 'NOT_THE_ATRASH',
  NOT_IN_LAST_CHANCE_PHASE: 'NOT_IN_LAST_CHANCE_PHASE',
  INVALID_LAST_CHANCE_OPTION: 'INVALID_LAST_CHANCE_OPTION',
  INVALID_PHASE_TRANSITION: 'INVALID_PHASE_TRANSITION',
} as const;

export type AtrashErrorCode = (typeof AtrashErrorCodes)[keyof typeof AtrashErrorCodes];
