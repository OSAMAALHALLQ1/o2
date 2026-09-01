import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  type MatchAssignmentDto,
  type RoomGameMode,
  MatchmakingErrorCodes,
  MatchmakingSystemEvents,
  ROOM_CAPACITIES,
} from '@o2/types';
import { RoomManager } from '../src/modules/realtime/rooms/room-manager.ts';
import { MatchmakingRealtimeNotifier } from '../src/modules/matchmaking/matchmaking-realtime.manager.ts';
import { MatchmakingEngineCore } from '../src/modules/matchmaking/matchmaking.engine.ts';
import { MatchmakingServiceCore } from '../src/modules/matchmaking/matchmaking.manager.ts';

// ============================================================================
// IN-MEMORY PRISMA MOCK WITH ATOMIC ROW-LEVEL CONSTRAINTS
// ============================================================================

interface MockUser {
  id: string;
  moderationStatus: 'ACTIVE' | 'MUTED' | 'SUSPENDED' | 'BANNED';
  profile?: { username: string; displayName?: string };
}

interface MockPartyMember {
  id: string;
  partyId: string;
  userId: string;
  readyState: 'READY' | 'NOT_READY';
}

interface MockParty {
  id: string;
  leaderUserId: string;
  status: 'ACTIVE' | 'CLOSED';
  version: number;
  members: MockPartyMember[];
}

interface MockTicket {
  id: string;
  gameMode: string;
  status: 'QUEUED' | 'MATCHING' | 'MATCHED' | 'CANCELLED' | 'EXPIRED' | 'FAILED';
  partyId: string | null;
  partyVersion: number | null;
  leaderUserId: string;
  memberCount: number;
  matchId: string | null;
  roomId: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  members: Array<{ id: string; ticketId: string; userId: string }>;
}

class MockPrismaService {
  users = new Map<string, MockUser>();
  parties = new Map<string, MockParty>();
  partyMembers = new Map<string, MockPartyMember>(); // userId -> member
  tickets = new Map<string, MockTicket>();

  private transactionLock: Promise<void> = Promise.resolve();

  async $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    // Acquire sequential lock to simulate database transactional isolation
    let release: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prev = this.transactionLock;
    this.transactionLock = lock;
    await prev;

