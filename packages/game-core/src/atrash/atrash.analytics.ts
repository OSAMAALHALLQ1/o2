export interface AtrashAnalyticsEventPayloads {
  atrash_matchmaking_started: {
    userId: string;
    gameMode: 'ATRASH';
    timestamp: number;
  };
  atrash_match_started: {
    matchId: string;
    roomId: string;
    participantCount: number;
    timestamp: number;
  };
  atrash_round_started: {
    matchId: string;
    roomId: string;
    roundNumber: number;
    categorySlug: string;
    // NOTE: NEVER log secret word or Atrash identity in analytics!
    timestamp: number;
  };
  atrash_question_submitted: {
    matchId: string;
    roomId: string;
    roundNumber: number;
    turnIndex: number;
    askerUserId: string;
    answererUserId: string;
    questionLength: number;
    timestamp: number;
  };
  atrash_vote_started: {
    matchId: string;
    roomId: string;
    roundNumber: number;
    isRevote: boolean;
    timestamp: number;
  };
  atrash_vote_cast: {
    matchId: string;
    roomId: string;
    roundNumber: number;
    voterUserId: string;
    // Target is omitted from public telemetry to protect secrecy
    timestamp: number;
  };
  atrash_round_completed: {
    matchId: string;
    roomId: string;
    roundNumber: number;
    categorySlug: string;
    atrashDetected: boolean;
    lastChanceSuccess: boolean;
    scoresSummary: Record<string, number>;
    timestamp: number;
  };
  atrash_match_completed: {
    matchId: string;
    roomId: string;
    winnerUserId: string;
    totalRounds: number;
    durationMs: number;
    finalScores: Record<string, number>;
    timestamp: number;
  };
  atrash_abandoned: {
    matchId?: string;
    roomId: string;
    userId: string;
    phase: string;
    timestamp: number;
  };
  atrash_reconnected: {
    matchId?: string;
    roomId: string;
    userId: string;
    phase: string;
    timestamp: number;
  };
}

export type AtrashAnalyticsEventName = keyof AtrashAnalyticsEventPayloads;
