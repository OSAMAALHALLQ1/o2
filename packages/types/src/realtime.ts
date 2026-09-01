export const REALTIME_PROTOCOL_VERSION = '1.0' as const;
export type RealtimeProtocolVersion = typeof REALTIME_PROTOCOL_VERSION;

export type ConnectionState =
  | 'CONNECTING'
  | 'AUTHENTICATING'
  | 'CONNECTED'
  | 'DISCONNECTING'
  | 'DISCONNECTED';

export interface ClientEventEnvelope<TPayload = unknown> {
  protocolVersion: string;
  event: string;
  requestId: string;
  payload: TPayload;
}

export interface ServerEventEnvelope<TPayload = unknown> {
  protocolVersion: string;
  event: string;
  requestId?: string;
  sequence: number;
  serverTimestamp: number;
  payload: TPayload;
}

export interface ErrorEnvelope {
  protocolVersion: string;
  requestId?: string;
  code: string;
  message: string;
}

export const RealtimeErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  ACCOUNT_RESTRICTED: 'ACCOUNT_RESTRICTED',
  INVALID_PROTOCOL_VERSION: 'INVALID_PROTOCOL_VERSION',
  MALFORMED_ENVELOPE: 'MALFORMED_ENVELOPE',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  HEARTBEAT_TIMEOUT: 'HEARTBEAT_TIMEOUT',
  UNKNOWN_EVENT: 'UNKNOWN_EVENT',
  INVALID_REQUEST_ID: 'INVALID_REQUEST_ID',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type RealtimeErrorCode =
  (typeof RealtimeErrorCodes)[keyof typeof RealtimeErrorCodes];

export const RealtimeSystemEvents = {
  HANDSHAKE_READY: 'auth:ready',
  PING: 'system:ping',
  PONG: 'system:pong',
  ERROR: 'system:error',
  DISCONNECT: 'system:disconnect',
} as const;

export type RealtimeSystemEvent =
  (typeof RealtimeSystemEvents)[keyof typeof RealtimeSystemEvents];

export interface HandshakeReadyPayload {
  connectionId: string;
  userId: string;
  sessionId: string;
  serverTime: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
}

export interface HeartbeatPayload {
  clientTime?: number;
  serverTime: number;
}

export const REALTIME_CONSTANTS = {
  HEARTBEAT_INTERVAL_MS: 15_000,
  HEARTBEAT_TIMEOUT_MS: 45_000,
  MAX_PAYLOAD_BYTES: 16 * 1024, // 16 KB
  MAX_REQUEST_ID_LENGTH: 64,
  REQUEST_ID_REGEX: /^[a-zA-Z0-9_.:-]+$/,
  RATE_LIMIT_WINDOW_MS: 10_000,
  RATE_LIMIT_MAX_EVENTS: 50,
  RATE_LIMIT_MAX_MALFORMED: 5,
} as const;

// ==========================================
// PHASE 6B: ROOM ENGINE CONTRACTS
// ==========================================

export const ROOM_GAME_MODES = {
  ATRASH: 'ATRASH',
  MAFIA_CLASSIC: 'MAFIA_CLASSIC',
  TARNEEB: 'TARNEEB',
  HIDE_AND_SEEK: 'HIDE_AND_SEEK',
  O2_IMPOSTER: 'O2_IMPOSTER',
} as const;

export type RoomGameMode = (typeof ROOM_GAME_MODES)[keyof typeof ROOM_GAME_MODES];

export const ROOM_CAPACITIES: Record<RoomGameMode, number> = {
  ATRASH: 5,
  MAFIA_CLASSIC: 14,
  TARNEEB: 4,
  HIDE_AND_SEEK: 8,
  O2_IMPOSTER: 8,
} as const;

export type RoomState =
  | 'CREATING'
  | 'WAITING'
  | 'READY'
  | 'RUNNING'
  | 'ENDING'
  | 'ENDED'
  | 'CLOSED';

export const RoomErrorCodes = {
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_CLOSED: 'ROOM_CLOSED',
  ROOM_ALREADY_JOINED: 'ROOM_ALREADY_JOINED',
  NOT_ROOM_MEMBER: 'NOT_ROOM_MEMBER',
  INVALID_ROOM_STATE: 'INVALID_ROOM_STATE',
  INVALID_ROOM_ACTION: 'INVALID_ROOM_ACTION',
  ROOM_ACTION_DUPLICATE: 'ROOM_ACTION_DUPLICATE',
  ROOM_ACTION_RATE_LIMITED: 'ROOM_ACTION_RATE_LIMITED',
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  INVALID_GAME_MODE: 'INVALID_GAME_MODE',
} as const;

export type RoomErrorCode = (typeof RoomErrorCodes)[keyof typeof RoomErrorCodes];

export interface RoomParticipant {
  userId: string;
  username: string;
  displayName?: string;
  joinedAt: number;
  isReady: boolean;
  role?: string;
  customData?: Record<string, unknown>;
}

export interface PublicRoomParticipantProjection {
  userId: string;
  username: string;
  displayName?: string;
  isReady: boolean;
  joinedAt: number;
}

export interface PublicRoomProjection {
  roomId: string;
  gameMode: RoomGameMode;
  state: RoomState;
  capacity: number;
  participantCount: number;
  participants: PublicRoomParticipantProjection[];
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface PlayerRoomProjection extends PublicRoomProjection {
  self: RoomParticipant;
  playerData?: unknown;
}

export interface RoomAction<TPayload = unknown> {
  actionId: string;
  roomId: string;
  userId: string;
  type: string;
  payload: TPayload;
  receivedAt: number;
}

export const ROOM_LIMITS = {
  IDLE_ROOM_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes
  CLOSED_ROOM_RETENTION_MS: 60 * 1000,   // 1 minute
  ACTION_DEDUP_TTL_MS: 5 * 60 * 1000,     // 5 minutes
  ACTION_DEDUP_MAX_ENTRIES: 1000,
  MAX_ACTIONS_PER_WINDOW: 30,
  ACTION_WINDOW_MS: 10 * 1000,            // 30 actions / 10 seconds
} as const;

export const RoomSystemEvents = {
  STATE_SYNC: 'room:state',
  PLAYER_JOINED: 'room:player_joined',
  PLAYER_LEFT: 'room:player_left',
  PLAYER_READY: 'room:player_ready',
  ROOM_CLOSED: 'room:closed',
  ACTION_RESULT: 'room:action_result',
} as const;