    try {
      return await fn(this);
    } finally {
      release!();
    }
  }

  user = {
    findUnique: async ({ where }: any) => {
      const u = this.users.get(where.id);
      return u ? { ...u } : null;
    },
  };

  party = {
    findUnique: async ({ where }: any) => {
      const p = this.parties.get(where.id);
      if (!p) return null;
      return {
        ...p,
        members: Array.from(this.partyMembers.values()).filter(
          (pm) => pm.partyId === p.id,
        ),
      };
    },
  };

  partyMember = {
    findUnique: async ({ where }: any) => {
      const pm = this.partyMembers.get(where.userId);
      if (!pm) return null;
      const party = this.parties.get(pm.partyId);
      return {
        ...pm,
        party: party
          ? {
              ...party,
              members: Array.from(this.partyMembers.values())
                .filter((m) => m.partyId === party.id)
                .map((m) => ({
                  ...m,
                  user: this.users.get(m.userId),
                })),
            }
          : null,
      };
    },
  };

  matchmakingTicket = {
    create: async ({ data }: any) => {
      const id = randomUUID();
      const ticket: MockTicket = {
        id,
        gameMode: data.gameMode,
        status: data.status ?? 'QUEUED',
        partyId: data.partyId ?? null,
        partyVersion: data.partyVersion ?? null,
        leaderUserId: data.leaderUserId,
        memberCount: data.memberCount ?? 1,
        matchId: data.matchId ?? null,
        roomId: data.roomId ?? null,
        expiresAt: data.expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
        members: [],
      };
      this.tickets.set(id, ticket);
      return ticket;
    },

    findUniqueOrThrow: async ({ where }: any) => {
      const t = this.tickets.get(where.id);
      if (!t) throw new Error('Ticket not found');
      return this.enrichTicket(t);
    },

    findMany: async ({ where, orderBy, take }: any) => {
      let list = Array.from(this.tickets.values());
      if (where) {
        if (where.gameMode) {
          list = list.filter((t) => t.gameMode === where.gameMode);
        }
        if (where.status) {
          list = list.filter((t) => t.status === where.status);
        }
        if (where.matchId) {
          list = list.filter((t) => t.matchId === where.matchId);
        }
        if (where.expiresAt?.gt) {
          list = list.filter((t) => t.expiresAt > where.expiresAt.gt);
        }
        if (where.expiresAt?.lte) {
          list = list.filter((t) => t.expiresAt <= where.expiresAt.lte);
        }
      }
      if (orderBy?.createdAt === 'asc') {
        list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      }
      if (take) {
        list = list.slice(0, take);
      }
      return list.map((t) => this.enrichTicket(t));
    },

    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const t of this.tickets.values()) {
        let match = true;
        if (where.id) {
          if (where.id.in && !where.id.in.includes(t.id)) match = false;
          else if (typeof where.id === 'string' && t.id !== where.id) match = false;
        }
        if (where.status && t.status !== where.status) match = false;
        if (where.expiresAt?.lte && t.expiresAt > where.expiresAt.lte) match = false;

        if (match) {
          if (data.status) t.status = data.status;
          if (data.matchId) t.matchId = data.matchId;
          if (data.roomId) t.roomId = data.roomId;
          t.updatedAt = new Date();
          count++;
        }
      }
      return { count };
    },
  };

  matchmakingTicketMember = {
    create: async ({ data }: any) => {
      const ticket = this.tickets.get(data.ticketId);
      if (ticket) {
        ticket.members.push({
          id: randomUUID(),
          ticketId: data.ticketId,
          userId: data.userId,
        });
      }
      return data;
    },

    createMany: async ({ data }: any) => {
      for (const item of data) {
        const ticket = this.tickets.get(item.ticketId);
        if (ticket) {
          ticket.members.push({
            id: randomUUID(),
            ticketId: item.ticketId,
            userId: item.userId,
          });
        }
      }
      return { count: data.length };
    },

    findFirst: async ({ where, orderBy }: any) => {
      let allMembers: Array<{ ticket: MockTicket; userId: string }> = [];
      for (const t of this.tickets.values()) {
        for (const m of t.members) {
          allMembers.push({ ticket: t, userId: m.userId });
        }
      }

      if (where.userId) {
        if (where.userId.in) {
          allMembers = allMembers.filter((item) => where.userId.in.includes(item.userId));
        } else {
          allMembers = allMembers.filter((item) => item.userId === where.userId);
        }
      }

      if (where.ticket) {
        if (where.ticket.id) {
          allMembers = allMembers.filter((item) => item.ticket.id === where.ticket.id);
        }
        if (where.ticket.status) {
          if (where.ticket.status.in) {
            allMembers = allMembers.filter((item) =>
              where.ticket.status.in.includes(item.ticket.status),
            );
          } else {
            allMembers = allMembers.filter(
              (item) => item.ticket.status === where.ticket.status,
            );
          }
        }
        if (where.ticket.expiresAt?.gt) {
          allMembers = allMembers.filter(
            (item) => item.ticket.expiresAt > where.ticket.expiresAt.gt,
          );
        }
        if (where.ticket.updatedAt?.gt) {
          allMembers = allMembers.filter(
            (item) => item.ticket.updatedAt > where.ticket.updatedAt.gt,
          );
        }
      }

      if (orderBy?.createdAt === 'desc') {
        allMembers.sort((a, b) => b.ticket.createdAt.getTime() - a.ticket.createdAt.getTime());
      }

      const hit = allMembers[0];
      if (!hit) return null;

      return {
        userId: hit.userId,
        ticket: this.enrichTicket(hit.ticket),
      };
    },
  };

  private enrichTicket(t: MockTicket) {
    return {
      ...t,
      members: t.members.map((m) => ({
        ...m,
        user: this.users.get(m.userId) ?? {
          id: m.userId,
          moderationStatus: 'ACTIVE',
          profile: { username: m.userId.slice(0, 8) },
        },
      })),
    };
  }
}

// Mock Realtime Server
class MockRealtimeServer {
  readonly sentMessages: Array<{ userId: string; event: string; payload: any }> = [];

  sendToUser(userId: string, event: string, payload: any): void {
    this.sentMessages.push({ userId, event, payload });
  }

