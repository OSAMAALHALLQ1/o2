import { createHmac } from 'node:crypto';
import {
  type VoiceAccessGrantDto,
  type VoicePermissionState,
  VOICE_CONSTANTS,
} from '@o2/types';
import type {
  GenerateAccessGrantParams,
  IVoiceProviderAdapter,
} from '../voice-provider.interface.ts';

export class MockVoiceAdapter implements IVoiceProviderAdapter {
  readonly providerName = 'mock' as const;
  private readonly secretKey: string;
  private readonly activeRooms = new Set<string>();

  constructor(secretKey = 'mock_voice_internal_signing_key_not_for_prod') {
    this.secretKey = secretKey;
  }

  isAvailable(): boolean {
    return true;
  }

  async generateAccessGrant(
    params: GenerateAccessGrantParams,
  ): Promise<VoiceAccessGrantDto> {
    const ttlMs = params.ttlMs ?? VOICE_CONSTANTS.TOKEN_TTL_MS;
    const expiresAt = Date.now() + ttlMs;

    const payload = `${params.voiceRoomId}:${params.userId}:${params.permissionState}:${expiresAt}`;
    const signature = createHmac('sha256', this.secretKey)
      .update(payload)
      .digest('hex');

    const token = `mock_voice_token_${Buffer.from(payload).toString('base64url')}.${signature}`;

    this.activeRooms.add(params.voiceRoomId);

    return {
      token,
      voiceRoomId: params.voiceRoomId,
      contextType: params.contextType,
      contextId: params.contextId,
      userId: params.userId,
      provider: 'mock',
      expiresAt,
      permissionState: params.permissionState,
    };
  }

  async createVoiceRoom(voiceRoomId: string): Promise<void> {
    this.activeRooms.add(voiceRoomId);
  }

  async closeVoiceRoom(voiceRoomId: string): Promise<void> {
    this.activeRooms.delete(voiceRoomId);
  }

  async muteParticipant(
    _voiceRoomId: string,
    _userId: string,
    _muted: boolean,
  ): Promise<void> {
    // In mock adapter, mute is tracked in-memory by VoiceRoomManager
  }

  async updateRoomPermissions(
    _voiceRoomId: string,
    _permission: VoicePermissionState,
  ): Promise<void> {
    // In mock adapter, permissions are tracked in-memory by VoiceRoomManager
  }

  hasRoom(voiceRoomId: string): boolean {
    return this.activeRooms.has(voiceRoomId);
  }
}
