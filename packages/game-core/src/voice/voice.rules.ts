import type {
  VoiceConnectionState,
  VoicePermissionState,
  VoiceQualityRating,
  VoiceRoomContextType,
} from '@o2/types';

export class InvalidVoiceStateTransitionError extends Error {
  readonly from: string;
  readonly to: string;

  constructor(from: string, to: string, entity = 'Connection') {
    super(`انتقال غير صالح لحالة ${entity}: من ${from} إلى ${to}`);
    this.name = 'InvalidVoiceStateTransitionError';
    this.from = from;
    this.to = to;
  }
}

// ============================================================================
// 1. VOICE ROOM IDENTIFIERS
// ============================================================================

export function generateVoiceRoomId(
  contextType: VoiceRoomContextType,
  contextId: string,
): string {
  const sanitizedId = contextId.trim();
  if (!sanitizedId) {
    throw new Error('معرف السياق لا يمكن أن يكون فارغاً');
  }
  return `vroom_${contextType.toLowerCase()}_${sanitizedId}`;
}

export function parseVoiceRoomId(
  voiceRoomId: string,
): { contextType: VoiceRoomContextType; contextId: string } | null {
  if (!voiceRoomId || typeof voiceRoomId !== 'string') return null;
  if (voiceRoomId.startsWith('vroom_party_')) {
    const contextId = voiceRoomId.slice('vroom_party_'.length);
    if (!contextId) return null;
    return { contextType: 'PARTY', contextId };
  }
  if (voiceRoomId.startsWith('vroom_game_room_')) {
    const contextId = voiceRoomId.slice('vroom_game_room_'.length);
    if (!contextId) return null;
    return { contextType: 'GAME_ROOM', contextId };
  }
  return null;
}

// ============================================================================
// 2. CONNECTION STATE MACHINE
// ============================================================================

const ALLOWED_CONNECTION_TRANSITIONS: Record<
  VoiceConnectionState,
  ReadonlySet<VoiceConnectionState>
> = {
  DISCONNECTED: new Set(['CONNECTING']),
  CONNECTING: new Set(['CONNECTED', 'FAILED', 'DISCONNECTED']),
  CONNECTED: new Set(['RECONNECTING', 'DISCONNECTED', 'FAILED']),
  RECONNECTING: new Set(['CONNECTED', 'FAILED', 'DISCONNECTED']),
  FAILED: new Set(['CONNECTING', 'DISCONNECTED']),
};

export function isValidVoiceConnectionTransition(
  from: VoiceConnectionState,
  to: VoiceConnectionState,
): boolean {
  if (from === to) return true;
  return ALLOWED_CONNECTION_TRANSITIONS[from]?.has(to) ?? false;
}

export function assertValidVoiceConnectionTransition(
  from: VoiceConnectionState,
  to: VoiceConnectionState,
): void {
  if (!isValidVoiceConnectionTransition(from, to)) {
    throw new InvalidVoiceStateTransitionError(from, to, 'VoiceConnection');
  }
}

// ============================================================================
// 3. PERMISSION STATE MACHINE
// ============================================================================

const VALID_PERMISSION_STATES = new Set<VoicePermissionState>([
  'VOICE_OPEN',
  'VOICE_RESTRICTED',
  'VOICE_MUTED',
]);

export function isValidVoicePermissionState(state: string): state is VoicePermissionState {
  return VALID_PERMISSION_STATES.has(state as VoicePermissionState);
}

export function isValidVoicePermissionTransition(
  from: VoicePermissionState,
  to: VoicePermissionState,
): boolean {
  if (!isValidVoicePermissionState(from) || !isValidVoicePermissionState(to)) {
    return false;
  }
  return true; // All transitions between valid permission states are permitted
}

// ============================================================================
// 4. PARTICIPANT SPEAKING EVALUATION
// ============================================================================

export interface CanParticipantSpeakParams {
  permissionState: VoicePermissionState;
  isSelfMuted: boolean;
  isServerMuted: boolean;
  hasRestrictedSpeakingGrant?: boolean;
}

/**
 * Pure function determining whether a participant is authorized to broadcast audio.
 *
 * Rules:
 * 1. If self-muted -> CANNOT speak.
 * 2. If server-muted (moderation) -> CANNOT speak.
 * 3. If room is VOICE_MUTED -> CANNOT speak.
 * 4. If room is VOICE_RESTRICTED -> CANNOT speak unless explicitly granted.
 * 5. If room is VOICE_OPEN -> CAN speak.
 */
export function canParticipantSpeak(params: CanParticipantSpeakParams): boolean {
  if (params.isSelfMuted) return false;
  if (params.isServerMuted) return false;

  switch (params.permissionState) {
    case 'VOICE_MUTED':
      return false;
    case 'VOICE_RESTRICTED':
      return Boolean(params.hasRestrictedSpeakingGrant);
    case 'VOICE_OPEN':
      return true;
    default:
      return false;
  }
}

// ============================================================================
// 5. LOCAL MUTE AUDIO SUPPRESSION (CLIENT-ONLY)
// ============================================================================

export interface ShouldPlayAudioParams {
  targetUserId: string;
  locallyMutedUserIds: Set<string> | string[];
  isTargetSpeaking: boolean;
}

/**
 * Pure function determining whether target audio should be played on local device.
 * Local mute is strictly client-side and never mutates server or moderation state.
 */
export function shouldPlayAudio(params: ShouldPlayAudioParams): boolean {
  const isMutedLocally = Array.isArray(params.locallyMutedUserIds)
    ? params.locallyMutedUserIds.includes(params.targetUserId)
    : params.locallyMutedUserIds.has(params.targetUserId);

  if (isMutedLocally) return false;
  return params.isTargetSpeaking;
}

// ============================================================================
// 6. CONNECTION QUALITY NORMALIZATION
// ============================================================================

/**
 * Normalizes raw WebRTC metrics into a standardized provider-independent VoiceQualityRating.
 */
export function normalizeVoiceQuality(
  packetLossPercentage: number,
  jitterMs = 0,
): VoiceQualityRating {
  if (
    typeof packetLossPercentage !== 'number' ||
    isNaN(packetLossPercentage) ||
    packetLossPercentage < 0 ||
    packetLossPercentage > 100
  ) {
    return 'UNKNOWN';
  }

  if (packetLossPercentage <= 2 && jitterMs <= 50) {
    return 'EXCELLENT';
  }
  if (packetLossPercentage <= 8 && jitterMs <= 150) {
    return 'GOOD';
  }
  return 'POOR';
}
