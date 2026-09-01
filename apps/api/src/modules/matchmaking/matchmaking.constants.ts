import { MatchmakingErrorCodes } from '@o2/types';

export { MatchmakingErrorCodes };

export const MATCHMAKING_THROTTLES = {
  JOIN_LIMIT: 10,
  JOIN_TTL_MS: 60_000,
  CANCEL_LIMIT: 20,
  CANCEL_TTL_MS: 60_000,
  STATUS_LIMIT: 60,
  STATUS_TTL_MS: 60_000,
} as const;

export const MATCHMAKING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
