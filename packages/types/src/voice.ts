// ============================================================================
// PHASE 6F: VOICE SERVICE FOUNDATION CONTRACTS & DTOs
// ============================================================================

export type VoiceRoomContextType = 'PARTY' | 'GAME_ROOM';

export type VoicePermissionState = 'VOICE_OPEN' | 'VOICE_RESTRICTED' | 'VOICE_MUTED';

export type VoiceConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'FAILED';

export type VoiceQualityRating = 'EXCELLENT' | 'GOOD' | 'POOR' | 'UNKNOWN';

export interface VoiceParticipantState {
  userId: string;
  username: string;
  displayName?: string;
  isSpeaking: boolean;
  isSelfMuted: boolean;
  isServerMuted: boolean;
  quality: VoiceQualityRating;
  joinedAt: number;
}

export interface VoiceRoomSummaryDto {
  voiceRoomId: string;
  contextType: VoiceRoomContextType;
  contextId: string;
  permissionState: VoicePermissionState;
  participantCount: number;
  participants: VoiceParticipantState[];
}

export interface VoiceAccessGrantDto {
  token: string;
  voiceRoomId: string;
  contextType: VoiceRoomContextType;
  contextId: string;
  userId: string;
  provider: 'mock' | 'livekit';
  serverUrl?: string;
  expiresAt: number; // Unix timestamp in milliseconds
  permissionState: VoicePermissionState;
}

export interface RequestVoiceGrantDto {
  contextType: VoiceRoomContextType;
  contextId: string;
}

export interface UpdateVoicePermissionsDto {
  permissionState: VoicePermissionState;
}

export interface ModerationMuteDto {
  targetUserId: string;
  muted: boolean;
  reason?: string;
}

export interface ReportVoiceParticipantDto {
  contextType: VoiceRoomContextType;
  contextId: string;
  reportedUserId: string;
  reason: string;
  details?: string;
}

export const VoiceErrorCodes = {
  VOICE_UNAUTHORIZED: 'VOICE_UNAUTHORIZED',
  VOICE_ROOM_NOT_FOUND: 'VOICE_ROOM_NOT_FOUND',
  VOICE_ROOM_FULL: 'VOICE_ROOM_FULL',
  VOICE_PERMISSION_DENIED: 'VOICE_PERMISSION_DENIED',
  VOICE_PROVIDER_UNAVAILABLE: 'VOICE_PROVIDER_UNAVAILABLE',
  VOICE_CONNECTION_FAILED: 'VOICE_CONNECTION_FAILED',
  VOICE_TOKEN_INVALID: 'VOICE_TOKEN_INVALID',
  VOICE_RATE_LIMITED: 'VOICE_RATE_LIMITED',
  VOICE_INVALID_STATE: 'VOICE_INVALID_STATE',
} as const;

export type VoiceErrorCode = (typeof VoiceErrorCodes)[keyof typeof VoiceErrorCodes];

export const VoiceSystemEvents = {
  PARTICIPANT_JOINED: 'voice:participant_joined',
  PARTICIPANT_LEFT: 'voice:participant_left',
  SPEAKING_CHANGED: 'voice:speaking_changed',
  STATE_CHANGED: 'voice:state_changed',
  PERMISSIONS_UPDATED: 'voice:permissions_updated',
  QUALITY_CHANGED: 'voice:quality_changed',
} as const;

export type VoiceSystemEvent = (typeof VoiceSystemEvents)[keyof typeof VoiceSystemEvents];

export const VOICE_CONSTANTS = {
  TOKEN_TTL_MS: 60 * 60 * 1000, // 1 hour bounded
  MAX_ROOM_CAPACITY: 16,
  RECONNECT_GRACE_PERIOD_MS: 30 * 1000,
  SWEEP_INTERVAL_MS: 15 * 1000,
} as const;
