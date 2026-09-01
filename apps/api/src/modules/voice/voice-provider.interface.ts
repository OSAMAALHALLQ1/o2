import type {
  VoiceAccessGrantDto,
  VoicePermissionState,
  VoiceRoomContextType,
} from '@o2/types';

export interface GenerateAccessGrantParams {
  voiceRoomId: string;
  contextType: VoiceRoomContextType;
  contextId: string;
  userId: string;
  username: string;
  permissionState: VoicePermissionState;
  ttlMs?: number;
}

export interface IVoiceProviderAdapter {
  readonly providerName: 'mock' | 'livekit';

  isAvailable(): boolean;

  generateAccessGrant(params: GenerateAccessGrantParams): Promise<VoiceAccessGrantDto>;

  createVoiceRoom(voiceRoomId: string): Promise<void>;

  closeVoiceRoom(voiceRoomId: string): Promise<void>;

  muteParticipant(voiceRoomId: string, userId: string, muted: boolean): Promise<void>;

  updateRoomPermissions(
    voiceRoomId: string,
    permission: VoicePermissionState,
  ): Promise<void>;
}
