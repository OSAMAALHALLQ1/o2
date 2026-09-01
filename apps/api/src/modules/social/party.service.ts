import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  PartyGameMode,
  PartyInviteDto,
  PartySummaryDto,
  PARTY_INVITE_EXPIRY_MINUTES,
  PartyRealtimeEventType,
  PartyRealtimeSnapshot,
} from '@o2/types';
import { canonicalUserPair, generatePartyCode, getPartyCapacity } from '@o2/game-core';
import { PrismaService } from '../../prisma/prisma.service';
import { PartyRealtimeService } from '../realtime/party/party-realtime.service';
import { SocialErrorCodes } from './social.constants';

type Tx = Prisma.TransactionClient;

@Injectable()
export class PartyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partyRealtime?: PartyRealtimeService,
  ) {}

  private emitPartyEvent(
    partyId: string,
    type: PartyRealtimeEventType,
    summary: PartySummaryDto,
    details?: Record<string, unknown>,
    explicitRecipients?: string[],
  ): void {
    if (!this.partyRealtime) return;
    const snapshot: PartyRealtimeSnapshot = {
      partyId: summary.partyId,
      version: summary.version,
      roomCode: summary.roomCode,
      leaderId: summary.leaderId,
      desiredGameMode: summary.desiredGameMode,
      capacity: summary.capacity,
      allowJoinByCode: summary.allowJoinByCode,
      members: summary.members,
      updatedAt: Date.now(),
    };
    this.partyRealtime.publishPartyEvent(partyId, type, snapshot, details, explicitRecipients);
  }

  async createParty(userId: string): Promise<PartySummaryDto> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const summary = await this.prisma.$transaction(async (tx) => {
          await this.lockUsers(tx, [userId]);
          const existing = await tx.partyMember.findUnique({ where: { userId } });
          if (existing) return this.getPartyById(tx, existing.partyId, userId);

          const party = await tx.party.create({ data: { code: generatePartyCode(), leaderUserId: userId } });
          await tx.partyMember.create({ data: { partyId: party.id, userId } });
          return this.getPartyById(tx, party.id, userId);
        });
        this.emitPartyEvent(summary.partyId, 'PARTY_STATE_UPDATED', summary);
        return summary;
      } catch (error: any) {
        if (error?.code === 'P2002' && attempt < 4) continue;
        throw error;
      }
    }
    throw new ConflictException('تعذر إنشاء رمز مجموعة فريد.');
  }

  async getMyParty(userId: string): Promise<PartySummaryDto | null> {
    const membership = await this.prisma.partyMember.findUnique({ where: { userId } });
    return membership ? this.getPartyById(this.prisma, membership.partyId, userId) : null;
  }

  async invite(userId: string, partyId: string, inviteeId: string): Promise<PartyInviteDto> {
    if (userId === inviteeId) throw new BadRequestException({ code: SocialErrorCodes.INVALID_TARGET });
    return this.prisma.$transaction(async (tx) => {
      await this.lockUsers(tx, [userId, inviteeId]);
      await this.lockParty(tx, partyId);
      const party = await tx.party.findUnique({ where: { id: partyId } });
      if (!party || party.status !== 'ACTIVE') throw new NotFoundException({ code: SocialErrorCodes.PARTY_NOT_FOUND });
      if (party.leaderUserId !== userId) throw new ForbiddenException({ code: SocialErrorCodes.NOT_PARTY_LEADER });
      await this.assertUsersCanInteract(tx, userId, inviteeId);
      const pair = canonicalUserPair(userId, inviteeId);
      const friendship = await tx.friendship.findUnique({ where: { userLowId_userHighId: pair } });
      if (!friendship) throw new BadRequestException({ code: SocialErrorCodes.NOT_FRIENDS });
      const privacy = await tx.socialPrivacy.findUnique({ where: { userId: inviteeId } });
      if (privacy?.allowPartyInvites === false) throw new NotFoundException({ code: SocialErrorCodes.SOCIAL_ACTION_UNAVAILABLE });
      if (await tx.partyMember.findUnique({ where: { userId: inviteeId } })) {
        throw new ConflictException({ code: SocialErrorCodes.ALREADY_IN_PARTY });
      }
      const memberCount = await tx.partyMember.count({ where: { partyId } });
      if (memberCount >= getPartyCapacity(party.desiredGameMode as PartyGameMode | null)) {
        throw new ConflictException({ code: SocialErrorCodes.PARTY_FULL });
      }
      const existing = await tx.partyInvite.findFirst({ where: { partyId, inviteeId, status: 'PENDING' } });
      const invite = existing ?? await tx.partyInvite.create({
        data: {
          partyId,
          inviterId: userId,
          inviteeId,
          expiresAt: new Date(Date.now() + PARTY_INVITE_EXPIRY_MINUTES * 60_000),
        },
      });
      if (!existing) await tx.party.update({ where: { id: partyId }, data: { version: { increment: 1 } } });
      return this.serializeInvite(tx, invite.id, inviteeId);
    });
  }

  async listInvites(userId: string) {
    await this.expireInvites(userId);
    const rows = await this.prisma.partyInvite.findMany({
      where: { inviteeId: userId, status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 50,
    });
    return Promise.all(rows.map((row) => this.serializeInvite(this.prisma, row.id, userId)));
  }

  async acceptInvite(userId: string, inviteId: string): Promise<PartySummaryDto> {
    const initial = await this.prisma.partyInvite.findUnique({ where: { id: inviteId } });
    if (!initial || initial.inviteeId !== userId) throw new NotFoundException({ code: SocialErrorCodes.PARTY_INVITE_NOT_FOUND });
    const result = await this.prisma.$transaction(async (tx): Promise<PartySummaryDto | null> => {
      await this.lockUsers(tx, [userId]);
      await this.lockParty(tx, initial.partyId);
      const invite = await tx.partyInvite.findUnique({ where: { id: inviteId } });
      if (!invite || invite.inviteeId !== userId) throw new NotFoundException({ code: SocialErrorCodes.PARTY_INVITE_NOT_FOUND });
      const current = await tx.partyMember.findUnique({ where: { userId } });
      if (invite.status === 'ACCEPTED' && current?.partyId === invite.partyId) {
        return this.getPartyById(tx, invite.partyId, userId);
      }
      if (invite.status !== 'PENDING') throw new ConflictException({ code: SocialErrorCodes.PARTY_INVITE_NOT_FOUND });
      if (invite.expiresAt <= new Date()) {
        await tx.partyInvite.update({ where: { id: invite.id }, data: { status: 'EXPIRED', respondedAt: new Date() } });
        return null;
      }
      const party = await tx.party.findUnique({ where: { id: invite.partyId } });
      if (!party || party.status !== 'ACTIVE') throw new NotFoundException({ code: SocialErrorCodes.PARTY_NOT_FOUND });
      if (current) throw new ConflictException({ code: SocialErrorCodes.ALREADY_IN_PARTY });
      await this.assertUsersCanInteract(tx, userId, invite.inviterId);
      const memberCount = await tx.partyMember.count({ where: { partyId: party.id } });
      if (memberCount >= getPartyCapacity(party.desiredGameMode as PartyGameMode | null)) {
        throw new ConflictException({ code: SocialErrorCodes.PARTY_FULL });
      }
      await tx.partyMember.create({ data: { partyId: party.id, userId } });
      await tx.partyInvite.update({ where: { id: invite.id }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
      await tx.partyInvite.updateMany({
        where: { inviteeId: userId, status: 'PENDING', id: { not: invite.id } },
        data: { status: 'CANCELLED', respondedAt: new Date() },
      });
      await tx.party.update({ where: { id: party.id }, data: { version: { increment: 1 } } });
      return this.getPartyById(tx, party.id, userId);
    });
    if (!result) throw new ConflictException({ code: SocialErrorCodes.PARTY_INVITE_EXPIRED });
    this.emitPartyEvent(result.partyId, 'PARTY_MEMBER_JOINED', result, { joinedUserId: userId });
    return result;
  }

  async rejectInvite(userId: string, inviteId: string) {
    const initial = await this.prisma.partyInvite.findUnique({ where: { id: inviteId } });
    if (!initial || initial.inviteeId !== userId) throw new NotFoundException({ code: SocialErrorCodes.PARTY_INVITE_NOT_FOUND });
    return this.prisma.$transaction(async (tx) => {
      await this.lockUsers(tx, [userId]);
      await this.lockParty(tx, initial.partyId);
      const invite = await tx.partyInvite.findUnique({ where: { id: inviteId } });
      if (!invite || invite.inviteeId !== userId) throw new NotFoundException({ code: SocialErrorCodes.PARTY_INVITE_NOT_FOUND });
      if (invite.status === 'REJECTED') return { status: 'REJECTED' };
      if (invite.status !== 'PENDING') throw new ConflictException({ code: SocialErrorCodes.PARTY_INVITE_NOT_FOUND });
      await tx.partyInvite.update({ where: { id: inviteId }, data: { status: 'REJECTED', respondedAt: new Date() } });
      return { status: 'REJECTED' };
    });
  }

  async joinByCode(userId: string, code: string) {
    const party = await this.prisma.party.findUnique({ where: { code: code.toUpperCase() } });
    if (!party || party.status !== 'ACTIVE') throw new NotFoundException({ code: SocialErrorCodes.PARTY_NOT_FOUND });
    if (!party.allowJoinByCode) throw new NotFoundException({ code: SocialErrorCodes.PARTY_CODE_DISABLED });
    const summary = await this.joinOpenParty(userId, party.id);
    this.emitPartyEvent(summary.partyId, 'PARTY_MEMBER_JOINED', summary, { joinedUserId: userId });
    return summary;
  }

  async leave(userId: string, partyId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      // A leader transfer updates the party FK to another member. Lock every
      // current member in the same global order used by other mutations so a
      // concurrent ready/leave/kick cannot form user-row -> party-row cycles.
      const memberIds = (await tx.partyMember.findMany({
        where: { partyId },
        select: { userId: true },
      })).map((member) => member.userId);
      await this.lockUsers(tx, [...memberIds, userId]);
      await this.lockParty(tx, partyId);
      const member = await tx.partyMember.findUnique({ where: { userId } });
      if (!member || member.partyId !== partyId) return { status: 'LEFT', party: null };
      const party = await tx.party.findUniqueOrThrow({ where: { id: partyId } });
      const remaining = await tx.partyMember.findMany({
        where: { partyId, userId: { not: userId } }, orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
      });
      if (remaining.length === 0) {
        await tx.party.delete({ where: { id: partyId } });
        return { status: 'CLOSED', party: null };
      }
      if (party.leaderUserId === userId) {
        await tx.party.update({ where: { id: partyId }, data: { leaderUserId: remaining[0].userId, version: { increment: 1 } } });
      } else {
        await tx.party.update({ where: { id: partyId }, data: { version: { increment: 1 } } });
      }
      await tx.partyMember.delete({ where: { userId } });
      return { status: 'LEFT', party: await this.getPartyById(tx, partyId, userId) };
    });

    if (result.party) {
      this.emitPartyEvent(partyId, 'PARTY_MEMBER_LEFT', result.party, { leftUserId: userId }, [
        ...result.party.members.map((m) => m.userId),
        userId,
      ]);
    } else {
      if (this.partyRealtime) {
        this.partyRealtime.publishPartyEvent(partyId, 'PARTY_STATE_UPDATED', {
          partyId,
          version: 0,
          roomCode: '',
          leaderId: '',
          desiredGameMode: null,
          capacity: 0,
          allowJoinByCode: false,
          members: [],
          updatedAt: Date.now(),
        }, { closed: true }, [userId]);
      }
    }
    return result;
  }

  async kick(userId: string, partyId: string, targetUserId: string) {
    if (userId === targetUserId) throw new BadRequestException({ code: SocialErrorCodes.INVALID_TARGET });
    const summary = await this.prisma.$transaction(async (tx) => {
      await this.lockUsers(tx, [userId, targetUserId]);
      await this.lockParty(tx, partyId);
      const party = await tx.party.findUnique({ where: { id: partyId } });
      if (!party) throw new NotFoundException({ code: SocialErrorCodes.PARTY_NOT_FOUND });
      if (party.leaderUserId !== userId) throw new ForbiddenException({ code: SocialErrorCodes.NOT_PARTY_LEADER });
      const target = await tx.partyMember.findUnique({ where: { userId: targetUserId } });
      if (target?.partyId === partyId) {
        await tx.partyMember.delete({ where: { userId: targetUserId } });
        await tx.partyInvite.updateMany({ where: { partyId, inviteeId: targetUserId, status: 'PENDING' }, data: { status: 'CANCELLED', respondedAt: new Date() } });
        await tx.party.update({ where: { id: partyId }, data: { version: { increment: 1 } } });
      }
      return this.getPartyById(tx, partyId, userId);
    });

    this.emitPartyEvent(partyId, 'PARTY_MEMBER_KICKED', summary, { kickedUserId: targetUserId }, [
      ...summary.members.map((m) => m.userId),
      targetUserId,
    ]);
    return summary;
  }

  async setReady(userId: string, partyId: string, readyState: 'READY' | 'NOT_READY') {
    const summary = await this.prisma.$transaction(async (tx) => {
      await this.lockUsers(tx, [userId]);
      await this.lockParty(tx, partyId);
      const member = await tx.partyMember.findUnique({ where: { userId } });
      if (!member || member.partyId !== partyId) throw new NotFoundException({ code: SocialErrorCodes.PARTY_NOT_FOUND });
      if (member.readyState !== readyState) {
        await tx.partyMember.update({ where: { userId }, data: { readyState } });
        await tx.party.update({ where: { id: partyId }, data: { version: { increment: 1 } } });
      }
      return this.getPartyById(tx, partyId, userId);
    });

    this.emitPartyEvent(partyId, 'PARTY_READY_CHANGED', summary, { userId, readyState });
    return summary;
  }

  async selectGame(userId: string, partyId: string, desiredGameMode: PartyGameMode) {
    const summary = await this.prisma.$transaction(async (tx) => {
      await this.lockUsers(tx, [userId]);
      await this.lockParty(tx, partyId);
      const party = await tx.party.findUnique({ where: { id: partyId } });
      if (!party) throw new NotFoundException({ code: SocialErrorCodes.PARTY_NOT_FOUND });
      if (party.leaderUserId !== userId) throw new ForbiddenException({ code: SocialErrorCodes.NOT_PARTY_LEADER });
      const count = await tx.partyMember.count({ where: { partyId } });
      if (count > getPartyCapacity(desiredGameMode)) {
        throw new ConflictException({ code: SocialErrorCodes.PARTY_GAME_CAPACITY_EXCEEDED });
      }
      await tx.partyMember.updateMany({ where: { partyId }, data: { readyState: 'NOT_READY' } });
      await tx.party.update({ where: { id: partyId }, data: { desiredGameMode, version: { increment: 1 } } });
      return this.getPartyById(tx, partyId, userId);
    });

    this.emitPartyEvent(partyId, 'PARTY_GAME_CHANGED', summary, { desiredGameMode });
    return summary;
  }

  async setCodeAccess(userId: string, partyId: string, allowJoinByCode: boolean) {
    const summary = await this.prisma.$transaction(async (tx) => {
      await this.lockUsers(tx, [userId]);
      await this.lockParty(tx, partyId);
      const party = await tx.party.findUnique({ where: { id: partyId } });
      if (!party) throw new NotFoundException({ code: SocialErrorCodes.PARTY_NOT_FOUND });
      if (party.leaderUserId !== userId) throw new ForbiddenException({ code: SocialErrorCodes.NOT_PARTY_LEADER });
      await tx.party.update({ where: { id: partyId }, data: { allowJoinByCode, version: { increment: 1 } } });
      return this.getPartyById(tx, partyId, userId);
    });

    this.emitPartyEvent(partyId, 'PARTY_STATE_UPDATED', summary, { allowJoinByCode });
    return summary;
  }

  async separateBlockedUsers(tx: Tx, blockerId: string, blockedId: string) {
    const [blockerMembership, blockedMembership] = await Promise.all([
      tx.partyMember.findUnique({ where: { userId: blockerId } }),
      tx.partyMember.findUnique({ where: { userId: blockedId } }),
    ]);
    if (!blockerMembership || blockerMembership.partyId !== blockedMembership?.partyId) return;
    const partyId = blockerMembership.partyId;
    await this.lockParty(tx, partyId);
    const party = await tx.party.findUniqueOrThrow({ where: { id: partyId } });
    const removeUserId = party.leaderUserId === blockerId ? blockedId : blockerId;
    await tx.partyMember.delete({ where: { userId: removeUserId } });
    await tx.party.update({ where: { id: partyId }, data: { version: { increment: 1 } } });
  }

  private async joinOpenParty(userId: string, partyId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockUsers(tx, [userId]);
      await this.lockParty(tx, partyId);
      const current = await tx.partyMember.findUnique({ where: { userId } });
      if (current?.partyId === partyId) return this.getPartyById(tx, partyId, userId);
      if (current) throw new ConflictException({ code: SocialErrorCodes.ALREADY_IN_PARTY });
      const party = await tx.party.findUnique({ where: { id: partyId } });
      if (!party || !party.allowJoinByCode || party.status !== 'ACTIVE') throw new NotFoundException({ code: SocialErrorCodes.PARTY_CODE_DISABLED });
      await this.assertUsersCanInteract(tx, userId, party.leaderUserId);
      const count = await tx.partyMember.count({ where: { partyId } });
      if (count >= getPartyCapacity(party.desiredGameMode as PartyGameMode | null)) throw new ConflictException({ code: SocialErrorCodes.PARTY_FULL });
      await tx.partyMember.create({ data: { partyId, userId } });
      await tx.party.update({ where: { id: partyId }, data: { version: { increment: 1 } } });
      return this.getPartyById(tx, partyId, userId);
    });
  }

  private async getPartyById(client: Tx | PrismaClient | PrismaService, partyId: string, _viewerId: string): Promise<PartySummaryDto> {
    const party = await client.party.findUnique({
      where: { id: partyId },
      include: { members: { orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }], include: { user: { include: { profile: { include: { selectedCharacter: true } } } } } } },
    });
    if (!party) throw new NotFoundException({ code: SocialErrorCodes.PARTY_NOT_FOUND });
    return {
      partyId: party.id,
      roomCode: party.code,
      leaderId: party.leaderUserId,
      desiredGameMode: party.desiredGameMode as PartyGameMode | null,
      selectedGameSlug: party.desiredGameMode ?? undefined,
      capacity: getPartyCapacity(party.desiredGameMode as PartyGameMode | null),
      allowJoinByCode: party.allowJoinByCode,
      version: party.version,
      members: party.members.map((member: any) => ({
        userId: member.userId,
        username: member.user.profile?.username ?? 'player',
        displayName: member.user.profile?.displayName ?? member.user.profile?.username ?? 'Player',
        characterSlug: member.user.profile?.selectedCharacter?.slug ?? 'unknown',
        isLeader: party.leaderUserId === member.userId,
        isReady: member.readyState === 'READY',
        readyState: member.readyState,
        joinedAt: member.joinedAt.toISOString(),
      })),
    };
  }

  private async serializeInvite(client: Tx | PrismaClient | PrismaService, inviteId: string, _viewerId: string): Promise<PartyInviteDto> {
    const invite = await client.partyInvite.findUnique({
      where: { id: inviteId }, include: { inviter: { include: { profile: { include: { selectedCharacter: true } } } } },
    });
    if (!invite) throw new NotFoundException({ code: SocialErrorCodes.PARTY_INVITE_NOT_FOUND });
    const profile = invite.inviter.profile;
    return {
      id: invite.id,
      partyId: invite.partyId,
      status: invite.status,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
      inviter: {
        userId: invite.inviterId,
        username: profile?.username ?? 'player',
        displayName: profile?.displayName ?? profile?.username ?? 'Player',
        characterSlug: profile?.selectedCharacter?.slug ?? null,
        characterAsset: profile?.selectedCharacter?.placeholderAsset ?? null,
        friendshipState: 'FRIENDS',
        presence: invite.inviter.lastActiveAt > new Date(Date.now() - 15 * 60_000) ? 'ACTIVE_RECENTLY' : 'INACTIVE',
      },
    };
  }

  private async expireInvites(userId: string) {
    await this.prisma.partyInvite.updateMany({
      where: { inviteeId: userId, status: 'PENDING', expiresAt: { lte: new Date() } },
      data: { status: 'EXPIRED', respondedAt: new Date() },
    });
  }

  private async assertUsersCanInteract(tx: Tx, firstId: string, secondId: string) {
    const block = await tx.userBlock.findFirst({
      where: { OR: [{ blockerId: firstId, blockedId: secondId }, { blockerId: secondId, blockedId: firstId }] },
    });
    if (block) throw new NotFoundException({ code: SocialErrorCodes.SOCIAL_ACTION_UNAVAILABLE });
  }

  private async lockUsers(tx: Tx, userIds: string[]) {
    const ids = [...new Set(userIds)].sort();
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
  }

  private async lockParty(tx: Tx, partyId: string) {
    await tx.$queryRaw`SELECT "id" FROM "parties" WHERE "id" = ${partyId} FOR UPDATE`;
  }
}
