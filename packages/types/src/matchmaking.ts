import type { RoomGameMode } from './realtime';

export type MatchmakingTicketStatus =
  | 'QUEUED'
  | 'MATCHING'
  | 'MATCHED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FAILED';

export interface MatchmakingTicketMemberDto {
  userId: string;
  username: string;
  displayName?: string;
}

export interface MatchmakingParticipantSnapshot {
  userId: string;
  username: string;
  displayName?: string;
  partyId?: string;
  isLeader: boolean;
}

export interface MatchmakingTicketDto {
  ticketId: string;
  gameMode: RoomGameMode;
  status: MatchmakingTicketStatus;
  partyId?: string | null;
  partyVersion?: number | null;
  leaderUserId: string;
  memberCount: number;
  members: MatchmakingTicketMemberDto[];
  createdAt: number;
  expiresAt: number;
  matchId?: string | null;
  roomId?: string | null;
}

export interface MatchAssignmentDto {
  matchId: string;
  gameMode: RoomGameMode;
  roomId: string;
  participants: MatchmakingParticipantSnapshot[];
  partyGrouping: Record<string, string[]>;
  assignmentVersion: number;
  createdAt: number;
}

export interface MatchmakingStatusResponseDto {
  ticket: MatchmakingTicketDto | null;
  match?: MatchAssignmentDto | null;
}

export interface JoinMatchmakingDto {
  gameMode: RoomGameMode;
}

export interface CancelMatchmakingDto {
  ticketId?: string;
}

export const MATCHMAKING_CONSTANTS = {
  TICKET_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes default timeout
  SWEEP_INTERVAL_MS: 15 * 1000,     // 15 seconds expired ticket sweep
  MAX_TICKETS_PER_SCAN: 100,
} as const;

export const MatchmakingErrorCodes = {
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
  INVALID_GAME_MODE: 'INVALID_GAME_MODE',
  PARTY_NOT_FOUND: 'PARTY_NOT_FOUND',
  NOT_PARTY_LEADER: 'NOT_PARTY_LEADER',
  PARTY_NOT_READY: 'PARTY_NOT_READY',
  PARTY_GAME_CAPACITY_EXCEEDED: 'PARTY_GAME_CAPACITY_EXCEEDED',
  ALREADY_QUEUED: 'ALREADY_QUEUED',
  ALREADY_IN_ROOM: 'ALREADY_IN_ROOM',
  ACCOUNT_RESTRICTED: 'ACCOUNT_RESTRICTED',
  TICKET_NOT_FOUND: 'TICKET_NOT_FOUND',
  CANNOT_CANCEL_MATCHED: 'CANNOT_CANCEL_MATCHED',
  UNAUTHORIZED_CANCELLATION: 'UNAUTHORIZED_CANCELLATION',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  MATCHMAKING_DISABLED: 'MATCHMAKING_DISABLED',
} as const;

export type MatchmakingErrorCode =
  (typeof MatchmakingErrorCodes)[keyof typeof MatchmakingErrorCodes];

export const MatchmakingSystemEvents = {
  TICKET_STATUS: 'matchmaking:status',
  MATCH_FOUND: 'matchmaking:matched',
  TICKET_CANCELLED: 'matchmaking:cancelled',
} as const;

export type MatchmakingSystemEvent =
  (typeof MatchmakingSystemEvents)[keyof typeof MatchmakingSystemEvents];
