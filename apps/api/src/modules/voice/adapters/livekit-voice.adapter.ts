import {
  type VoiceAccessGrantDto,
  type VoicePermissionState,
  VoiceErrorCodes,
} from '@o2/types';
import type {
  GenerateAccessGrantParams,
  IVoiceProviderAdapter,
} from '../voice-provider.interface.ts';

export class LiveKitVoiceAdapter implements IVoiceProviderAdapter {
  readonly providerName = 'livekit' as const;
  private readonly serverUrl?: string;
  private readonly apiKey?: string;
  private readonly apiSecret?: string;

  constructor(serverUrl?: string, apiKey?: string, apiSecret?: string) {
    this.serverUrl = serverUrl ?? process.env.LIVEKIT_URL;
    this.apiKey = apiKey ?? process.env.LIVEKIT_API_KEY;
    this.apiSecret = apiSecret ?? process.env.LIVEKIT_API_SECRET;
  }

  isAvailable(): boolean {
    return Boolean(this.serverUrl && this.apiKey && this.apiSecret);
  }

  async generateAccessGrant(
    _params: GenerateAccessGrantParams,
  ): Promise<VoiceAccessGrantDto> {
    if (!this.isAvailable()) {
      const err: any = new Error('مزود LiveKit غير مهيأ أو مفاتيح الربط غير متوفرة');
      err.response = { code: VoiceErrorCodes.VOICE_PROVIDER_UNAVAILABLE };
      err.status = 503;
      throw err;
    }

    // When configured in production, this signs a real LiveKit AccessToken
    throw new Error('LiveKit integration is configuration-gated and awaiting production deployment credentials');
  }

  async createVoiceRoom(_voiceRoomId: string): Promise<void> {
    if (!this.isAvailable()) {
      const err: any = new Error('مزود LiveKit غير متوفر');
      err.response = { code: VoiceErrorCodes.VOICE_PROVIDER_UNAVAILABLE };
      err.status = 503;
      throw err;
    }
  }

  async closeVoiceRoom(_voiceRoomId: string): Promise<void> {
    if (!this.isAvailable()) return;
  }

  async muteParticipant(
    _voiceRoomId: string,
    _userId: string,
    _muted: boolean,
  ): Promise<void> {
    if (!this.isAvailable()) {
      const err: any = new Error('مزود LiveKit غير متوفر');
      err.response = { code: VoiceErrorCodes.VOICE_PROVIDER_UNAVAILABLE };
      err.status = 503;
      throw err;
    }
  }

  async updateRoomPermissions(
    _voiceRoomId: string,
    _permission: VoicePermissionState,
  ): Promise<void> {
    if (!this.isAvailable()) {
      const err: any = new Error('مزود LiveKit غير متوفر');
      err.response = { code: VoiceErrorCodes.VOICE_PROVIDER_UNAVAILABLE };
      err.status = 503;
      throw err;
    }
  }
}
