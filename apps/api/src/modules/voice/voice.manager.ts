import { randomUUID } from 'node:crypto';
import {
  type ModerationMuteDto,
  type ReportVoiceParticipantDto,
  type RequestVoiceGrantDto,
  type VoiceAccessGrantDto,
  type VoiceParticipantState,
  type VoicePermissionState,
  type VoiceQualityRating,
  type VoiceRoomContextType,
  type VoiceRoomSummaryDto,
  VoiceErrorCodes,
  VoiceSystemEvents,
} from '@o2/types';
import type { RoomManager } from '../realtime/rooms/room-manager';
import type { RealtimeServer } from '../realtime/transport/realtime-server.interface';
import type { IVoiceProviderAdapter } from './voice-provider.interface';
import type { VoiceRoomManager } from './voice-room.manager';

export class VoiceServiceCore {
  protected readonly prisma: any;
  protected readonly providerAdapter: IVoiceProviderAdapter;
  protected readonly voiceRoomManager: VoiceRoomManager;
  protected readonly roomManager?: RoomManager;
  protected readonly realtimeServer?: RealtimeServer;

  // Track reports in-memory (safety hooks)
  private readonly reports: Array<{
    reportId: string;
    reporterId: string;
    reportedUserId: string;
    contextType: string;
    contextId: string;
    reason: string;
    details?: string;
    createdAt: number;
  }> = [];

  constructor(
    prisma: any,
    providerAdapter: IVoiceProviderAdapter,
    voiceRoomManager: VoiceRoomManager,
    roomManager?: RoomManager,
    realtimeServer?: RealtimeServer,
  ) {
    this.prisma = prisma;
    this.providerAdapter = providerAdapter;
    this.voiceRoomManager = voiceRoomManager;
    this.roomManager = roomManager;
    this.realtimeServer = realtimeServer;
  }

  // ==========================================================================
  // 1. CONTEXT AUTHORIZATION
  // ==========================================================================

  private async authorizeContext(
    userId: string,
    contextType: VoiceRoomContextType,
    contextId: string,
  ): Promise<{ username: string; displayName?: string; isLeader: boolean }> {
    if (!contextType || !contextId) {
      const err: any = new Error('بيانات سياق غرفة الصوت غير مكتملة');
      err.response = { code: VoiceErrorCodes.VOICE_UNAUTHORIZED };
      err.status = 403;
      throw err;
    }

    // 1. Verify User Moderation Status
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user || user.moderationStatus !== 'ACTIVE') {
      const err: any = new Error('الحساب مقيد أو غير مصرح له باستخدام المحادثة الصوتية');
      err.response = { code: VoiceErrorCodes.VOICE_UNAUTHORIZED };
      err.status = 403;
      throw err;
    }

    const username = user.profile?.username ?? user.id.slice(0, 8);
    const displayName = user.profile?.displayName ?? undefined;

    // 2. Context-Specific Authorization
    if (contextType === 'PARTY') {
      const membership = await this.prisma.partyMember.findUnique({
        where: { userId },
        include: { party: true },
      });

      if (!membership || membership.partyId !== contextId) {
        const err: any = new Error('المستخدم ليس عضواً في هذه المجموعة');
        err.response = { code: VoiceErrorCodes.VOICE_UNAUTHORIZED };
        err.status = 403;
        throw err;
      }

      if (membership.party.status !== 'ACTIVE') {
        const err: any = new Error('المجموعة غير نشطة');
        err.response = { code: VoiceErrorCodes.VOICE_UNAUTHORIZED };
        err.status = 403;
        throw err;
      }

      const isLeader = membership.party.leaderUserId === userId;
      return { username, displayName, isLeader };
    }

    if (contextType === 'GAME_ROOM') {
      if (!this.roomManager) {
        const err: any = new Error('محرك الغرف غير متوفر');
        err.response = { code: VoiceErrorCodes.VOICE_ROOM_NOT_FOUND };
        err.status = 503;
        throw err;
      }

      const userRoom = this.roomManager.getUserRoom(userId);
      if (!userRoom || userRoom.roomId !== contextId) {
        const err: any = new Error('المستخدم ليس عضواً في هذه الغرفة');
        err.response = { code: VoiceErrorCodes.VOICE_UNAUTHORIZED };
        err.status = 403;
        throw err;
      }

      if (userRoom.state === 'CLOSED') {
        const err: any = new Error('غرفة اللعبة غير موجودة أو مغلقة');
        err.response = { code: VoiceErrorCodes.VOICE_ROOM_NOT_FOUND };
        err.status = 404;
        throw err;
      }

      const isLeader = userRoom.creatorUserId === userId;
      return { username, displayName, isLeader };
    }

