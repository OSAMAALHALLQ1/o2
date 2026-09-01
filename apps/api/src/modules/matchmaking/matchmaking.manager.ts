import {
  type MatchAssignmentDto,
  type MatchmakingStatusResponseDto,
  type MatchmakingTicketDto,
  type MatchmakingTicketMemberDto,
  type RoomGameMode,
  MATCHMAKING_CONSTANTS,
  MatchmakingErrorCodes,
} from '@o2/types';
import {
  getMatchmakingCapacity,
  isPartySizeCompatible,
  isValidGameMode,
} from '@o2/game-core';
import type { RoomManager } from '../realtime/rooms/room-manager';
import type { MatchmakingEngineCore } from './matchmaking.engine';
import type { MatchmakingRealtimeNotifier } from './matchmaking-realtime.manager';

export class MatchmakingServiceCore {
  protected readonly prisma: any;
  protected readonly engine: MatchmakingEngineCore;
  protected readonly roomManager?: RoomManager;
  protected readonly notifier?: MatchmakingRealtimeNotifier;

  constructor(
    prisma: any,
    engine: MatchmakingEngineCore,
    roomManager?: RoomManager,
    notifier?: MatchmakingRealtimeNotifier,
  ) {
    this.prisma = prisma;
    this.engine = engine;
    this.roomManager = roomManager;
    this.notifier = notifier;
  }

  async joinQueue(
    userId: string,
    gameMode: RoomGameMode,
  ): Promise<MatchmakingTicketDto> {
    if (!isValidGameMode(gameMode)) {
      const err: any = new Error(`نمط اللعبة غير صالح: ${gameMode}`);
      err.response = { code: MatchmakingErrorCodes.INVALID_GAME_MODE };
      err.status = 400;
      throw err;
    }

    // 1. Verify user moderation status
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user || user.moderationStatus !== 'ACTIVE') {
      const err: any = new Error('الحساب مقيد أو غير مسموح له بالمطابقة');
      err.response = { code: MatchmakingErrorCodes.ACCOUNT_RESTRICTED };
      err.status = 403;
      throw err;
    }

    // 2. Verify user is not already in an active room
    if (this.roomManager?.getUserRoom(userId)) {
      const err: any = new Error('أنت موجود بالفعل داخل غرفة نشطة');
      err.response = { code: MatchmakingErrorCodes.ALREADY_IN_ROOM };
      err.status = 409;
      throw err;
    }

