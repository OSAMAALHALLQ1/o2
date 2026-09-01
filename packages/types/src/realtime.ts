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
