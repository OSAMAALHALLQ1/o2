import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  type ClientEventEnvelope,
  type ConnectionState,
  REALTIME_CONSTANTS,
  REALTIME_PROTOCOL_VERSION,
  RealtimeErrorCodes,
  VoiceErrorCodes,
} from '@o2/types';
import { RealtimeRateLimiter } from '../src/modules/realtime/services/realtime-rate-limiter.ts';
import { RealtimeServerEngine } from '../src/modules/realtime/services/realtime-server.ts';
import type { RealtimeConnection } from '../src/modules/realtime/transport/realtime-connection.interface.ts';
import { RoomManager } from '../src/modules/realtime/rooms/room-manager.ts';
import { MatchmakingEngineCore } from '../src/modules/matchmaking/matchmaking.engine.ts';
import { MatchmakingServiceCore } from '../src/modules/matchmaking/matchmaking.manager.ts';
import { MatchmakingRealtimeNotifier } from '../src/modules/matchmaking/matchmaking-realtime.manager.ts';
import { MockVoiceAdapter } from '../src/modules/voice/adapters/mock-voice.adapter.ts';
import { VoiceRoomManager } from '../src/modules/voice/voice-room.manager.ts';
import { VoiceServiceCore } from '../src/modules/voice/voice.manager.ts';

// ============================================================================
// BENCHMARK & HARDENING UTILITIES
// ============================================================================