  registerConnection(): void {}
  removeConnection(): void {}
  getConnection(): any { return undefined; }
  getConnectionsByUserId(): any[] { return []; }
  getAllConnections(): any[] { return []; }
  broadcast(): void {}
  broadcastToRoom(): void {}
  on(): () => void { return () => {}; }
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Phase 6E: Server-Authoritative Matchmaking Foundation', () => {
  let prisma: MockPrismaService;
  let realtimeServer: MockRealtimeServer;
  let roomManager: RoomManager;
  let notifier: MatchmakingRealtimeNotifier;
  let engine: MatchmakingEngineCore;
  let service: MatchmakingServiceCore;

  beforeEach(() => {
    prisma = new MockPrismaService();
    realtimeServer = new MockRealtimeServer();
    roomManager = new RoomManager(realtimeServer as any);
    notifier = new MatchmakingRealtimeNotifier(realtimeServer as any);
    engine = new MatchmakingEngineCore(prisma as any, roomManager as any, notifier as any);
    service = new MatchmakingServiceCore(prisma as any, engine as any, roomManager as any, notifier as any);

    // Seed test users
    for (let i = 1; i <= 20; i++) {
      const id = `user_${i}`;
      prisma.users.set(id, {
        id,
        moderationStatus: 'ACTIVE',
        profile: { username: `player_${i}`, displayName: `Player ${i}` },
      });
    }
  });

  describe('1. Solo Player Enqueue & State Transitions', () => {
    it('successfully enqueues an authenticated solo player', async () => {
      const ticket = await service.joinQueue('user_1', 'TARNEEB');

      assert.ok(ticket.ticketId);
      assert.equal(ticket.gameMode, 'TARNEEB');
      assert.equal(ticket.status, 'QUEUED');
      assert.equal(ticket.memberCount, 1);
      assert.equal(ticket.partyId, null);
      assert.equal(ticket.leaderUserId, 'user_1');
      assert.equal(ticket.members.length, 1);
      assert.equal(ticket.members[0].userId, 'user_1');
    });

    it('prevents double-entry for the same user in active queue', async () => {
      await service.joinQueue('user_1', 'TARNEEB');

      await assert.rejects(
        () => service.joinQueue('user_1', 'TARNEEB'),
        (err: any) => err.response?.code === MatchmakingErrorCodes.ALREADY_QUEUED,
      );
    });

    it('rejects unsupported or invalid game modes', async () => {
      await assert.rejects(
        () => service.joinQueue('user_1', 'INVALID_MODE' as any),
        (err: any) => err.response?.code === MatchmakingErrorCodes.INVALID_GAME_MODE,
      );
    });

    it('rejects suspended or banned players', async () => {
      prisma.users.get('user_1')!.moderationStatus = 'BANNED';

      await assert.rejects(
        () => service.joinQueue('user_1', 'TARNEEB'),
        (err: any) => err.response?.code === MatchmakingErrorCodes.ACCOUNT_RESTRICTED,
      );
    });
  });

  describe('2. Party Matchmaking as an Atomic Unit', () => {
    beforeEach(() => {
      // Create party of 3: leader user_1, members user_2, user_3
      const partyId = 'party_123';
      const party: MockParty = {
        id: partyId,
        leaderUserId: 'user_1',
        status: 'ACTIVE',
        version: 1,
        members: [
          { id: 'pm_1', partyId, userId: 'user_1', readyState: 'READY' },
          { id: 'pm_2', partyId, userId: 'user_2', readyState: 'READY' },
          { id: 'pm_3', partyId, userId: 'user_3', readyState: 'READY' },
        ],
      };
      prisma.parties.set(partyId, party);
      for (const m of party.members) {
        prisma.partyMembers.set(m.userId, m);
      }
    });

    it('enqueues a full party as one atomic unit preserving snapshot', async () => {
      const ticket = await service.joinQueue('user_1', 'ATRASH');

      assert.equal(ticket.status, 'QUEUED');
      assert.equal(ticket.partyId, 'party_123');
      assert.equal(ticket.partyVersion, 1);
      assert.equal(ticket.memberCount, 3);
      assert.equal(ticket.members.length, 3);
      assert.deepEqual(
        ticket.members.map((m) => m.userId),
        ['user_1', 'user_2', 'user_3'],
      );
    });

    it('rejects enqueue when called by a non-leader party member', async () => {
      await assert.rejects(
        () => service.joinQueue('user_2', 'ATRASH'),
        (err: any) => err.response?.code === MatchmakingErrorCodes.NOT_PARTY_LEADER,
      );
    });

    it('rejects enqueue if any party member is NOT ready', async () => {
      prisma.partyMembers.get('user_3')!.readyState = 'NOT_READY';

      await assert.rejects(
        () => service.joinQueue('user_1', 'ATRASH'),
        (err: any) => err.response?.code === MatchmakingErrorCodes.PARTY_NOT_READY,
      );
    });

    it('rejects enqueue if party size exceeds game capacity', async () => {
      // Party of 3 tries to join Tarneeb (capacity 4 is ok, but add 2 more members -> 5 exceeds 4)
      prisma.partyMembers.set('user_4', { id: 'pm_4', partyId: 'party_123', userId: 'user_4', readyState: 'READY' });
      prisma.partyMembers.set('user_5', { id: 'pm_5', partyId: 'party_123', userId: 'user_5', readyState: 'READY' });

      await assert.rejects(
        () => service.joinQueue('user_1', 'TARNEEB'),
        (err: any) => err.response?.code === MatchmakingErrorCodes.PARTY_GAME_CAPACITY_EXCEEDED,
      );
    });
  });

