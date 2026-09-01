import { randomUUID } from 'node:crypto';
import {
  type MatchAssignmentDto,
  type MatchmakingParticipantSnapshot,
  type RoomGameMode,
  ROOM_CAPACITIES,
  MATCHMAKING_CONSTANTS,
} from '@o2/types';
import { findExactCapacityGroup } from '@o2/game-core';
import type { RoomManager } from '../realtime/rooms/room-manager';
import type { MatchmakingRealtimeNotifier } from './matchmaking-realtime.manager';

export class MatchmakingSequentialExecutor {
  private queue: Promise<void> = Promise.resolve();

  execute<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue = this.queue
        .then(async () => {
          try {
            const res = await task();
            resolve(res);
          } catch (err) {
            reject(err);
          }
        })
        .catch(() => {
          // Keep queue alive on unexpected errors
        });
    });
  }
}

export class MatchmakingEngineCore {
  protected readonly prisma: any;
  protected readonly roomManager?: RoomManager;
  protected readonly notifier?: MatchmakingRealtimeNotifier;
  private readonly executors = new Map<string, MatchmakingSequentialExecutor>();

  constructor(
    prisma: any,
    roomManager?: RoomManager,
    notifier?: MatchmakingRealtimeNotifier,
  ) {
    this.prisma = prisma;
    this.roomManager = roomManager;
    this.notifier = notifier;
  }

  private getExecutor(gameMode: string): MatchmakingSequentialExecutor {
    let executor = this.executors.get(gameMode);
    if (!executor) {
      executor = new MatchmakingSequentialExecutor();
      this.executors.set(gameMode, executor);
    }
    return executor;
  }

  async tryMatchQueue(gameMode: RoomGameMode): Promise<MatchAssignmentDto | null> {
    const executor = this.getExecutor(gameMode);
    return executor.execute(() => this.processQueueInternal(gameMode));
  }