    // Execute check and ticket creation inside transaction to guarantee concurrency safety
    const createdTicket = await this.prisma.$transaction(async (tx: any) => {
      // 3. Check if user already has an active ticket
      const existingMembership = await tx.matchmakingTicketMember.findFirst({
        where: {
          userId,
          ticket: {
            status: { in: ['QUEUED', 'MATCHING'] },
            expiresAt: { gt: new Date() },
          },
        },
      });

      if (existingMembership) {
        const err: any = new Error('أنت منضم بالفعل إلى قائمة الانتظار');
        err.response = { code: MatchmakingErrorCodes.ALREADY_QUEUED };
        err.status = 409;
        throw err;
      }

      // 4. Check if user is in a party
      const partyMembership = await tx.partyMember.findUnique({
        where: { userId },
        include: {
          party: {
            include: {
              members: {
                include: {
                  user: { include: { profile: true } },
                },
              },
            },
          },
        },
      });

      const expiresAt = new Date(
        Date.now() + MATCHMAKING_CONSTANTS.TICKET_TIMEOUT_MS,
      );

      if (partyMembership) {
        const party = partyMembership.party;

        if (party.status !== 'ACTIVE') {
          const err: any = new Error('المجموعة غير نشطة');
          err.response = { code: MatchmakingErrorCodes.PARTY_NOT_FOUND };
          err.status = 400;
          throw err;
        }

        // Only party leader may queue the party
        if (party.leaderUserId !== userId) {
          const err: any = new Error('قائد المجموعة فقط هو المخول ببدء المطابقة');
          err.response = { code: MatchmakingErrorCodes.NOT_PARTY_LEADER };
          err.status = 403;
          throw err;
        }

        // Party size compatibility check
        if (!isPartySizeCompatible(gameMode, party.members.length)) {
          const err: any = new Error(
            `حجم المجموعة (${party.members.length}) يتجاوز سعة اللعبة (${getMatchmakingCapacity(gameMode)})`,
          );
          err.response = {
            code: MatchmakingErrorCodes.PARTY_GAME_CAPACITY_EXCEEDED,
          };
          err.status = 409;
          throw err;
        }

        // All party members must be READY
        const unreadyMember = party.members.find(
          (m: any) => m.readyState !== 'READY',
        );
        if (unreadyMember) {
          const err: any = new Error(
            'يجب أن يكون جميع أعضاء المجموعة في حالة جاهزية (READY) لبدء البحث',
          );
          err.response = { code: MatchmakingErrorCodes.PARTY_NOT_READY };
          err.status = 400;
          throw err;
        }

        // Verify no member is already queued or in a room
        const memberIds = party.members.map((m: any) => m.userId);
        for (const mId of memberIds) {
          if (this.roomManager?.getUserRoom(mId)) {
            const err: any = new Error(
              'أحد أعضاء المجموعة متواجد حالياً داخل غرفة أخرى',
            );
            err.response = { code: MatchmakingErrorCodes.ALREADY_IN_ROOM };
            err.status = 409;
            throw err;
          }
        }

        const activeMemberTicket = await tx.matchmakingTicketMember.findFirst({
          where: {
            userId: { in: memberIds },
            ticket: {
              status: { in: ['QUEUED', 'MATCHING'] },
              expiresAt: { gt: new Date() },
            },
          },
        });

        if (activeMemberTicket) {
          const err: any = new Error(
            'أحد أعضاء المجموعة منضم بالفعل في قائمة انتظار أخرى',
          );
          err.response = { code: MatchmakingErrorCodes.ALREADY_QUEUED };
          err.status = 409;
          throw err;
        }

        // Atomic ticket creation for party
        const ticket = await tx.matchmakingTicket.create({
          data: {
            gameMode: gameMode as any,
            status: 'QUEUED',
            partyId: party.id,
            partyVersion: party.version,
            leaderUserId: userId,
            memberCount: party.members.length,
            expiresAt,
          },
        });

        await tx.matchmakingTicketMember.createMany({
          data: memberIds.map((mId: string) => ({
            ticketId: ticket.id,
            userId: mId,
          })),
        });

        return tx.matchmakingTicket.findUniqueOrThrow({
          where: { id: ticket.id },
          include: {
            members: {
              include: {
                user: { include: { profile: true } },
              },
            },
          },
        });
      } else {
        // Solo queue ticket
        const ticket = await tx.matchmakingTicket.create({
          data: {
            gameMode: gameMode as any,
            status: 'QUEUED',
            partyId: null,
            partyVersion: null,
            leaderUserId: userId,
            memberCount: 1,
            expiresAt,
          },
        });

        await tx.matchmakingTicketMember.create({
          data: {
            ticketId: ticket.id,
            userId,
          },
        });

        return tx.matchmakingTicket.findUniqueOrThrow({
          where: { id: ticket.id },
          include: {
            members: {
              include: {
                user: { include: { profile: true } },
              },
            },
          },
        });
      }
    });

    const dto = this.serializeTicket(createdTicket);

    // Notify ticket creation via realtime
    if (this.notifier) {
      const memberIds = createdTicket.members.map((m: any) => m.userId);
      this.notifier.notifyTicketStatus(memberIds, dto);
    }

    // Trigger async match scan (non-blocking)
    void this.engine.tryMatchQueue(gameMode);