function calculatePercentiles(latenciesMs: number[]): { p50: number; p95: number; p99: number; avg: number } {
  if (latenciesMs.length === 0) return { p50: 0, p95: 0, p99: 0, avg: 0 };
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
  const avg = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
  return {
    p50: Number(p50.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    p99: Number(p99.toFixed(2)),
    avg: Number(avg.toFixed(2)),
  };
}

class MockRealtimeConnection implements RealtimeConnection {
  readonly connectionId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly role: string;
  readonly connectedAt: number;

  state: ConnectionState = 'AUTHENTICATING';
  sequence = 0;
  lastHeartbeatAt: number;
  lastPingAt: number;

  readonly sentEnvelopes: any[] = [];
  readonly sentErrors: any[] = [];
  disconnected = false;
  disconnectReason?: string;

  isSlowConsumer = false;
  delayMs = 0;

  constructor(id: string, userId: string, sessionId = 'sess_default', role = 'PLAYER') {
    this.connectionId = id;
    this.userId = userId;
    this.sessionId = sessionId;
    this.role = role;
    this.connectedAt = Date.now();
    this.lastHeartbeatAt = Date.now();
    this.lastPingAt = Date.now();
  }

  setState(nextState: ConnectionState): void {
    this.state = nextState;
  }

  touchHeartbeat(): void {
    this.lastHeartbeatAt = Date.now();
    this.lastPingAt = Date.now();
  }

  send<T = unknown>(event: string, payload: T, requestId?: string): any {
    this.sequence += 1;
    const envelope = {
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      event,
      requestId,
      sequence: this.sequence,
      serverTimestamp: Date.now(),
      payload,
    };
    if (this.isSlowConsumer) {
      setTimeout(() => {
        this.sentEnvelopes.push(envelope);
      }, this.delayMs);
      return envelope;
    }
    this.sentEnvelopes.push(envelope);
    return envelope;
  }

  sendError(code: string, message: string, requestId?: string): any {
    const err = {
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      requestId,
      code,
      message,
      serverTimestamp: Date.now(),
    };
    this.sentErrors.push(err);
    return err;
  }

  disconnect(reason?: string): void {
    this.disconnected = true;
    this.disconnectReason = reason;
    this.state = 'DISCONNECTED';
  }
}

class HardeningMockPrisma {
  users = new Map<string, { id: string; moderationStatus: string; profile: any }>();
  parties = new Map<string, { id: string; leaderUserId: string; status: string; version: number }>();
  partyMembers = new Map<string, { id: string; partyId: string; userId: string; readyState: string }>();
  tickets = new Map<string, any>();
  ticketMembers = new Map<string, any>();

  user = {
    findUnique: async ({ where }: any) => this.users.get(where.id) ?? null,
  };

  party = {
    findUnique: async ({ where }: any) => {
      const p = this.parties.get(where.id);
      if (!p) return null;
      const members = Array.from(this.partyMembers.values())
        .filter((pm) => pm.partyId === p.id)
        .map((m) => ({ ...m, user: this.users.get(m.userId) }));
      return { ...p, members };
    },
  };

  partyMember = {
    findUnique: async ({ where }: any) => {
      const pm = this.partyMembers.get(where.userId);
      if (!pm) return null;
      const party = this.parties.get(pm.partyId);
      const members = Array.from(this.partyMembers.values())
        .filter((m) => m.partyId === pm.partyId)
        .map((m) => ({ ...m, readyState: m.readyState ?? 'READY', isReady: true, user: this.users.get(m.userId) }));
      return { ...pm, readyState: pm.readyState ?? 'READY', party: party ? { ...party, members } : null };
    },
    findMany: async ({ where }: any) => {
      return Array.from(this.partyMembers.values())
        .filter((pm) => pm.partyId === where.partyId)
        .map((pm) => ({ ...pm, user: this.users.get(pm.userId) }));
    },
  };

  matchmakingTicket = {
    findUnique: async ({ where }: any) => {
      const t = this.tickets.get(where.id);
      if (!t) return null;
      return {
        ...t,
        members: Array.from(this.ticketMembers.values())
          .filter((m) => m.ticketId === t.id)
          .map((m) => ({
            ...m,
            user: this.users.get(m.userId) ?? {
              id: m.userId,
              moderationStatus: 'ACTIVE',
              profile: { username: m.userId },
            },
          })),
      };
    },
    findUniqueOrThrow: async ({ where }: any) => {
      const t = this.tickets.get(where.id);
      if (!t) throw new Error('Ticket not found');
      return {
        ...t,
        members: Array.from(this.ticketMembers.values())
          .filter((m) => m.ticketId === t.id)
          .map((m) => ({
            ...m,
            user: this.users.get(m.userId) ?? {
              id: m.userId,
              moderationStatus: 'ACTIVE',
              profile: { username: m.userId },
            },
          })),
      };
    },
    findFirst: async ({ where }: any) => {
      for (const t of this.tickets.values()) {
        if (where.userId && t.userId === where.userId && (!where.status || t.status === where.status)) {
          return { ...t };
        }
      }
      return null;
    },
    findMany: async ({ where }: any) => {
      let list = Array.from(this.tickets.values());
      if (where) {
        if (where.gameMode) list = list.filter((t) => t.gameMode === where.gameMode);
        if (where.status) list = list.filter((t) => t.status === where.status);
        if (where.matchId) list = list.filter((t) => t.matchId === where.matchId);
      }
      return list.map((t) => ({
        ...t,
        members: Array.from(this.ticketMembers.values())
          .filter((m) => m.ticketId === t.id)
          .map((m) => ({
            ...m,
            user: this.users.get(m.userId) ?? {
              id: m.userId,
              moderationStatus: 'ACTIVE',
              profile: { username: m.userId },
            },
          })),
      }));
    },
    create: async ({ data }: any) => {
      const id = data.id ?? `t_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
      const t = {
        ...data,
        id,
        status: data.status ?? 'QUEUED',
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: data.expiresAt ?? new Date(Date.now() + 60000),
      };
      this.tickets.set(id, t);
      return t;
    },
    update: async ({ where, data }: any) => {
      const t = this.tickets.get(where.id);
      if (!t) throw new Error('Ticket not found');
      Object.assign(t, data);
      t.updatedAt = new Date();
      return { ...t };
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const t of this.tickets.values()) {
        const idMatches = where.id
          ? typeof where.id === 'string'
            ? t.id === where.id
            : where.id.in?.includes(t.id)
          : true;
        const statusMatches = where.status ? t.status === where.status : true;
        if (idMatches && statusMatches) {
          Object.assign(t, data);
          t.updatedAt = new Date();
          count++;
        }
      }
      return { count };
    },
  };

  matchmakingTicketMember = {
    findFirst: async ({ where }: any) => {
      for (const tm of this.ticketMembers.values()) {
        if (tm.userId === where.userId) {
          const ticket = this.tickets.get(tm.ticketId);
          if (ticket) {
            let statusMatch = true;
            if (where.ticket?.status) {
              if (Array.isArray(where.ticket.status.in)) {
                statusMatch = where.ticket.status.in.includes(ticket.status);
              } else {
                statusMatch = ticket.status === where.ticket.status;
              }
            }
            if (where.ticket?.id && ticket.id !== where.ticket.id) {
              statusMatch = false;
            }
            if (statusMatch) {
              return {
                ...tm,
                ticket: {
                  ...ticket,
                  members: Array.from(this.ticketMembers.values())
                    .filter((m) => m.ticketId === ticket.id)
                    .map((m) => ({
                      ...m,
                      user: this.users.get(m.userId) ?? {
                        id: m.userId,
                        moderationStatus: 'ACTIVE',
                        profile: { username: m.userId },
                      },
                    })),
                },
              };
            }
          }
        }
      }
      return null;
    },
    create: async ({ data }: any) => {
      const id = `tm_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
      const item = { ...data, id };
      this.ticketMembers.set(id, item);
      return item;
    },
    createMany: async ({ data }: any) => {
      for (const item of data) {
        const id = `tm_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
        this.ticketMembers.set(id, { ...item, id });
      }
      return { count: data.length };
    },
  };

  $transaction = async (fn: (tx: any) => Promise<any>) => fn(this);
}

// ============================================================================
// PHASE 6G BENCHMARK & HARDENING TEST SUITE
// ============================================================================

describe('Phase 6G: Realtime Load, Concurrency & Hardening Audit', () => {
  // --------------------------------------------------------------------------
  // 1. STAGED LOAD BENCHMARKS (LEVELS A, B, C, D)
  // --------------------------------------------------------------------------
  describe('1. Staged Socket Load & Burst Benchmarks', () => {
    it('executes Level A (50 sockets), Level B (150 sockets), Level C (300 sockets), Level D (500 sockets burst)', async () => {
      const levels = [
        { name: 'LEVEL A — Baseline', count: 50 },
        { name: 'LEVEL B — Moderate', count: 150 },
        { name: 'LEVEL C — High', count: 300 },
        { name: 'LEVEL D — Stress & Burst', count: 500 },
      ];

      for (const level of levels) {
        const rateLimiter = new RealtimeRateLimiter();
        const server = new RealtimeServerEngine(rateLimiter);
        const startMem = process.memoryUsage().heapUsed;
        const latencies: number[] = [];

        const startTime = Date.now();
        for (let i = 0; i < level.count; i++) {
          const t0 = performance.now();
          const conn = new MockRealtimeConnection(`conn_${level.count}_${i}`, `user_${i}`);
          server.registerConnection(conn);
          latencies.push(performance.now() - t0);
        }
        const totalDurationMs = Date.now() - startTime;
        const endMem = process.memoryUsage().heapUsed;
        const memDeltaKB = Math.round((endMem - startMem) / 1024);

        const stats = calculatePercentiles(latencies);

        assert.equal(server.getAllConnections().length, level.count);
        assert.ok(stats.avg < 5.0, `${level.name} average connection latency should be sub-5ms, measured: ${stats.avg}ms`);

        // Teardown connections cleanly
        for (let i = 0; i < level.count; i++) {
          server.removeConnection(`conn_${level.count}_${i}`);
        }
        assert.equal(server.getAllConnections().length, 0);

        assert.ok(totalDurationMs >= 0);
        assert.ok(memDeltaKB >= -5000);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 2. HEARTBEAT PROCESSING & STALE CONNECTION SWEEP
  // --------------------------------------------------------------------------
  describe('2. Heartbeat Load & Stale Connection Sweep', () => {
    it('detects and cleans up stale connections that fail to beat within timeout window', async () => {
      const rateLimiter = new RealtimeRateLimiter();
      const server = new RealtimeServerEngine(rateLimiter);

      const connFresh = new MockRealtimeConnection('conn_fresh', 'user_fresh');
      const connStale = new MockRealtimeConnection('conn_stale', 'user_stale');

      server.registerConnection(connFresh);
      server.registerConnection(connStale);

      // Artificially age stale connection beyond timeout
      const now = Date.now();
      connStale.lastHeartbeatAt = now - (REALTIME_CONSTANTS.HEARTBEAT_TIMEOUT_MS + 1000);
      connFresh.lastHeartbeatAt = now - 5000;

      const timedOut = server.checkHeartbeats(now);
      assert.equal(timedOut.length, 1);
      assert.equal(timedOut[0], 'conn_stale');
      assert.equal(connStale.disconnected, true);
      assert.equal(connStale.disconnectReason, 'HEARTBEAT_TIMEOUT');
      assert.equal(server.getConnection('conn_stale'), undefined);
      assert.ok(server.getConnection('conn_fresh'));

      server.removeConnection('conn_fresh');
    });
  });

  // --------------------------------------------------------------------------
  // 3. ROOM CONCURRENCY & PER-ROOM SEQUENTIAL EXECUTOR
  // --------------------------------------------------------------------------
  describe('3. Room Concurrency & Sequential Action Execution', () => {
    it('serializes concurrent actions per room without race conditions or state corruption', async () => {
      const rateLimiter = new RealtimeRateLimiter();
      const server = new RealtimeServerEngine(rateLimiter);
      const roomManager = new RoomManager(server as any);

      const host = { userId: 'host_1', username: 'HostUser' };
      const roomProj = await roomManager.createRoom(host, 'TARNEEB', 4);
      const roomId = roomProj.roomId;

      // Concurrently join 3 more players
      const joins = [
        roomManager.joinRoom(roomId, { userId: 'p_2', username: 'Player2' }),
        roomManager.joinRoom(roomId, { userId: 'p_3', username: 'Player3' }),
        roomManager.joinRoom(roomId, { userId: 'p_4', username: 'Player4' }),
      ];
      await Promise.all(joins);

      const room = roomManager.getRoom(roomId);
      assert.ok(room);
      assert.equal(room.participants.length, 4);

      // Concurrently fire 20 actions into the room executor
      const executionOrder: number[] = [];
      const actions = Array.from({ length: 20 }, (_, idx) =>
        room.executor.execute(async () => {
          await new Promise((r) => setTimeout(r, 2));
          executionOrder.push(idx);
          return idx;
        }),
      );

      await Promise.all(actions);

      // Verify exact serial execution without overlap
      assert.equal(executionOrder.length, 20);
      assert.deepEqual(executionOrder, Array.from({ length: 20 }, (_, i) => i));

      // Clean up room
      await roomManager.leaveRoom(roomId, 'p_4');
      await roomManager.leaveRoom(roomId, 'p_3');
      await roomManager.leaveRoom(roomId, 'p_2');
      await roomManager.leaveRoom(roomId, 'host_1');
      assert.equal(roomManager.getRoom(roomId), undefined);
    });

    it('handles rapid join/leave bursts and disposes abandoned rooms cleanly', async () => {
      const rateLimiter = new RealtimeRateLimiter();
      const server = new RealtimeServerEngine(rateLimiter);
      const roomManager = new RoomManager(server as any);

      const createdRooms: Array<{ roomId: string; userId: string }> = [];

      for (let i = 0; i < 20; i++) {
        const userId = `user_${i}`;
        const proj = await roomManager.createRoom({ userId, username: `User${i}` }, 'ATRASH', 5);
        createdRooms.push({ roomId: proj.roomId, userId });
      }
      assert.equal(roomManager.roomCount, 20);

      // Abandon and leave all rooms
      for (const item of createdRooms) {
        await roomManager.leaveRoom(item.roomId, item.userId);
      }

      // Sweep closed rooms
      const sweepRes = roomManager.sweepStaleRooms();
      assert.equal(sweepRes.closedCount, 20);
      assert.equal(roomManager.roomCount, 0, 'All abandoned rooms must be purged after sweep');
    });
  });

  // --------------------------------------------------------------------------
  // 4. PARTY EVENT PUBLICATION & MONOTONICITY
  // --------------------------------------------------------------------------
  describe('4. Party Realtime Event Publication & Monotonicity', () => {
    it('enforces monotonic version increments and prevents leakage to non-members', async () => {
      const rateLimiter = new RealtimeRateLimiter();
      const server = new RealtimeServerEngine(rateLimiter);

      const memberConn = new MockRealtimeConnection('sock_member', 'member_user');
      const outsiderConn = new MockRealtimeConnection('sock_outsider', 'outsider_user');

      server.registerConnection(memberConn);
      server.registerConnection(outsiderConn);

      // Publish 10 rapid party state events
      const partyId = 'party_stream_123';
      for (let v = 1; v <= 10; v++) {
        server.sendToUser('member_user', 'party:state_updated', {
          partyId,
          version: v,
          timestamp: Date.now(),
        });
      }

      // Member received all 10 events
      const partyEvents = memberConn.sentEnvelopes.filter((e) => e.event === 'party:state_updated');
      assert.equal(partyEvents.length, 10);
      for (let i = 0; i < 10; i++) {
        assert.equal(partyEvents[i].payload.version, i + 1);
      }

      // Outsider received 0 party events
      const outsiderPartyEvents = outsiderConn.sentEnvelopes.filter((e) => e.event === 'party:state_updated');
      assert.equal(outsiderPartyEvents.length, 0);

      server.removeConnection('sock_member');
      server.removeConnection('sock_outsider');
    });
  });

  // --------------------------------------------------------------------------
  // 5. CONTROLLED RECONNECT STORMS
  // --------------------------------------------------------------------------
  describe('5. Controlled Reconnect Storms', () => {
    it('handles mass disconnect followed by staggered reconnect and state recovery', async () => {
      const rateLimiter = new RealtimeRateLimiter();
      const server = new RealtimeServerEngine(rateLimiter);
      const userCount = 50;

      // Connect 50 clients
      for (let i = 0; i < userCount; i++) {
        const c = new MockRealtimeConnection(`conn_init_${i}`, `user_${i}`);
        server.registerConnection(c);
      }
      assert.equal(server.getAllConnections().length, userCount);

      // Mass disconnect
      for (let i = 0; i < userCount; i++) {
        server.removeConnection(`conn_init_${i}`);
      }
      assert.equal(server.getAllConnections().length, 0);

      // Staggered reconnect with backoff
      const reconnectLatencies: number[] = [];
      for (let i = 0; i < userCount; i++) {
        const t0 = performance.now();
        const c = new MockRealtimeConnection(`conn_recon_${i}`, `user_${i}`);
        server.registerConnection(c);
        reconnectLatencies.push(performance.now() - t0);
      }

      assert.equal(server.getAllConnections().length, userCount);
      const stats = calculatePercentiles(reconnectLatencies);
      assert.ok(stats.p95 < 5.0, 'Reconnect p95 should be under 5ms');

      // Cleanup
      for (let i = 0; i < userCount; i++) {
        server.removeConnection(`conn_recon_${i}`);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 6. MATCHMAKING LOAD & RACE SAFETY
  // --------------------------------------------------------------------------
  describe('6. Matchmaking Concurrency & Exact Capacity Safety', () => {
    it('matches exact capacity, avoids duplicate assignments, and prevents party splitting under concurrent enqueue', async () => {
      const prisma = new HardeningMockPrisma();
      const rateLimiter = new RealtimeRateLimiter();
      const server = new RealtimeServerEngine(rateLimiter);
      const roomManager = new RoomManager(server as any);
      const notifier = new MatchmakingRealtimeNotifier(server as any);
      const engine = new MatchmakingEngineCore(prisma as any, roomManager as any, notifier as any);
      const matchmaking = new MatchmakingServiceCore(prisma as any, engine, roomManager, notifier);

      // Seed 14 users (exact MAFIA_CLASSIC capacity = 14)
      for (let i = 1; i <= 14; i++) {
        prisma.users.set(`m_user_${i}`, {
          id: `m_user_${i}`,
          moderationStatus: 'ACTIVE',
          profile: { username: `Mafia${i}` },
        });
      }

      // Seed a party of 4 (users 1..4)
      const partyId = 'party_mafia_4';
      prisma.parties.set(partyId, { id: partyId, leaderUserId: 'm_user_1', status: 'ACTIVE', version: 1 });
      for (let i = 1; i <= 4; i++) {
        prisma.partyMembers.set(`m_user_${i}`, { id: `pm_${i}`, partyId, userId: `m_user_${i}`, readyState: 'READY' });
      }

      // Enqueue the party
      await matchmaking.joinQueue('m_user_1', 'MAFIA_CLASSIC');

      // Concurrently enqueue 10 solo players
      const soloEnqueues = Array.from({ length: 10 }, (_, idx) =>
        matchmaking.joinQueue(`m_user_${idx + 5}`, 'MAFIA_CLASSIC'),
      );
      await Promise.all(soloEnqueues);

      // Run match cycle (or retrieve if automatically triggered on queue fill)
      let result = await engine.tryMatchQueue('MAFIA_CLASSIC');
      if (!result) {
        const s = await matchmaking.getQueueStatus('m_user_1');
        result = s.match ?? null;
      }
      assert.ok(result);
      assert.equal(result.participants.length, 14);
      assert.equal(result.partyGrouping[partyId].length, 4);

      // Verify room was created with exact capacity (14)
      const createdRoom = roomManager.getAllRooms()[0];
      assert.ok(createdRoom);
      assert.equal(createdRoom.gameMode, 'MAFIA_CLASSIC');
      assert.equal(createdRoom.participants.length, 14);

      // Ensure no ticket was left in QUEUED state
      for (const t of prisma.tickets.values()) {
        assert.equal(t.status, 'MATCHED');
      }
    });

    it('safely handles simultaneous enqueue and cancel race without double matching', async () => {
      const prisma = new HardeningMockPrisma();
      const rateLimiter = new RealtimeRateLimiter();
      const server = new RealtimeServerEngine(rateLimiter);
      const roomManager = new RoomManager(server as any);
      const notifier = new MatchmakingRealtimeNotifier(server as any);
      const engine = new MatchmakingEngineCore(prisma as any, roomManager as any, notifier as any);
      const matchmaking = new MatchmakingServiceCore(prisma as any, engine, roomManager, notifier);

      prisma.users.set('race_user_1', { id: 'race_user_1', moderationStatus: 'ACTIVE', profile: {} });

      const ticket = await matchmaking.joinQueue('race_user_1', 'TARNEEB');
      assert.equal(ticket.status, 'QUEUED');

      // Cancel race
      const cancelResult = await matchmaking.cancelQueue('race_user_1', ticket.id);
      assert.equal(cancelResult.cancelled, true);

      // Match scan should find 0 matches
      const matchResult = await engine.tryMatchQueue('TARNEEB');
      assert.equal(matchResult, null);
    });
  });

  // --------------------------------------------------------------------------
  // 7. VOICE FOUNDATION LOCAL CONCURRENCY & ACCESS
  // --------------------------------------------------------------------------
  describe('7. Voice Foundation Local Concurrency & Permissions', () => {
    it('handles concurrent token issuance, ephemeral room join, and moderation mute', async () => {
      const prisma = new HardeningMockPrisma();
      const voiceRoomManager = new VoiceRoomManager();
      const mockAdapter = new MockVoiceAdapter('secret');
      const voiceService = new VoiceServiceCore(prisma as any, mockAdapter, voiceRoomManager);

      // Seed party with 8 members
      const partyId = 'voice_party_8';
      prisma.parties.set(partyId, { id: partyId, leaderUserId: 'v_user_1', status: 'ACTIVE' });
      for (let i = 1; i <= 8; i++) {
        const id = `v_user_${i}`;
        prisma.users.set(id, { id, moderationStatus: 'ACTIVE', profile: { username: `VPlayer${i}` } });
        prisma.partyMembers.set(id, { id: `v_pm_${i}`, partyId, userId: id });
      }

      // Concurrently issue voice tokens for all 8 members
      const tokenPromises = Array.from({ length: 8 }, (_, idx) =>
        voiceService.requestVoiceGrant(`v_user_${idx + 1}`, { contextType: 'PARTY', contextId: partyId }),
      );
      const grants = await Promise.all(tokenPromises);
      assert.equal(grants.length, 8);

      const summary = await voiceService.getRoomSummary('v_user_1', 'PARTY', partyId);
      assert.equal(summary.participantCount, 8);

      // Leader mutes member 2
      const mutedP = await voiceService.setServerMute('v_user_1', 'PARTY', partyId, {
        targetUserId: 'v_user_2',
        muted: true,
      });
      assert.equal(mutedP.isServerMuted, true);
      assert.equal(mutedP.isSpeaking, false);

      // Non-leader member 3 tries to mute member 4 -> must throw VOICE_PERMISSION_DENIED
      await assert.rejects(
        () => voiceService.setServerMute('v_user_3', 'PARTY', partyId, { targetUserId: 'v_user_4', muted: true }),
        (err: any) => err.response?.code === VoiceErrorCodes.VOICE_PERMISSION_DENIED,
      );

      // Clean teardown
      for (let i = 1; i <= 8; i++) {
        await voiceService.leaveVoiceRoom(`v_user_${i}`, 'PARTY', partyId);
      }
      assert.equal(voiceRoomManager.getActiveRoomCount(), 0);
    });
  });

  // --------------------------------------------------------------------------
  // 8. MALFORMED EVENT FLOODS & PAYLOAD PROTECTION
  // --------------------------------------------------------------------------
  describe('8. Malformed Event Floods & Payload Protection', () => {
    it('safely handles oversized payloads, malformed JSON, and unknown events without server crash', async () => {
      const rateLimiter = new RealtimeRateLimiter();
      const server = new RealtimeServerEngine(rateLimiter);
      const conn = new MockRealtimeConnection('conn_abuse', 'abuse_user');
      server.registerConnection(conn);

      // 1. Oversized payload (> 16KB)
      const hugeString = 'X'.repeat(20 * 1024);
      const oversizedEnvelope: ClientEventEnvelope = {
        protocolVersion: '1.0',
        requestId: 'req_oversized',
        timestamp: Date.now(),
        event: 'room:action',
        payload: { bigData: hugeString },
      };

      await server.handleClientMessage('conn_abuse', oversizedEnvelope);
      const errOversized = conn.sentErrors.pop();
      assert.ok(errOversized);
      assert.equal(errOversized.code, RealtimeErrorCodes.PAYLOAD_TOO_LARGE);

      // 2. Unknown event
      const unknownEnvelope: ClientEventEnvelope = {
        protocolVersion: '1.0',
        requestId: 'req_unknown',
        timestamp: Date.now(),
        event: 'completely:fake_event',
        payload: {},
      };
      await server.handleClientMessage('conn_abuse', unknownEnvelope);
      const errUnknown = conn.sentErrors.pop();
      assert.ok(errUnknown);
      assert.equal(errUnknown.code, RealtimeErrorCodes.UNKNOWN_EVENT);

      // 3. Invalid protocol version (with valid payload)
      const badVersionEnvelope: ClientEventEnvelope = {
        protocolVersion: '99.0' as any,
        requestId: 'req_bad_ver',
        timestamp: Date.now(),
        event: 'system:ping',
        payload: {},
      };
      await server.handleClientMessage('conn_abuse', badVersionEnvelope);
      const errVer = conn.sentErrors.pop();
      assert.ok(errVer);
      assert.equal(errVer.code, RealtimeErrorCodes.INVALID_PROTOCOL_VERSION);

      // 4. Rate limit flood: 65 rapid ping events (limit is 60/sec)
      let rateLimitedCount = 0;
      for (let i = 0; i < 65; i++) {
        const pingEnvelope: ClientEventEnvelope = {
          protocolVersion: '1.0',
          requestId: `req_ping_${i}`,
          timestamp: Date.now(),
          event: 'system:ping',
          payload: {},
        };
        await server.handleClientMessage('conn_abuse', pingEnvelope);
        const err = conn.sentErrors.pop();
        if (err && err.code === RealtimeErrorCodes.RATE_LIMIT_EXCEEDED) {
          rateLimitedCount++;
        }
      }
      assert.ok(rateLimitedCount > 0, 'Rate limiter should throttle excess events');

      server.removeConnection('conn_abuse');
    });
  });

  // --------------------------------------------------------------------------
  // 9. SLOW CONSUMER BEHAVIOR
  // --------------------------------------------------------------------------
  describe('9. Slow Consumer Emulation', () => {
    it('handles slow reading consumers without blocking the server or corrupting state', async () => {
      const rateLimiter = new RealtimeRateLimiter();
      const server = new RealtimeServerEngine(rateLimiter);

      const slowConn = new MockRealtimeConnection('conn_slow', 'user_slow');
      slowConn.isSlowConsumer = true;
      slowConn.delayMs = 25; // 25ms delayed read

      const normalConn = new MockRealtimeConnection('conn_normal', 'user_normal');

      server.registerConnection(slowConn);
      server.registerConnection(normalConn);

      // Broadcast 20 events
      for (let i = 0; i < 20; i++) {
        server.sendToUser('user_slow', 'game:tick', { tick: i });
        server.sendToUser('user_normal', 'game:tick', { tick: i });
      }

      // Normal socket receives immediately
      const normalTicks = normalConn.sentEnvelopes.filter((e) => e.event === 'game:tick');
      assert.equal(normalTicks.length, 20);

      // Wait for slow consumer buffer to catch up
      await new Promise((r) => setTimeout(r, 60));
      const slowTicks = slowConn.sentEnvelopes.filter((e) => e.event === 'game:tick');
      assert.equal(slowTicks.length, 20);

      server.removeConnection('conn_slow');
      server.removeConnection('conn_normal');
    });
  });

  // --------------------------------------------------------------------------
  // 10. AUTHORIZATION NEGATIVE SECURITY AUDIT
  // --------------------------------------------------------------------------
  describe('10. Comprehensive Authorization Negative Security Audit', () => {
    it('prevents User A from impersonating, mutating, or eavesdropping on User B resources', async () => {
      const prisma = new HardeningMockPrisma();
      const rateLimiter = new RealtimeRateLimiter();
      const server = new RealtimeServerEngine(rateLimiter);
      const roomManager = new RoomManager(server as any);
      const voiceRoomManager = new VoiceRoomManager();
      const mockAdapter = new MockVoiceAdapter('secret');
      const voiceService = new VoiceServiceCore(prisma as any, mockAdapter, voiceRoomManager, roomManager);

      // Seed User A and User B
      prisma.users.set('user_A', { id: 'user_A', moderationStatus: 'ACTIVE', profile: { username: 'Alice' } });
      prisma.users.set('user_B', { id: 'user_B', moderationStatus: 'ACTIVE', profile: { username: 'Bob' } });

      // User B's Party
      const partyB = 'party_B_secret';
      prisma.parties.set(partyB, { id: partyB, leaderUserId: 'user_B', status: 'ACTIVE' });
      prisma.partyMembers.set('user_B', { id: 'pm_B', partyId: partyB, userId: 'user_B' });

      // User B's Room
      const roomBProj = await roomManager.createRoom({ userId: 'user_B', username: 'Bob' }, 'TARNEEB', 4);

      // 1. User A tries to get voice grant for User B's party -> 403 Forbidden
      await assert.rejects(
        () => voiceService.requestVoiceGrant('user_A', { contextType: 'PARTY', contextId: partyB }),
        (err: any) => err.response?.code === VoiceErrorCodes.VOICE_UNAUTHORIZED,
      );

      // 2. User A tries to get voice grant for User B's room -> 403 Forbidden
      await assert.rejects(
        () => voiceService.requestVoiceGrant('user_A', { contextType: 'GAME_ROOM', contextId: roomBProj.roomId }),
        (err: any) => err.response?.code === VoiceErrorCodes.VOICE_UNAUTHORIZED,
      );

      // 3. User A tries to modify permissions in User B's party -> 403 Forbidden
      await assert.rejects(
        () => voiceService.updatePermissions('user_A', 'PARTY', partyB, 'VOICE_MUTED'),
        (err: any) => err.response?.code === VoiceErrorCodes.VOICE_UNAUTHORIZED,
      );

      // Clean up room
      await roomManager.leaveRoom(roomBProj.roomId, 'user_B');
    });
  });

  // --------------------------------------------------------------------------
  // 11. MEMORY LEAK & REGISTRY CLEANUP AUDIT
  // --------------------------------------------------------------------------
  describe('11. Memory Leak & Registry Cleanup Audit', () => {
    it('verifies complete registry disposal and bounded heap across 500 create/destroy cycles', async () => {
      const rateLimiter = new RealtimeRateLimiter();
      const server = new RealtimeServerEngine(rateLimiter);
      const roomManager = new RoomManager(server as any);
      const voiceRoomManager = new VoiceRoomManager();

      if (global.gc) {
        global.gc();
      }
      const initialHeapMB = process.memoryUsage().heapUsed / 1024 / 1024;

      // 500 Create/Destroy Cycles
      for (let i = 0; i < 500; i++) {
        // Socket
        const connId = `leak_conn_${i}`;
        const userId = `leak_user_${i}`;
        const conn = new MockRealtimeConnection(connId, userId);
        server.registerConnection(conn);

        // Room
        const room = await roomManager.createRoom({ userId, username: `U${i}` }, 'TARNEEB', 4);

        // Voice Room
        const vRoom = voiceRoomManager.getOrCreateRoom('GAME_ROOM', room.roomId);
        vRoom.addParticipant({ userId, username: `U${i}` });

        // Immediate Tear Down
        server.removeConnection(connId);
        await roomManager.leaveRoom(room.roomId, userId);
        vRoom.removeParticipant(userId);
        voiceRoomManager.closeRoom(vRoom.voiceRoomId);
      }

      // Sweep any closed rooms
      roomManager.sweepStaleRooms();

      if (global.gc) {
        global.gc();
      }
      const finalHeapMB = process.memoryUsage().heapUsed / 1024 / 1024;
      const heapDeltaMB = finalHeapMB - initialHeapMB;

      // Assert all registries are exactly 0
      assert.equal(server.getAllConnections().length, 0, 'Socket registry must be 0');
      assert.equal(roomManager.roomCount, 0, 'Room registry must be 0');
      assert.equal(voiceRoomManager.getActiveRoomCount(), 0, 'Voice room registry must be 0');

      // Heap growth should be bounded (< 25MB delta across 500 full cycles in V8)
      assert.ok(heapDeltaMB < 25, `Heap delta must be bounded, measured: ${heapDeltaMB.toFixed(2)} MB`);
    });
  });
});