  private async processQueueInternal(
    gameMode: RoomGameMode,
  ): Promise<MatchAssignmentDto | null> {
    const capacity = ROOM_CAPACITIES[gameMode];
    if (!capacity) return null;

    const now = new Date();

    // 1. Fetch active queued tickets ordered by FIFO (createdAt ASC)
    const tickets = await this.prisma.matchmakingTicket.findMany({
      where: {
        gameMode: gameMode as any,
        status: 'QUEUED',
        expiresAt: { gt: now },
      },
      include: {
        members: {
          include: {
            user: {
              include: { profile: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: MATCHMAKING_CONSTANTS.MAX_TICKETS_PER_SCAN,
    });

    if (!tickets.length) return null;

    const totalQueuedPlayers = tickets.reduce((acc: number, t: any) => acc + t.memberCount, 0);
    if (totalQueuedPlayers < capacity) return null;

    // 2. Deterministic exact-capacity group selection (parties never split)
    const candidates = findExactCapacityGroup(tickets, capacity) as
      | (typeof tickets)
      | null;
    if (!candidates || candidates.length === 0) return null;

    const candidateIds = candidates.map((c: any) => c.id);

    // 3. Atomically transition candidate tickets from QUEUED -> MATCHING
    const transitionResult = await this.prisma.$transaction(async (tx: any) => {
      const updateCount = await tx.matchmakingTicket.updateMany({
        where: {
          id: { in: candidateIds },
          status: 'QUEUED',
        },
        data: { status: 'MATCHING' },
      });

      // If another worker or cancellation modified any ticket in the group, abort
      if (updateCount.count !== candidateIds.length) {
        // Roll back any tickets that were transitioned to MATCHING back to QUEUED
        await tx.matchmakingTicket.updateMany({
          where: {
            id: { in: candidateIds },
            status: 'MATCHING',
          },
          data: { status: 'QUEUED' },
        });
        return { success: false, reason: 'CONCURRENT_MUTATION' as const };
      }

      return { success: true };
    });

    if (!transitionResult.success) {
      return null;
    }

    // 4. Revalidate eligibility for all participants in candidates
    const invalidTicketIds = new Set<string>();

    for (const ticket of candidates) {
      // Check moderation status of all members
      for (const m of ticket.members) {
        if (m.user.moderationStatus !== 'ACTIVE') {
          invalidTicketIds.add(ticket.id);
          break;
        }
        // Check if player is already inside an active room
        if (this.roomManager?.getUserRoom(m.userId)) {
          invalidTicketIds.add(ticket.id);
          break;
        }
      }

      // If party ticket, revalidate party version and membership snapshot
      if (ticket.partyId) {
        const currentParty = await this.prisma.party.findUnique({
          where: { id: ticket.partyId },
          include: { members: true },
        });

        if (
          !currentParty ||
          currentParty.status !== 'ACTIVE' ||
          currentParty.version !== ticket.partyVersion ||
          currentParty.members.length !== ticket.memberCount
        ) {
          invalidTicketIds.add(ticket.id);
          continue;
        }

        // Verify every member from snapshot is still in the party
        const currentMemberIds = new Set(currentParty.members.map((pm: any) => pm.userId));
        for (const m of ticket.members) {
          if (!currentMemberIds.has(m.userId)) {
            invalidTicketIds.add(ticket.id);
            break;
          }
        }
      }
    }

    // 5. Handle revalidation failure
    if (invalidTicketIds.size > 0) {
      await this.prisma.$transaction(async (tx: any) => {
        // Failing tickets transition to FAILED
        await tx.matchmakingTicket.updateMany({
          where: { id: { in: Array.from(invalidTicketIds) } },
          data: { status: 'FAILED' },
        });

        // Valid tickets return to QUEUED (preserving original FIFO createdAt)
        const validIds = candidateIds.filter((id: string) => !invalidTicketIds.has(id));
        if (validIds.length > 0) {
          await tx.matchmakingTicket.updateMany({
            where: { id: { in: validIds } },
            data: { status: 'QUEUED' },
          });
        }
      });

      // Try matching remaining queue
      return this.processQueueInternal(gameMode);
    }

    // 6. All revalidations passed! Final match creation
    const matchId = `match_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

    // Prepare participants list
    const participantList: MatchmakingParticipantSnapshot[] = [];
    const partyGrouping: Record<string, string[]> = {};

    for (const ticket of candidates) {
      const pKey = ticket.partyId ?? 'solo';
      if (!partyGrouping[pKey]) partyGrouping[pKey] = [];

      for (const m of ticket.members) {
        partyGrouping[pKey].push(m.userId);
        participantList.push({
          userId: m.userId,
          username: m.user.profile?.username ?? m.user.id.slice(0, 8),
          displayName: m.user.profile?.displayName ?? undefined,
          partyId: ticket.partyId ?? undefined,
          isLeader: m.userId === ticket.leaderUserId,
        });
      }
    }

    // 7. Create ephemeral Room in Phase 6B RoomManager
    let roomId = `room_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    if (this.roomManager) {
      const { room } = await this.roomManager.createMatchRoom(
        gameMode,
        participantList.map((p) => ({
          userId: p.userId,
          username: p.username,
          displayName: p.displayName,
        })),
      );
      roomId = room.roomId;
    }

    // 8. Commit MATCHED state to database
    await this.prisma.$transaction(async (tx: any) => {
      await tx.matchmakingTicket.updateMany({
        where: { id: { in: candidateIds } },
        data: {
          status: 'MATCHED',
          matchId,
          roomId,
        },
      });
    });

    const assignment: MatchAssignmentDto = {
      matchId,
      gameMode,
      roomId,
      participants: participantList,
      partyGrouping,
      assignmentVersion: 1,
      createdAt: Date.now(),
    };

    // 9. Commit-Then-Publish: Notify participants over realtime
    if (this.notifier) {
      this.notifier.notifyMatchFound(assignment);
    }

    // Check if another match can be formed with remaining queue
    void this.tryMatchQueue(gameMode);

    return assignment;
  }

  async sweepExpiredTickets(): Promise<number> {
    const now = new Date();
    const result = await this.prisma.matchmakingTicket.updateMany({
      where: {
        status: 'QUEUED',
        expiresAt: { lte: now },
      },
      data: { status: 'EXPIRED' },
    });
    return result.count;
  }
}
