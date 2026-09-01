import {
  type VoiceParticipantState,
  type VoicePermissionState,
  type VoiceQualityRating,
  type VoiceRoomContextType,
  type VoiceRoomSummaryDto,
  VOICE_CONSTANTS,
  VoiceErrorCodes,
} from '@o2/types';
import {
  generateVoiceRoomId,
  canParticipantSpeak,
} from '@o2/game-core';

export class VoiceRoom {
  readonly voiceRoomId: string;
  readonly contextType: VoiceRoomContextType;
  readonly contextId: string;
  private permissionState: VoicePermissionState;
  private readonly participants = new Map<string, VoiceParticipantState>();
  readonly createdAt: number;

  constructor(
    voiceRoomId: string,
    contextType: VoiceRoomContextType,
    contextId: string,
    initialPermission: VoicePermissionState = 'VOICE_OPEN',
  ) {
    this.voiceRoomId = voiceRoomId;
    this.contextType = contextType;
    this.contextId = contextId;
    this.permissionState = initialPermission;
    this.createdAt = Date.now();
  }

  getPermissions(): VoicePermissionState {
    return this.permissionState;
  }

  setPermissions(newPermission: VoicePermissionState): void {
    this.permissionState = newPermission;
    // Re-evaluate speaking states based on new room permissions
    for (const p of this.participants.values()) {
      p.isSpeaking = canParticipantSpeak({
        permissionState: this.permissionState,
        isSelfMuted: p.isSelfMuted,
        isServerMuted: p.isServerMuted,
      });
    }
  }

  addParticipant(user: {
    userId: string;
    username: string;
    displayName?: string;
  }): VoiceParticipantState {
    if (
      this.participants.size >= VOICE_CONSTANTS.MAX_ROOM_CAPACITY &&
      !this.participants.has(user.userId)
    ) {
      const err: any = new Error('غرفة الصوت ممتلئة بالكامل');
      err.response = { code: VoiceErrorCodes.VOICE_ROOM_FULL };
      err.status = 409;
      throw err;
    }

    let participant = this.participants.get(user.userId);
    if (!participant) {
      participant = {
        userId: user.userId,
        username: user.username,
        displayName: user.displayName,
        isSpeaking: false,
        isSelfMuted: false,
        isServerMuted: false,
        quality: 'EXCELLENT',
        joinedAt: Date.now(),
      };
      this.participants.set(user.userId, participant);
    }

    return { ...participant };
  }

  removeParticipant(userId: string): boolean {
    return this.participants.delete(userId);
  }

  getParticipant(userId: string): VoiceParticipantState | undefined {
    const p = this.participants.get(userId);
    return p ? { ...p } : undefined;
  }

  getAllParticipants(): VoiceParticipantState[] {
    return Array.from(this.participants.values()).map((p) => ({ ...p }));
  }

  getParticipantCount(): number {
    return this.participants.size;
  }

  setSelfMute(userId: string, isSelfMuted: boolean): VoiceParticipantState {
    const p = this.participants.get(userId);
    if (!p) {
      const err: any = new Error('المشارك غير موجود في غرفة الصوت');
      err.response = { code: VoiceErrorCodes.VOICE_UNAUTHORIZED };
      err.status = 404;
      throw err;
    }

    p.isSelfMuted = isSelfMuted;
    p.isSpeaking = canParticipantSpeak({
      permissionState: this.permissionState,
      isSelfMuted: p.isSelfMuted,
      isServerMuted: p.isServerMuted,
    });

    return { ...p };
  }

  setServerMute(userId: string, isServerMuted: boolean): VoiceParticipantState {
    const p = this.participants.get(userId);
    if (!p) {
      const err: any = new Error('المشارك غير موجود في غرفة الصوت');
      err.response = { code: VoiceErrorCodes.VOICE_UNAUTHORIZED };
      err.status = 404;
      throw err;
    }

    p.isServerMuted = isServerMuted;
    p.isSpeaking = canParticipantSpeak({
      permissionState: this.permissionState,
      isSelfMuted: p.isSelfMuted,
      isServerMuted: p.isServerMuted,
    });

    return { ...p };
  }

  setSpeaking(userId: string, isSpeaking: boolean): VoiceParticipantState {
    const p = this.participants.get(userId);
    if (!p) {
      const err: any = new Error('المشارك غير موجود في غرفة الصوت');
      err.response = { code: VoiceErrorCodes.VOICE_UNAUTHORIZED };
      err.status = 404;
      throw err;
    }

    // Must be allowed to speak
    const allowed = canParticipantSpeak({
      permissionState: this.permissionState,
      isSelfMuted: p.isSelfMuted,
      isServerMuted: p.isServerMuted,
    });

    p.isSpeaking = allowed ? isSpeaking : false;
    return { ...p };
  }

  setQuality(userId: string, quality: VoiceQualityRating): VoiceParticipantState {
    const p = this.participants.get(userId);
    if (!p) {
      const err: any = new Error('المشارك غير موجود في غرفة الصوت');
      err.response = { code: VoiceErrorCodes.VOICE_UNAUTHORIZED };
      err.status = 404;
      throw err;
    }

    p.quality = quality;
    return { ...p };
  }

  toSummaryDto(): VoiceRoomSummaryDto {
    return {
      voiceRoomId: this.voiceRoomId,
      contextType: this.contextType,
      contextId: this.contextId,
      permissionState: this.permissionState,
      participantCount: this.participants.size,
      participants: this.getAllParticipants(),
    };
  }
}

export class VoiceRoomManager {
  private readonly rooms = new Map<string, VoiceRoom>(); // voiceRoomId -> VoiceRoom
  private readonly userToVoiceRoomId = new Map<string, string>(); // userId -> voiceRoomId

  getOrCreateRoom(
    contextType: VoiceRoomContextType,
    contextId: string,
    initialPermission: VoicePermissionState = 'VOICE_OPEN',
  ): VoiceRoom {
    const voiceRoomId = generateVoiceRoomId(contextType, contextId);
    let room = this.rooms.get(voiceRoomId);
    if (!room) {
      room = new VoiceRoom(voiceRoomId, contextType, contextId, initialPermission);
      this.rooms.set(voiceRoomId, room);
    }
    return room;
  }

  getRoom(voiceRoomId: string): VoiceRoom | undefined {
    return this.rooms.get(voiceRoomId);
  }

  getRoomByContext(
    contextType: VoiceRoomContextType,
    contextId: string,
  ): VoiceRoom | undefined {
    const voiceRoomId = generateVoiceRoomId(contextType, contextId);
    return this.rooms.get(voiceRoomId);
  }

  registerParticipantPlacement(userId: string, voiceRoomId: string): void {
    this.userToVoiceRoomId.set(userId, voiceRoomId);
  }

  unregisterParticipantPlacement(userId: string): void {
    this.userToVoiceRoomId.delete(userId);
  }

  getUserVoiceRoomId(userId: string): string | undefined {
    return this.userToVoiceRoomId.get(userId);
  }

  closeRoom(voiceRoomId: string): void {
    const room = this.rooms.get(voiceRoomId);
    if (room) {
      for (const p of room.getAllParticipants()) {
        this.userToVoiceRoomId.delete(p.userId);
      }
      this.rooms.delete(voiceRoomId);
    }
  }

  getActiveRoomCount(): number {
    return this.rooms.size;
  }
}
