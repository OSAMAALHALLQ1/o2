import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FriendRequestPolicy, PublicPlayerSummaryDto } from '@o2/types';
import { canonicalUserPair } from '@o2/game-core';
import { PrismaService } from '../../prisma/prisma.service';
import { PartyService } from './party.service';
import { SOCIAL_LIMITS, SocialErrorCodes } from './social.constants';

type Tx = Prisma.TransactionClient;

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parties: PartyService,
  ) {}

  async searchPlayers(userId: string, query: string): Promise<PublicPlayerSummaryDto[]> {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < SOCIAL_LIMITS.SEARCH_MIN_LENGTH) return [];
    const blockedRows = await this.prisma.userBlock.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    const excluded = new Set<string>([userId]);
    for (const row of blockedRows) excluded.add(row.blockerId === userId ? row.blockedId : row.blockerId);
    const profiles = await this.prisma.playerProfile.findMany({
      where: {
        normalizedUsername: { startsWith: normalized },
        userId: { notIn: [...excluded] },
        user: { moderationStatus: { in: ['ACTIVE', 'MUTED'] } },
      },
      include: { user: { include: { partyMembership: true } }, selectedCharacter: true },
      orderBy: [{ normalizedUsername: 'asc' }, { userId: 'asc' }],
      take: SOCIAL_LIMITS.SEARCH_RESULTS_MAX,
    });
    const ids = profiles.map((profile) => profile.userId);
    const [friendships, requests] = await Promise.all([
      this.prisma.friendship.findMany({
        where: { OR: [{ userLowId: userId, userHighId: { in: ids } }, { userHighId: userId, userLowId: { in: ids } }] },
      }),
      this.prisma.friendRequest.findMany({
        where: { status: 'PENDING', OR: [{ senderId: userId, receiverId: { in: ids } }, { receiverId: userId, senderId: { in: ids } }] },
      }),
    ]);
    return profiles.map((profile) => {
      const friendship = friendships.find((row) => row.userLowId === profile.userId || row.userHighId === profile.userId);
      const request = requests.find((row) => row.senderId === profile.userId || row.receiverId === profile.userId);
      return this.publicSummary(profile.user, profile, friendship ? 'FRIENDS' : request?.senderId === userId ? 'PENDING_OUTGOING' : request ? 'PENDING_INCOMING' : 'NONE');
    });
  }

  async sendFriendRequest(userId: string, receiverId: string) {
    if (userId === receiverId) throw new BadRequestException({ code: SocialErrorCodes.INVALID_TARGET });
    const pair = canonicalUserPair(userId, receiverId);
    return this.prisma.$transaction(async (tx) => {
      await this.lockUsers(tx, [userId, receiverId]);
      const receiver = await tx.user.findUnique({ where: { id: receiverId }, include: { socialPrivacy: true } });
      if (!receiver || !['ACTIVE', 'MUTED'].includes(receiver.moderationStatus)) {
        throw new NotFoundException({ code: SocialErrorCodes.PLAYER_NOT_FOUND });
      }
      await this.assertUsersCanInteract(tx, userId, receiverId);
      if (receiver.socialPrivacy?.friendRequestPolicy === 'NOBODY') {
        throw new NotFoundException({ code: SocialErrorCodes.SOCIAL_ACTION_UNAVAILABLE });
      }
      if (await tx.friendship.findUnique({ where: { userLowId_userHighId: pair } })) {
        throw new ConflictException({ code: SocialErrorCodes.ALREADY_FRIENDS });
      }
      const existing = await tx.friendRequest.findFirst({ where: { ...pair, status: 'PENDING' } });
      if (existing?.senderId === userId) return { status: 'PENDING', requestId: existing.id };
      if (existing) {
        const friendship = await tx.friendship.create({ data: pair });
        await tx.friendRequest.updateMany({ where: { ...pair, status: 'PENDING' }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
        return { status: 'FRIENDS', friendshipId: friendship.id };
      }
      const request = await tx.friendRequest.create({ data: { ...pair, senderId: userId, receiverId } });
      return { status: 'PENDING', requestId: request.id };
    });
  }

  async acceptFriendRequest(userId: string, requestId: string) {
    const initial = await this.prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!initial || initial.receiverId !== userId) throw new NotFoundException({ code: SocialErrorCodes.FRIEND_REQUEST_NOT_FOUND });
    return this.prisma.$transaction(async (tx) => {
      await this.lockUsers(tx, [initial.senderId, initial.receiverId]);
      const request = await tx.friendRequest.findUnique({ where: { id: requestId } });
      if (!request || request.receiverId !== userId) throw new NotFoundException({ code: SocialErrorCodes.FRIEND_REQUEST_NOT_FOUND });
      const pair = { userLowId: request.userLowId, userHighId: request.userHighId };
      const friendship = await tx.friendship.findUnique({ where: { userLowId_userHighId: pair } });
      if (friendship) return { status: 'FRIENDS', friendshipId: friendship.id };
      if (request.status !== 'PENDING') throw new ConflictException({ code: SocialErrorCodes.FRIEND_REQUEST_NOT_FOUND });
      await this.assertUsersCanInteract(tx, request.senderId, request.receiverId);
      const created = await tx.friendship.create({ data: pair });
      await tx.friendRequest.updateMany({ where: { ...pair, status: 'PENDING' }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
      return { status: 'FRIENDS', friendshipId: created.id };
    });
  }

  async rejectFriendRequest(userId: string, requestId: string) {
    const initial = await this.prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!initial || initial.receiverId !== userId) throw new NotFoundException({ code: SocialErrorCodes.FRIEND_REQUEST_NOT_FOUND });
    return this.prisma.$transaction(async (tx) => {
      await this.lockUsers(tx, [initial.senderId, initial.receiverId]);
      const request = await tx.friendRequest.findUnique({ where: { id: requestId } });
      if (!request || request.receiverId !== userId) throw new NotFoundException({ code: SocialErrorCodes.FRIEND_REQUEST_NOT_FOUND });
      if (request.status === 'REJECTED') return { status: 'REJECTED' };
      if (request.status !== 'PENDING') throw new ConflictException({ code: SocialErrorCodes.FRIEND_REQUEST_NOT_FOUND });
      await tx.friendRequest.update({ where: { id: requestId }, data: { status: 'REJECTED', respondedAt: new Date() } });
      return { status: 'REJECTED' };
    });
  }

  async cancelFriendRequest(userId: string, requestId: string) {
    const initial = await this.prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!initial || initial.senderId !== userId) throw new NotFoundException({ code: SocialErrorCodes.FRIEND_REQUEST_NOT_FOUND });
    return this.prisma.$transaction(async (tx) => {
      await this.lockUsers(tx, [initial.senderId, initial.receiverId]);
      const request = await tx.friendRequest.findUnique({ where: { id: requestId } });
      if (!request || request.senderId !== userId) throw new NotFoundException({ code: SocialErrorCodes.FRIEND_REQUEST_NOT_FOUND });
      if (request.status === 'CANCELLED') return { status: 'CANCELLED' };
      if (request.status !== 'PENDING') throw new ConflictException({ code: SocialErrorCodes.FRIEND_REQUEST_NOT_FOUND });
      await tx.friendRequest.update({ where: { id: requestId }, data: { status: 'CANCELLED', respondedAt: new Date() } });
      return { status: 'CANCELLED' };
    });
  }

  async removeFriend(userId: string, friendUserId: string) {
    if (userId === friendUserId) throw new BadRequestException({ code: SocialErrorCodes.INVALID_TARGET });
    const pair = canonicalUserPair(userId, friendUserId);
    return this.prisma.$transaction(async (tx) => {
      await this.lockUsers(tx, [userId, friendUserId]);
      await tx.friendship.deleteMany({ where: pair });
      return { status: 'REMOVED' };
    });
  }

  async listFriends(userId: string, page: number, limit: number) {
    const where = { OR: [{ userLowId: userId }, { userHighId: userId }] };
    const [rows, total] = await Promise.all([
      this.prisma.friendship.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.friendship.count({ where }),
    ]);
    const ids = rows.map((row) => row.userLowId === userId ? row.userHighId : row.userLowId);
    const profiles = await this.prisma.playerProfile.findMany({
      where: { userId: { in: ids } }, include: { user: { include: { partyMembership: true } }, selectedCharacter: true },
    });
    const byId = new Map(profiles.map((profile) => [profile.userId, profile]));
    return { data: ids.flatMap((id) => { const profile = byId.get(id); return profile ? [this.publicSummary(profile.user, profile, 'FRIENDS')] : []; }), total, page, limit };
  }

  async listRequests(userId: string, direction: 'incoming' | 'outgoing', page: number, limit: number) {
    const where = direction === 'incoming' ? { receiverId: userId, status: 'PENDING' as const } : { senderId: userId, status: 'PENDING' as const };
    const [rows, total] = await Promise.all([
      this.prisma.friendRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.friendRequest.count({ where }),
    ]);
    const otherIds = rows.map((row) => direction === 'incoming' ? row.senderId : row.receiverId);
    const profiles = await this.prisma.playerProfile.findMany({ where: { userId: { in: otherIds } }, include: { user: { include: { partyMembership: true } }, selectedCharacter: true } });
    const byId = new Map(profiles.map((profile) => [profile.userId, profile]));
    return {
      data: rows.flatMap((row) => {
        const otherId = direction === 'incoming' ? row.senderId : row.receiverId;
        const profile = byId.get(otherId);
        if (!profile) return [];
        return [{
          id: row.id,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
          player: this.publicSummary(profile.user, profile, direction === 'incoming' ? 'PENDING_INCOMING' : 'PENDING_OUTGOING'),
        }];
      }), total, page, limit,
    };
  }

  async blockUser(userId: string, blockedId: string) {
    if (userId === blockedId) throw new BadRequestException({ code: SocialErrorCodes.INVALID_TARGET });
    const pair = canonicalUserPair(userId, blockedId);
    return this.prisma.$transaction(async (tx) => {
      await this.lockUsers(tx, [userId, blockedId]);
      if (!await tx.user.findUnique({ where: { id: blockedId } })) throw new NotFoundException({ code: SocialErrorCodes.PLAYER_NOT_FOUND });
      await tx.userBlock.upsert({ where: { blockerId_blockedId: { blockerId: userId, blockedId } }, update: {}, create: { blockerId: userId, blockedId } });
      await tx.friendship.deleteMany({ where: pair });
      await tx.friendRequest.updateMany({ where: { ...pair, status: 'PENDING' }, data: { status: 'CANCELLED', respondedAt: new Date() } });
      await tx.partyInvite.updateMany({
        where: { status: 'PENDING', OR: [{ inviterId: userId, inviteeId: blockedId }, { inviterId: blockedId, inviteeId: userId }] },
        data: { status: 'CANCELLED', respondedAt: new Date() },
      });
      await this.parties.separateBlockedUsers(tx, userId, blockedId);
      return { status: 'BLOCKED' };
    });
  }

  async unblockUser(userId: string, blockedId: string) {
    await this.prisma.userBlock.deleteMany({ where: { blockerId: userId, blockedId } });
    return { status: 'UNBLOCKED' };
  }

  async listBlocks(userId: string) {
    const blocks = await this.prisma.userBlock.findMany({ where: { blockerId: userId }, orderBy: { createdAt: 'desc' }, take: 50 });
    const profiles = await this.prisma.playerProfile.findMany({ where: { userId: { in: blocks.map((row) => row.blockedId) } }, include: { user: { include: { partyMembership: true } }, selectedCharacter: true } });
    return profiles.map((profile) => this.publicSummary(profile.user, profile, 'NONE'));
  }

  async getPrivacy(userId: string) {
    return this.prisma.socialPrivacy.upsert({ where: { userId }, update: {}, create: { userId } });
  }

  async updatePrivacy(userId: string, friendRequestPolicy?: FriendRequestPolicy, allowPartyInvites?: boolean) {
    return this.prisma.socialPrivacy.upsert({
      where: { userId },
      update: { ...(friendRequestPolicy ? { friendRequestPolicy } : {}), ...(allowPartyInvites === undefined ? {} : { allowPartyInvites }) },
      create: { userId, friendRequestPolicy: friendRequestPolicy ?? 'EVERYONE', allowPartyInvites: allowPartyInvites ?? true },
    });
  }

  private publicSummary(user: any, profile: any, friendshipState: PublicPlayerSummaryDto['friendshipState']): PublicPlayerSummaryDto {
    return {
      userId: user.id,
      username: profile.username ?? 'player',
      displayName: profile.displayName ?? profile.username ?? 'Player',
      characterSlug: profile.selectedCharacter?.slug ?? null,
      characterAsset: profile.selectedCharacter?.placeholderAsset ?? null,
      friendshipState,
      presence: user.partyMembership ? 'IN_PARTY' : user.lastActiveAt > new Date(Date.now() - 15 * 60_000) ? 'ACTIVE_RECENTLY' : 'INACTIVE',
    };
  }

  private async assertUsersCanInteract(tx: Tx, firstId: string, secondId: string) {
    const block = await tx.userBlock.findFirst({ where: { OR: [{ blockerId: firstId, blockedId: secondId }, { blockerId: secondId, blockedId: firstId }] } });
    if (block) throw new NotFoundException({ code: SocialErrorCodes.SOCIAL_ACTION_UNAVAILABLE });
  }

  private async lockUsers(tx: Tx, userIds: string[]) {
    const ids = [...new Set(userIds)].sort();
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
  }
}