    const err: any = new Error(`نوع السياق غير مدعوم: ${contextType}`);
    err.response = { code: VoiceErrorCodes.VOICE_UNAUTHORIZED };
    err.status = 400;
    throw err;
  }

  // ==========================================================================
  // 2. ACCESS TOKEN / GRANT MINTING
  // ==========================================================================

  async requestVoiceGrant(
    userId: string,
    dto: RequestVoiceGrantDto,
  ): Promise<VoiceAccessGrantDto> {
    const { username, displayName } = await this.authorizeContext(
      userId,
      dto.contextType,
      dto.contextId,
    );

    // Get or create ephemeral room
    const room = this.voiceRoomManager.getOrCreateRoom(
      dto.contextType,
      dto.contextId,
    );

    // Add participant to the ephemeral room
    const participant = room.addParticipant({
      userId,
      username,
      displayName,
    });

    this.voiceRoomManager.registerParticipantPlacement(userId, room.voiceRoomId);

    // Request grant from provider adapter
    const grant = await this.providerAdapter.generateAccessGrant({
      voiceRoomId: room.voiceRoomId,
      contextType: dto.contextType,
      contextId: dto.contextId,
      userId,
      username,
      permissionState: room.getPermissions(),
    });

    // Notify other participants in room via realtime
    this.broadcastVoiceEvent(room, VoiceSystemEvents.PARTICIPANT_JOINED, {
      voiceRoomId: room.voiceRoomId,
      participant,
    });

    return grant;
  }

  // ==========================================================================
  // 3. ROOM SUMMARY & PARTICIPANT ACTIONS
  // ==========================================================================

  async getRoomSummary(
    userId: string,
    contextType: VoiceRoomContextType,
    contextId: string,
  ): Promise<VoiceRoomSummaryDto> {
    await this.authorizeContext(userId, contextType, contextId);

    const room = this.voiceRoomManager.getRoomByContext(contextType, contextId);
    if (!room) {
      return {
        voiceRoomId: `vroom_${contextType.toLowerCase()}_${contextId}`,
        contextType,
        contextId,
        permissionState: 'VOICE_OPEN',
        participantCount: 0,
        participants: [],
      };
    }

    return room.toSummaryDto();
  }

  async leaveVoiceRoom(
    userId: string,
    contextType: VoiceRoomContextType,
    contextId: string,
  ): Promise<{ left: boolean }> {
    const room = this.voiceRoomManager.getRoomByContext(contextType, contextId);
    if (!room) {
      return { left: true };
    }

    room.removeParticipant(userId);
    this.voiceRoomManager.unregisterParticipantPlacement(userId);

    this.broadcastVoiceEvent(room, VoiceSystemEvents.PARTICIPANT_LEFT, {
      voiceRoomId: room.voiceRoomId,
      userId,
    });

    if (room.getParticipantCount() === 0) {
      this.voiceRoomManager.closeRoom(room.voiceRoomId);
      await this.providerAdapter.closeVoiceRoom(room.voiceRoomId);
    }

    return { left: true };
  }

  async setSelfMute(
    userId: string,
    contextType: VoiceRoomContextType,
    contextId: string,
    isSelfMuted: boolean,
  ): Promise<VoiceParticipantState> {
    await this.authorizeContext(userId, contextType, contextId);

    const room = this.voiceRoomManager.getRoomByContext(contextType, contextId);
    if (!room) {
      const err: any = new Error('غرفة الصوت غير موجودة');
      err.response = { code: VoiceErrorCodes.VOICE_ROOM_NOT_FOUND };
      err.status = 404;
      throw err;
    }

    const participant = room.setSelfMute(userId, isSelfMuted);

    this.broadcastVoiceEvent(room, VoiceSystemEvents.SPEAKING_CHANGED, {
      voiceRoomId: room.voiceRoomId,
      userId,
      isSpeaking: participant.isSpeaking,
      isSelfMuted: participant.isSelfMuted,
      isServerMuted: participant.isServerMuted,
    });

    return participant;
  }

  async setServerMute(
    callerId: string,
    contextType: VoiceRoomContextType,
    contextId: string,
    dto: ModerationMuteDto,
  ): Promise<VoiceParticipantState> {
    const { isLeader } = await this.authorizeContext(
      callerId,
      contextType,
      contextId,
    );

    if (!isLeader) {
      const err: any = new Error('قائد المجموعة أو مضيف الغرفة فقط هو المخول بكتم أعضاء الغرفة');
      err.response = { code: VoiceErrorCodes.VOICE_PERMISSION_DENIED };
      err.status = 403;
      throw err;
    }

    const room = this.voiceRoomManager.getRoomByContext(contextType, contextId);
    if (!room) {
      const err: any = new Error('غرفة الصوت غير موجودة');
      err.response = { code: VoiceErrorCodes.VOICE_ROOM_NOT_FOUND };
      err.status = 404;
      throw err;
    }

    const participant = room.setServerMute(dto.targetUserId, dto.muted);

    await this.providerAdapter.muteParticipant(
      room.voiceRoomId,
      dto.targetUserId,
      dto.muted,
    );

    this.broadcastVoiceEvent(room, VoiceSystemEvents.SPEAKING_CHANGED, {
      voiceRoomId: room.voiceRoomId,
      userId: dto.targetUserId,
      isSpeaking: participant.isSpeaking,
      isSelfMuted: participant.isSelfMuted,
      isServerMuted: participant.isServerMuted,
    });

    return participant;
  }

  async updatePermissions(
    callerId: string,
    contextType: VoiceRoomContextType,
    contextId: string,
    newPermission: VoicePermissionState,
  ): Promise<VoiceRoomSummaryDto> {
    const { isLeader } = await this.authorizeContext(
      callerId,
      contextType,
      contextId,
    );

    if (!isLeader) {
      const err: any = new Error('قائد المجموعة أو مضيف الغرفة فقط هو المخول بتحديث صلاحيات الصوت');
      err.response = { code: VoiceErrorCodes.VOICE_PERMISSION_DENIED };
      err.status = 403;
      throw err;
    }

    const room = this.voiceRoomManager.getOrCreateRoom(contextType, contextId);
    room.setPermissions(newPermission);

    await this.providerAdapter.updateRoomPermissions(
      room.voiceRoomId,
      newPermission,
    );

    const summary = room.toSummaryDto();

    this.broadcastVoiceEvent(room, VoiceSystemEvents.PERMISSIONS_UPDATED, {
      voiceRoomId: room.voiceRoomId,
      permissionState: newPermission,
    });

    return summary;
  }

  async setSpeakingState(
    userId: string,
    contextType: VoiceRoomContextType,
    contextId: string,
    isSpeaking: boolean,
  ): Promise<VoiceParticipantState> {
    const room = this.voiceRoomManager.getRoomByContext(contextType, contextId);
    if (!room) {
      const err: any = new Error('غرفة الصوت غير موجودة');
      err.response = { code: VoiceErrorCodes.VOICE_ROOM_NOT_FOUND };
      err.status = 404;
      throw err;
    }

    const participant = room.setSpeaking(userId, isSpeaking);

    this.broadcastVoiceEvent(room, VoiceSystemEvents.SPEAKING_CHANGED, {
      voiceRoomId: room.voiceRoomId,
      userId,
      isSpeaking: participant.isSpeaking,
    });

    return participant;
  }

  async setConnectionQuality(
    userId: string,
    contextType: VoiceRoomContextType,
    contextId: string,
    quality: VoiceQualityRating,
  ): Promise<VoiceParticipantState> {
    const room = this.voiceRoomManager.getRoomByContext(contextType, contextId);
    if (!room) {
      const err: any = new Error('غرفة الصوت غير موجودة');
      err.response = { code: VoiceErrorCodes.VOICE_ROOM_NOT_FOUND };
      err.status = 404;
      throw err;
    }

    const participant = room.setQuality(userId, quality);

    this.broadcastVoiceEvent(room, VoiceSystemEvents.QUALITY_CHANGED, {
      voiceRoomId: room.voiceRoomId,
      userId,
      quality,
    });

    return participant;
  }

  // ==========================================================================
  // 4. SAFETY & MODERATION HOOKS
  // ==========================================================================

  async reportParticipant(
    reporterId: string,
    dto: ReportVoiceParticipantDto,
  ): Promise<{ reported: boolean; reportId: string }> {
    await this.authorizeContext(reporterId, dto.contextType, dto.contextId);

    const reportId = `vrep_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    this.reports.push({
      reportId,
      reporterId,
      reportedUserId: dto.reportedUserId,
      contextType: dto.contextType,
      contextId: dto.contextId,
      reason: dto.reason,
      details: dto.details,
      createdAt: Date.now(),
    });

    return { reported: true, reportId };
  }

  async blockParticipant(
    _userId: string,
    _targetUserId: string,
  ): Promise<{ blocked: boolean }> {
    // Safety hook: In Phase 6F, this is an integration hook ready for Phase 5 social blocks
    return { blocked: true };
  }

  getReports(): typeof this.reports {
    return [...this.reports];
  }

  // ==========================================================================
  // 5. REALTIME BROADCAST HELPER
  // ==========================================================================

  private broadcastVoiceEvent(
    room: { getAllParticipants: () => VoiceParticipantState[] },
    event: string,
    payload: any,
  ): void {
    if (!this.realtimeServer) return;
    const participants = room.getAllParticipants();
    for (const p of participants) {
      this.realtimeServer.sendToUser(p.userId, event, payload);
    }
  }
}