  describe('3. Exact Capacity Enforcement & Party Grouping', () => {
    it('forms exact capacity match for Tarneeb (capacity 4)', async () => {
      // Enqueue 4 solo players
      await service.joinQueue('user_1', 'TARNEEB');
      await service.joinQueue('user_2', 'TARNEEB');
      await service.joinQueue('user_3', 'TARNEEB');
      await service.joinQueue('user_4', 'TARNEEB');

      let match = await engine.tryMatchQueue('TARNEEB');
      if (!match) {
        const s = await service.getQueueStatus('user_1');
        match = s.match ?? null;
      }

      assert.ok(match);
      assert.equal(match.gameMode, 'TARNEEB');
      assert.equal(match.participants.length, 4);
      assert.ok(match.roomId);

      // Verify all 4 tickets transitioned to MATCHED
      const status1 = await service.getQueueStatus('user_1');
      assert.equal(status1.ticket?.status, 'MATCHED');
      assert.equal(status1.match?.matchId, match.matchId);
    });

    it('combines party of 2 and party of 3 for Atrash (capacity 5) without splitting', async () => {
      // Party A: user_1, user_2
      const partyAId = 'party_a';
      prisma.parties.set(partyAId, {
        id: partyAId,
        leaderUserId: 'user_1',
        status: 'ACTIVE',
        version: 1,
        members: [
          { id: 'pa_1', partyId: partyAId, userId: 'user_1', readyState: 'READY' },
          { id: 'pa_2', partyId: partyAId, userId: 'user_2', readyState: 'READY' },
        ],
      });
      prisma.partyMembers.set('user_1', { id: 'pa_1', partyId: partyAId, userId: 'user_1', readyState: 'READY' });
      prisma.partyMembers.set('user_2', { id: 'pa_2', partyId: partyAId, userId: 'user_2', readyState: 'READY' });

      // Party B: user_3, user_4, user_5
      const partyBId = 'party_b';
      prisma.parties.set(partyBId, {
        id: partyBId,
        leaderUserId: 'user_3',
        status: 'ACTIVE',
        version: 1,
        members: [
          { id: 'pb_1', partyId: partyBId, userId: 'user_3', readyState: 'READY' },
          { id: 'pb_2', partyId: partyBId, userId: 'user_4', readyState: 'READY' },
          { id: 'pb_3', partyId: partyBId, userId: 'user_5', readyState: 'READY' },
        ],
      });
      prisma.partyMembers.set('user_3', { id: 'pb_1', partyId: partyBId, userId: 'user_3', readyState: 'READY' });
      prisma.partyMembers.set('user_4', { id: 'pb_2', partyId: partyBId, userId: 'user_4', readyState: 'READY' });
      prisma.partyMembers.set('user_5', { id: 'pb_3', partyId: partyBId, userId: 'user_5', readyState: 'READY' });

      await service.joinQueue('user_1', 'ATRASH');
      await service.joinQueue('user_3', 'ATRASH');

      let match = await engine.tryMatchQueue('ATRASH');
      if (!match) {
        const s = await service.getQueueStatus('user_1');
        match = s.match ?? null;
      }

      assert.ok(match);
      assert.equal(match.participants.length, 5);
      assert.equal(match.partyGrouping[partyAId].length, 2);
      assert.equal(match.partyGrouping[partyBId].length, 3);
    });

    it('never creates partially filled or overfilled matches', async () => {
      // 3 solo players queued for Tarneeb (needs 4)
      await service.joinQueue('user_1', 'TARNEEB');
      await service.joinQueue('user_2', 'TARNEEB');
      await service.joinQueue('user_3', 'TARNEEB');

      const match = await engine.tryMatchQueue('TARNEEB');
      assert.equal(match, null);

      // Verify all tickets are still QUEUED
      const status = await service.getQueueStatus('user_1');
      assert.equal(status.ticket?.status, 'QUEUED');
    });
  });

