import {
  type VoiceAccessGrantDto,
  type VoiceConnectionState,
  type VoiceParticipantState,
  type VoiceQualityRating,
  VoiceSystemEvents,
} from '@o2/types';

export type VoiceClientEventHandler = (event: string, data: any) => void;

const ALLOWED_TRANSITIONS: Record<
  VoiceConnectionState,
  ReadonlySet<VoiceConnectionState>
> = {
  DISCONNECTED: new Set(['CONNECTING']),
  CONNECTING: new Set(['CONNECTED', 'FAILED', 'DISCONNECTED']),
  CONNECTED: new Set(['RECONNECTING', 'DISCONNECTED', 'FAILED']),
  RECONNECTING: new Set(['CONNECTED', 'FAILED', 'DISCONNECTED']),
  FAILED: new Set(['CONNECTING', 'DISCONNECTED']),
};

export class VoiceClient {
  private connectionState: VoiceConnectionState = 'DISCONNECTED';
  private grant: VoiceAccessGrantDto | null = null;
  private readonly participants = new Map<string, VoiceParticipantState>();
  private readonly locallyMutedUsers = new Set<string>();
  private readonly eventHandlers = new Set<VoiceClientEventHandler>();

  getConnectionState(): VoiceConnectionState {
    return this.connectionState;
  }

  getGrant(): VoiceAccessGrantDto | null {
    return this.grant;
  }

  getParticipants(): VoiceParticipantState[] {
    return Array.from(this.participants.values());
  }

  getParticipant(userId: string): VoiceParticipantState | undefined {
    return this.participants.get(userId);
  }

  isLocallyMuted(userId: string): boolean {
    return this.locallyMutedUsers.has(userId);
  }

  setLocalMute(userId: string, isMuted: boolean): void {
    if (isMuted) {
      this.locallyMutedUsers.add(userId);
    } else {
      this.locallyMutedUsers.delete(userId);
    }
    this.emit('local_mute_changed', { userId, isMuted });
  }

  shouldPlayParticipantAudio(userId: string): boolean {
    const p = this.participants.get(userId);
    if (!p) return false;
    if (this.locallyMutedUsers.has(userId)) return false;
    return p.isSpeaking;
  }

  async connect(grant: VoiceAccessGrantDto): Promise<void> {
    this.setConnectionState('CONNECTING');
    this.grant = grant;

    try {
      // In Phase 6F mock adapter mode, connection immediately transitions to CONNECTED
      // When LiveKit is configured, the provider-specific SDK connects behind this method
      this.setConnectionState('CONNECTED');
    } catch {
      this.setConnectionState('FAILED');
      throw new Error('فشل الاتصال بخادم الصوت');
    }
  }

  disconnect(): void {
    if (this.connectionState !== 'DISCONNECTED') {
      this.setConnectionState('DISCONNECTED');
    }
    this.grant = null;
    this.participants.clear();
  }

  handleRemoteEvent(event: string, payload: any): void {
    switch (event) {
      case VoiceSystemEvents.PARTICIPANT_JOINED:
        if (payload.participant) {
          this.participants.set(payload.participant.userId, payload.participant);
        }
        break;
      case VoiceSystemEvents.PARTICIPANT_LEFT:
        if (payload.userId) {
          this.participants.delete(payload.userId);
        }
        break;
      case VoiceSystemEvents.SPEAKING_CHANGED:
        if (payload.userId) {
          const p = this.participants.get(payload.userId);
          if (p) {
            p.isSpeaking = payload.isSpeaking;
            if (payload.isSelfMuted !== undefined) p.isSelfMuted = payload.isSelfMuted;
            if (payload.isServerMuted !== undefined) p.isServerMuted = payload.isServerMuted;
          }
        }
        break;
      case VoiceSystemEvents.PERMISSIONS_UPDATED:
        if (this.grant && payload.permissionState) {
          this.grant.permissionState = payload.permissionState;
        }
        break;
      case VoiceSystemEvents.QUALITY_CHANGED:
        if (payload.userId && payload.quality) {
          const p = this.participants.get(payload.userId);
          if (p) {
            p.quality = payload.quality as VoiceQualityRating;
          }
        }
        break;
    }

    this.emit(event, payload);
  }

  on(handler: VoiceClientEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  private setConnectionState(newState: VoiceConnectionState): void {
    if (this.connectionState !== newState) {
      const allowed = ALLOWED_TRANSITIONS[this.connectionState]?.has(newState);
      if (!allowed) {
        throw new Error(
          `انتقال غير صالح لحالة الصوت: من ${this.connectionState} إلى ${newState}`,
        );
      }
      this.connectionState = newState;
      this.emit('connection_state_changed', { state: newState });
    }
  }

  private emit(event: string, data: any): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event, data);
      } catch {
        // Suppress unhandled handler exceptions
      }
    }
  }
}