    return dto;
  }

  async cancelQueue(
    userId: string,
    ticketId?: string,
  ): Promise<{ cancelled: boolean; ticketId: string }> {
    // 1. Find active ticket
    const memberRecord = await this.prisma.matchmakingTicketMember.findFirst({
      where: {
        userId,
        ticket: ticketId
          ? { id: ticketId, status: 'QUEUED' }
          : { status: 'QUEUED' },
      },
      include: {
        ticket: {
          include: {
            members: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!memberRecord || !memberRecord.ticket) {
      const err: any = new Error('لا توجد تذكرة بحث نشطة للإلغاء');
      err.response = { code: MatchmakingErrorCodes.TICKET_NOT_FOUND };
      err.status = 404;
      throw err;
    }

    const ticket = memberRecord.ticket;

    // Caller must be authorized: solo user or party leader
    if (ticket.leaderUserId !== userId) {
      const err: any = new Error('قائد المجموعة فقط هو المخول بإلغاء البحث');
      err.response = { code: MatchmakingErrorCodes.UNAUTHORIZED_CANCELLATION };
      err.status = 403;
      throw err;
    }

    // Atomic cancel update
    const updateResult = await this.prisma.matchmakingTicket.updateMany({
      where: {
        id: ticket.id,
        status: 'QUEUED',
      },
      data: { status: 'CANCELLED' },
    });

    if (updateResult.count === 0) {
      const err: any = new Error('تعذر الإلغاء، تم العثور على مباراة بالفعل أو تم إلغاؤها مسبقاً');
      err.response = { code: MatchmakingErrorCodes.CANNOT_CANCEL_MATCHED };
      err.status = 409;
      throw err;
    }

    const memberIds = ticket.members.map((m: any) => m.userId);

    if (this.notifier) {
      this.notifier.notifyTicketCancelled(memberIds, ticket.id);
    }

    return { cancelled: true, ticketId: ticket.id };
  }

  async getQueueStatus(userId: string): Promise<MatchmakingStatusResponseDto> {
    const now = new Date();

    const memberRecord = await this.prisma.matchmakingTicketMember.findFirst({
      where: { userId },
      include: {
        ticket: {
          include: {
            members: {
              include: {
                user: { include: { profile: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!memberRecord || !memberRecord.ticket) {
      return { ticket: null, match: null };
    }

    const ticket = memberRecord.ticket;

    // Check expiry
    if (ticket.status === 'QUEUED' && ticket.expiresAt <= now) {
      ticket.status = 'EXPIRED';
      await this.prisma.matchmakingTicket.updateMany({
        where: { id: ticket.id, status: 'QUEUED' },
        data: { status: 'EXPIRED' },
      });
    }

    const ticketDto = this.serializeTicket(ticket);

    let matchDto: MatchAssignmentDto | null = null;
    if (ticket.status === 'MATCHED' && ticket.matchId && ticket.roomId) {
      // Find all tickets belonging to this match
      const matchedTickets = await this.prisma.matchmakingTicket.findMany({
        where: { matchId: ticket.matchId },
        include: {
          members: {
            include: {
              user: { include: { profile: true } },
            },
          },
        },
      });

      const participants: any[] = [];
      const partyGrouping: Record<string, string[]> = {};

      for (const t of matchedTickets) {
        const pKey = t.partyId ?? 'solo';
        if (!partyGrouping[pKey]) partyGrouping[pKey] = [];

        for (const m of t.members) {
          partyGrouping[pKey].push(m.userId);
          participants.push({
            userId: m.userId,
            username: m.user.profile?.username ?? m.user.id.slice(0, 8),
            displayName: m.user.profile?.displayName ?? undefined,
            partyId: t.partyId ?? undefined,
            isLeader: m.userId === t.leaderUserId,
          });
        }
      }

      matchDto = {
        matchId: ticket.matchId,
        gameMode: ticket.gameMode as RoomGameMode,
        roomId: ticket.roomId,
        participants,
        partyGrouping,
        assignmentVersion: 1,
        createdAt: ticket.updatedAt.getTime(),
      };
    }

    return {
      ticket: ticketDto,
      match: matchDto,
    };
  }

  private serializeTicket(ticket: any): MatchmakingTicketDto {
    const members: MatchmakingTicketMemberDto[] = ticket.members.map((m: any) => ({
      userId: m.userId,
      username: m.user.profile?.username ?? m.user.id.slice(0, 8),
      displayName: m.user.profile?.displayName ?? undefined,
    }));

    return {
      ticketId: ticket.id,
      gameMode: ticket.gameMode as RoomGameMode,
      status: ticket.status,
      partyId: ticket.partyId,
      partyVersion: ticket.partyVersion,
      leaderUserId: ticket.leaderUserId,
      memberCount: ticket.memberCount,
      members,
      createdAt: ticket.createdAt.getTime(),
      expiresAt: ticket.expiresAt.getTime(),
      matchId: ticket.matchId,
      roomId: ticket.roomId,
    };
  }
}