  describe('4. Snapshot Consistency & Invalidation During Matching', () => {
    it('invalidates ticket if party version changed before match formation', async () => {
      const partyId = 'party_volatile';
      prisma.parties.set(partyId, {
        id: partyId,
        leaderUserId: 'user_1',
        status: 'ACTIVE',
        version: 1,
        members: [
          { id: 'pv_1', partyId, userId: 'user_1', readyState: 'READY' },
          { id: 'pv_2', partyId, userId: 'user_2', readyState: 'READY' },
        ],
      });
      prisma.partyMembers.set('user_1', { id: 'pv_1', partyId, userId: 'user_1', readyState: 'READY' });
      prisma.partyMembers.set('user_2', { id: 'pv_2', partyId, userId: 'user_2', readyState: 'READY' });

      await service.joinQueue('user_1', 'TARNEEB');
      await service.joinQueue('user_3', 'TARNEEB');

      // Party changes materially (a member joins or leaves, bumping party version to 2)
      prisma.parties.get(partyId)!.version = 2;

      // Add 4th player
      await service.joinQueue('user_4', 'TARNEEB');

      // Matchmaker runs
      const match = await engine.tryMatchQueue('TARNEEB');
      assert.equal(match, null); // Cannot form match because candidate party is invalid

      // Party ticket transitions to FAILED
      const partyTicket = await service.getQueueStatus('user_1');
      assert.equal(partyTicket.ticket?.status, 'FAILED');

      // Solo tickets return to QUEUED preserving FIFO position
      const soloTicket = await service.getQueueStatus('user_3');
      assert.equal(soloTicket.ticket?.status, 'QUEUED');
    });
  });

  describe('5. Concurrency & Race Condition Safety', () => {
    it('handles simultaneous enqueue race for the same user deterministically', async () => {
      // 5 concurrent enqueue calls for user_1
      const results = await Promise.allSettled([
        service.joinQueue('user_1', 'TARNEEB'),
        service.joinQueue('user_1', 'TARNEEB'),
        service.joinQueue('user_1', 'TARNEEB'),
        service.joinQueue('user_1', 'TARNEEB'),
        service.joinQueue('user_1', 'TARNEEB'),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.equal(fulfilled.length, 1);
      assert.equal(rejected.length, 4);
    });

    it('resolves cancel vs match race deterministically', async () => {
      await service.joinQueue('user_1', 'TARNEEB');
      await service.joinQueue('user_2', 'TARNEEB');
      await service.joinQueue('user_3', 'TARNEEB');

      // Simultaneously join 4th player and cancel 1st player
      const [cancelResult, joinResult] = await Promise.allSettled([
        service.cancelQueue('user_1'),
        service.joinQueue('user_4', 'TARNEEB'),
      ]);

      const status = await service.getQueueStatus('user_1');
      // Either cancelled or matched, never stuck or undefined
      assert.ok(status.ticket?.status === 'CANCELLED' || status.ticket?.status === 'MATCHED');
    });

    it('handles two matchmakers scanning the same queue concurrently without double-matching', async () => {
      // Create tickets directly in DB to test scanner concurrency without auto-trigger
      const t1 = await prisma.matchmakingTicket.create({
        data: { gameMode: 'TARNEEB', status: 'QUEUED', leaderUserId: 'user_1', memberCount: 1, expiresAt: new Date(Date.now() + 60000) },
      });
      await prisma.matchmakingTicketMember.create({ data: { ticketId: t1.id, userId: 'user_1' } });

      const t2 = await prisma.matchmakingTicket.create({
        data: { gameMode: 'TARNEEB', status: 'QUEUED', leaderUserId: 'user_2', memberCount: 1, expiresAt: new Date(Date.now() + 60000) },
      });
      await prisma.matchmakingTicketMember.create({ data: { ticketId: t2.id, userId: 'user_2' } });

      const t3 = await prisma.matchmakingTicket.create({
        data: { gameMode: 'TARNEEB', status: 'QUEUED', leaderUserId: 'user_3', memberCount: 1, expiresAt: new Date(Date.now() + 60000) },
      });
      await prisma.matchmakingTicketMember.create({ data: { ticketId: t3.id, userId: 'user_3' } });

      const t4 = await prisma.matchmakingTicket.create({
        data: { gameMode: 'TARNEEB', status: 'QUEUED', leaderUserId: 'user_4', memberCount: 1, expiresAt: new Date(Date.now() + 60000) },
      });
      await prisma.matchmakingTicketMember.create({ data: { ticketId: t4.id, userId: 'user_4' } });

      // Concurrent scan
      const [m1, m2] = await Promise.all([
        engine.tryMatchQueue('TARNEEB'),
        engine.tryMatchQueue('TARNEEB'),
      ]);

      // Exactly one match formed
      const matches = [m1, m2].filter(Boolean);
      assert.equal(matches.length, 1);
    });
  });

  describe('6. Authorization & Cancellation Semantics', () => {
    it('only allows the party leader to cancel a party ticket', async () => {
      const partyId = 'party_auth';
      prisma.parties.set(partyId, {
        id: partyId,
        leaderUserId: 'user_1',
        status: 'ACTIVE',
        version: 1,
        members: [
          { id: 'p1', partyId, userId: 'user_1', readyState: 'READY' },
          { id: 'p2', partyId, userId: 'user_2', readyState: 'READY' },
        ],
      });
      prisma.partyMembers.set('user_1', { id: 'p1', partyId, userId: 'user_1', readyState: 'READY' });
      prisma.partyMembers.set('user_2', { id: 'p2', partyId, userId: 'user_2', readyState: 'READY' });

      await service.joinQueue('user_1', 'TARNEEB');

      // Member user_2 attempts to cancel
      await assert.rejects(
        () => service.cancelQueue('user_2'),
        (err: any) => err.response?.code === MatchmakingErrorCodes.UNAUTHORIZED_CANCELLATION,
      );

      // Leader user_1 successfully cancels
      const res = await service.cancelQueue('user_1');
      assert.equal(res.cancelled, true);
    });
  });

  describe('7. Room Integration & Realtime Notifications', () => {
    it('creates an ephemeral Room in RoomManager with READY state upon match assignment', async () => {
      await service.joinQueue('user_1', 'TARNEEB');
      await service.joinQueue('user_2', 'TARNEEB');
      await service.joinQueue('user_3', 'TARNEEB');
      await service.joinQueue('user_4', 'TARNEEB');

      let match = await engine.tryMatchQueue('TARNEEB');
      if (!match) {
        const s = await service.getQueueStatus('user_1');
        match = s.match ?? null;
      }
      assert.ok(match);

      // Verify room exists in RoomManager
      const room = roomManager.getRoom(match.roomId);
      assert.ok(room);
      assert.equal(room.capacity, 4);
      assert.equal(room.participantCount, 4);
      // Because participants == capacity, room transitioned to READY!
      assert.equal(room.state, 'READY');

      // Verify realtime notifications were dispatched
      const matchEvents = realtimeServer.sentMessages.filter(
        (m) => m.event === MatchmakingSystemEvents.MATCH_FOUND,
      );
      assert.equal(matchEvents.length, 4);
      assert.deepEqual(
        matchEvents.map((m) => m.userId).sort(),
        ['user_1', 'user_2', 'user_3', 'user_4'].sort(),
      );
    });

    it('sweeps expired tickets cleanly after timeout', async () => {
      await service.joinQueue('user_1', 'TARNEEB');
      // Set ticket expiry in the past
      const ticket = Array.from(prisma.tickets.values())[0];
      ticket.expiresAt = new Date(Date.now() - 10_000);

      const sweptCount = await engine.sweepExpiredTickets();
      assert.equal(sweptCount, 1);

      const status = await service.getQueueStatus('user_1');
      assert.equal(status.ticket?.status, 'EXPIRED');
    });
  });
});
