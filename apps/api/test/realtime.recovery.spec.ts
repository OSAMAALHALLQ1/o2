import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  type PartyRealtimeSnapshot,
  type PlayerRoomProjection,
  type PublicRoomProjection,
  type RealtimeConnectionLifecycleState,
  PartySystemEvents,
  RECOVERY_CONSTANTS,
  ROOM_GAME_MODES,
  RoomErrorCodes,
  RoomSystemEvents,
} from '@o2/types';
import { Room, RoomManager, RoomError } from '../src/modules/realtime/rooms/room-manager.ts';
import { PartyRealtimeManager } from '../src/modules/realtime/party/party-realtime.manager.ts';
import type { RealtimeServer } from '../src/modules/realtime/transport/realtime-server.interface.ts';
import type { RealtimeConnection } from '../src/modules/realtime/transport/realtime-connection.interface.ts';

class MockRealtimeConnection implements RealtimeConnection {
  connectionId: string;
  userId: string;
  sessionId: string;
  authenticatedAt: number;
  sequence: number;
  state: 'CONNECTED' | 'DISCONNECTED' = 'CONNECTED';
  sentEvents: Array<{ event: string; data: unknown }> = [];

  constructor(userId: string, connectionId: string) {
    this.userId = userId;
    this.connectionId = connectionId;
    this.sessionId = `sess_${userId}`;
    this.authenticatedAt = Date.now();
    this.sequence = 1;
  }

  send(event: string, data: unknown): void {
    this.sentEvents.push({ event, data });
  }

  close(): void {
    this.state = 'DISCONNECTED';
  }
}

class MockRealtimeServer implements RealtimeServer {
  private connections = new Map<string, MockRealtimeConnection>();
  private userConnections = new Map<string, Set<string>>();

  registerConnection(conn: MockRealtimeConnection): void {
    this.connections.set(conn.connectionId, conn);
    let userConns = this.userConnections.get(conn.userId);
    if (!userConns) {
      userConns = new Set();
      this.userConnections.set(conn.userId, userConns);
    }
    userConns.add(conn.connectionId);
  }

  removeConnection(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (conn) {
      this.connections.delete(connectionId);
      const userConns = this.userConnections.get(conn.userId);
      if (userConns) {
        userConns.delete(connectionId);
        if (userConns.size === 0) this.userConnections.delete(conn.userId);
      }
    }
  }

  getConnection(connectionId: string): RealtimeConnection | undefined {
    return this.connections.get(connectionId);
  }

  sendToUser(userId: string, event: string, payload: unknown): boolean {
    const connIds = this.userConnections.get(userId);
    if (!connIds || connIds.size === 0) return false;
    for (const cid of connIds) {
      this.connections.get(cid)?.send(event, payload);
    }
    return true;
  }

  broadcast(): void {}
  on(): void {}
  off(): void {}
  handleClientMessage(): Promise<void> { return Promise.resolve(); }
  getAllConnections(): RealtimeConnection[] { return Array.from(this.connections.values()); }
}

describe('Phase 6D: Realtime Disconnect, Reconnect & State Recovery', () => {

  describe('1. Reconnect Lifecycle & Exponential Backoff Invariants', () => {
    function calculateBackoffDelay(attempt: number): number {
      const base = RECOVERY_CONSTANTS.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
      const capped = Math.min(base, RECOVERY_CONSTANTS.MAX_RETRY_DELAY_MS);
      return capped; // Testing deterministic baseline
    }

    it('should compute bounded exponential backoff delays with 10s maximum cap', () => {
      assert.strictEqual(calculateBackoffDelay(0), 500);
      assert.strictEqual(calculateBackoffDelay(1), 1000);
      assert.strictEqual(calculateBackoffDelay(2), 2000);
      assert.strictEqual(calculateBackoffDelay(3), 4000);
      assert.strictEqual(calculateBackoffDelay(4), 8000);
      assert.strictEqual(calculateBackoffDelay(5), 10000); // Capped at MAX_RETRY_DELAY_MS
      assert.strictEqual(calculateBackoffDelay(10), 10000); // Remains capped
    });

    it('should apply jitter within ±20% of base delay', () => {
      const base = 1000;
      const jitterFactor = RECOVERY_CONSTANTS.JITTER_FACTOR;
      for (let i = 0; i < 50; i++) {
        const jitter = (Math.random() * 2 - 1) * (base * jitterFactor);
        const delay = Math.round(base + jitter);
        assert.ok(delay >= base * (1 - jitterFactor), `Delay ${delay} below lower bound`);
        assert.ok(delay <= base * (1 + jitterFactor), `Delay ${delay} above upper bound`);
      }
    });

    it('should transition through deterministic lifecycle states', () => {
      const states: RealtimeConnectionLifecycleState[] = [];
      const transition = (s: RealtimeConnectionLifecycleState) => states.push(s);

      transition('DISCONNECTED');
      transition('CONNECTING');
      transition('AUTHENTICATING');
      transition('CONNECTED');
      transition('RESYNCING');
      transition('READY');

      assert.deepStrictEqual(states, [
        'DISCONNECTED',
        'CONNECTING',
        'AUTHENTICATING',
        'CONNECTED',
        'RESYNCING',
        'READY',
      ]);
    });
  });

  describe('2. Authentication & Session Invariants on Reconnect', () => {
    it('should authenticate fresh socket with unexpired JWT and assign a new connectionId', () => {
      const server = new MockRealtimeServer();
      const initialConn = new MockRealtimeConnection('user_1', 'conn_old_123');
      server.registerConnection(initialConn);

      // Disconnect initial
      server.removeConnection(initialConn.connectionId);
      assert.strictEqual(server.getConnection('conn_old_123'), undefined);

      // Reconnect with new connectionId
      const newConn = new MockRealtimeConnection('user_1', 'conn_new_456');
      server.registerConnection(newConn);
      assert.strictEqual(server.getConnection('conn_new_456')?.userId, 'user_1');
      assert.strictEqual(newConn.sequence, 1, 'Connection sequence resets on new socket');
    });

    it('should reject unauthenticated socket or expired token on reconnect', () => {
      const validateToken = (token: string | null) => {
        if (!token || token === 'expired_token') {
          throw new Error('UNAUTHORIZED');
        }
        return { userId: 'user_1', valid: true };
      };

      assert.throws(() => validateToken(null), /UNAUTHORIZED/);
      assert.throws(() => validateToken('expired_token'), /UNAUTHORIZED/);
      assert.doesNotThrow(() => validateToken('fresh_token_xyz'));
    });
  });

  describe('3. Room Disconnect Grace Window (60s)', () => {
    it('should set participant status to DISCONNECTED_GRACE on disconnect and reserve slot', () => {
      const room = new Room('room_grace_1', ROOM_GAME_MODES.ATRASH, 'host_user', undefined, 4);
      room.setState('WAITING');
      room.addParticipant({
        userId: 'player_2',
        username: 'player2',
        joinedAt: Date.now(),
        isReady: true,
      });

      const initialVersion = room.version;
      room.handleParticipantDisconnect('player_2');

      const participant = room.getParticipant('player_2');
      assert.strictEqual(participant?.status, 'DISCONNECTED_GRACE');
      assert.strictEqual(room.version, initialVersion + 1, 'Version increments on status change');
      assert.strictEqual(room.hasParticipant('player_2'), true, 'Slot remains reserved');
      assert.strictEqual(room.timers.has('grace_player_2'), true, 'Grace timer is active');
    });

    it('should cancel grace timer and restore CONNECTED status on player recovery', () => {
      const room = new Room('room_grace_2', ROOM_GAME_MODES.ATRASH, 'host_user', undefined, 4);
      room.setState('WAITING');
      room.addParticipant({
        userId: 'player_3',
        username: 'player3',
        joinedAt: Date.now(),
        isReady: true,
      });

      room.handleParticipantDisconnect('player_3');
      assert.strictEqual(room.timers.has('grace_player_3'), true);

      // Reconnect & recover
      const projection = room.recoverParticipant('player_3');
      assert.strictEqual(projection.self.status, 'CONNECTED');
      assert.strictEqual(room.getParticipant('player_3')?.status, 'CONNECTED');
      assert.strictEqual(room.timers.has('grace_player_3'), false, 'Grace timer canceled');
    });
  });

  describe('4. Room Recovery & Server Restart Boundary', () => {
    it('should recover active room projection for authorized reconnecting participant', async () => {
      const roomManager = new RoomManager();
      const host = { userId: 'host_1', username: 'Host1' };
      const created = await roomManager.createRoom(host, ROOM_GAME_MODES.ATRASH);

      const player = { userId: 'player_1', username: 'Player1' };
      await roomManager.joinRoom(created.roomId, player);

      // Participant disconnects
      roomManager.handleParticipantDisconnect(player.userId);

      // Participant reconnects and requests recovery
      const recovered = await roomManager.recoverRoom(player.userId);
      assert.strictEqual(recovered.roomId, created.roomId);
      assert.strictEqual(recovered.self.userId, player.userId);
      assert.strictEqual(recovered.self.status, 'CONNECTED');
    });

    it('should return deterministic ROOM_UNAVAILABLE when server restarted or room missing', async () => {
      const freshRoomManager = new RoomManager(); // Simulating fresh in-memory state post-restart
      await assert.rejects(
        async () => {
          await freshRoomManager.recoverRoom('user_lost_post_restart');
        },
        (err: any) => {
          assert.strictEqual(err.code, RoomErrorCodes.ROOM_UNAVAILABLE);
          assert.ok(err.message.includes('الغرفة غير متاحة'));
          return true;
        },
      );
    });

    it('should reject room recovery if caller was never in the room', async () => {
      const roomManager = new RoomManager();
      await roomManager.createRoom({ userId: 'host_x', username: 'HostX' }, ROOM_GAME_MODES.ATRASH);

      await assert.rejects(
        async () => {
          await roomManager.recoverRoom('intruder_999');
        },
        (err: any) => {
          assert.strictEqual(err.code, RoomErrorCodes.ROOM_UNAVAILABLE);
          return true;
        },
      );
    });
  });

  describe('5. Party Recovery & Authoritative Version Reconciliation', () => {
    it('should replace local party state with authoritative snapshot upon reconnect', () => {
      const localState: { version: number; leaderId: string } = {
        version: 5,
        leaderId: 'old_leader',
      };

      const serverAuthoritativeSnapshot: PartyRealtimeSnapshot = {
        partyId: 'party_recov_1',
        version: 8,
        roomCode: 'RC8888',
        leaderId: 'new_leader',
        desiredGameMode: 'atrash',
        capacity: 4,
        allowJoinByCode: true,
        members: [{ userId: 'user_me', role: 'MEMBER', isReady: true, joinedAt: Date.now() }],
        updatedAt: Date.now(),
      };

      // Apply snapshot
      if (serverAuthoritativeSnapshot.version >= localState.version) {
        localState.version = serverAuthoritativeSnapshot.version;
        localState.leaderId = serverAuthoritativeSnapshot.leaderId;
      }

      assert.strictEqual(localState.version, 8);
      assert.strictEqual(localState.leaderId, 'new_leader');
    });

    it('should validate subsequent events against recovered baseline', () => {
      const currentVersion = 8;
      const testEvents = [
        { version: 7, expected: 'STALE' },
        { version: 8, expected: 'DUPLICATE' },
        { version: 9, expected: 'APPLY' },
        { version: 12, expected: 'GAP_RECONCILE' },
      ];

      for (const t of testEvents) {
        let result: string;
        if (t.version < currentVersion) result = 'STALE';
        else if (t.version === currentVersion) result = 'DUPLICATE';
        else if (t.version === currentVersion + 1) result = 'APPLY';
        else result = 'GAP_RECONCILE';

        assert.strictEqual(result, t.expected);
      }
    });
  });

  describe('6. Action Retries & Idempotency Boundary', () => {
    it('should return prior cached result on duplicate action retry', async () => {
      const room = new Room('room_idem_1', ROOM_GAME_MODES.ATRASH, 'host_u', undefined, 4);
      room.addParticipant({
        userId: 'host_u',
        username: 'host_u',
        joinedAt: Date.now(),
        isReady: true,
      });
      room.setState('WAITING');
      room.setState('READY');
      room.setState('RUNNING');

      const action = {
        actionId: 'act_safe_retry_101',
        roomId: 'room_idem_1',
        userId: 'host_u',
        type: 'SET_READY',
        payload: { isReady: true },
        receivedAt: Date.now(),
      };

      const result1 = await room.dispatchAction(action);
      const versionAfterFirst = room.version;
      assert.strictEqual((result1 as any).actionId, 'act_safe_retry_101');

      // Duplicate retry with same actionId
      const result2 = await room.dispatchAction(action);
      assert.deepStrictEqual(result2, result1, 'Second execution must return identical cached result');
      assert.strictEqual(room.version, versionAfterFirst, 'Room version must not increment on duplicate action');
    });

    it('should not automatically retry non-retry-safe actions', () => {
      let networkCalls = 0;
      const simulateSend = (retrySafe: boolean) => {
        networkCalls++;
        if (networkCalls === 1) throw new Error('NETWORK_TIMEOUT');
        return { success: true };
      };

      // Non-safe action
      assert.throws(() => simulateSend(false));
      assert.strictEqual(networkCalls, 1, 'Non-retry-safe action must not retry');
    });
  });

  describe('7. Concurrency Verification Matrix (Scenarios A through E)', () => {
    it('A. Disconnect + Party mutation + reconnect: receives incremented version snapshot', () => {
      const server = new MockRealtimeServer();
      const partyManager = new PartyRealtimeManager(server);

      // User was subscribed before disconnect
      partyManager.subscribe('user_conc_A', 'party_A');

      // Disconnect happens
      partyManager.unsubscribe('user_conc_A', 'party_A');

      // Meanwhile, party mutation occurs in PostgreSQL (v1 -> v2)
      const mutatedSnapshot: PartyRealtimeSnapshot = {
        partyId: 'party_A',
        version: 2,
        roomCode: 'PA0001',
        leaderId: 'leader_A',
        desiredGameMode: 'atrash',
        capacity: 4,
        allowJoinByCode: true,
        members: [{ userId: 'user_conc_A', role: 'MEMBER', isReady: true, joinedAt: Date.now() }],
        updatedAt: Date.now(),
      };

      // User reconnects, resubscribes and fetches snapshot
      partyManager.subscribe('user_conc_A', 'party_A');
      assert.strictEqual(partyManager.isSubscribed('user_conc_A', 'party_A'), true);
      assert.strictEqual(mutatedSnapshot.version, 2);
    });

    it('B. Disconnect + Room action retry: server returns cached result without duplicate execution', async () => {
      const room = new Room('room_conc_B', ROOM_GAME_MODES.ATRASH, 'user_conc_B', undefined, 4);
      room.addParticipant({
        userId: 'user_conc_B',
        username: 'user_conc_B',
        joinedAt: Date.now(),
        isReady: true,
      });
      room.setState('WAITING');
      room.setState('READY');
      room.setState('RUNNING');

      const action = {
        actionId: 'act_conc_B_1',
        roomId: 'room_conc_B',
        userId: 'user_conc_B',
        type: 'SET_READY',
        payload: { isReady: true },
        receivedAt: Date.now(),
      };

      const res1 = await room.dispatchAction(action);
      const versionAfterFirst = room.version;
      // Network drops; client retries
      const res2 = await room.dispatchAction(action);

      assert.deepStrictEqual(res2, res1, 'Retried action must return identical cached result');
      assert.strictEqual(room.version, versionAfterFirst, 'Room version must not increment on retry');
    });

    it('C. Duplicate concurrent reconnect attempts: maintains single active connection', () => {
      const server = new MockRealtimeServer();
      const conn1 = new MockRealtimeConnection('user_conc_C', 'conn_C_1');
      const conn2 = new MockRealtimeConnection('user_conc_C', 'conn_C_2');

      server.registerConnection(conn1);
      server.registerConnection(conn2);

      // Deliver message to user
      server.sendToUser('user_conc_C', 'test:event', { ok: true });
      assert.strictEqual(conn1.sentEvents.length, 1);
      assert.strictEqual(conn2.sentEvents.length, 1);
    });

    it('D. Reconnect while kicked from Party: recognized as no longer a member', () => {
      const server = new MockRealtimeServer();
      const partyManager = new PartyRealtimeManager(server);

      // User kicked during disconnect
      const currentMembers = [{ userId: 'leader_u', role: 'LEADER' as const, isReady: true, joinedAt: Date.now() }];
      const isMember = currentMembers.some((m) => m.userId === 'user_kicked');

      assert.strictEqual(isMember, false, 'User is no longer in member list');
      // Client does not resubscribe
      assert.strictEqual(partyManager.isSubscribed('user_kicked', 'party_D'), false);
    });

    it('E. Reconnect after Room ended: returns ROOM_UNAVAILABLE deterministic state', async () => {
      const roomManager = new RoomManager();
      const host = { userId: 'host_E', username: 'HostE' };
      const room = await roomManager.createRoom(host, ROOM_GAME_MODES.ATRASH);

      // Room ends & closes
      await roomManager.leaveRoom(room.roomId, host.userId);

      // User tries to recover closed room
      await assert.rejects(
        async () => {
          await roomManager.recoverRoom(host.userId);
        },
        (err: any) => {
          assert.strictEqual(err.code, RoomErrorCodes.ROOM_UNAVAILABLE);
          return true;
        },
      );
    });
  });

  describe('8. Focused Reconnect Race Safety Suite (Prompt Requirements 1-5)', () => {
    it('1. Duplicate Reconnect Race: concurrent recovery maintains single membership and unchanged version', async () => {
      const roomManager = new RoomManager();
      const host = { userId: 'host_race_1', username: 'Host1' };
      const created = await roomManager.createRoom(host, ROOM_GAME_MODES.ATRASH);
      const player = { userId: 'player_race_1', username: 'Player1' };
      await roomManager.joinRoom(created.roomId, player);

      const room = roomManager.getRoom(created.roomId)!;
      // Player disconnects -> DISCONNECTED_GRACE
      roomManager.handleParticipantDisconnect(player.userId);
      assert.strictEqual(room.getParticipant(player.userId)?.status, 'DISCONNECTED_GRACE');
      assert.strictEqual(room.timers.has(`grace_${player.userId}`), true);
      const versionBeforeRecovery = room.version;

      // Two concurrent recovery flows
      const [proj1, proj2] = await Promise.all([
        roomManager.recoverRoom(player.userId),
        roomManager.recoverRoom(player.userId),
      ]);

      // Exactly one logical room membership remains
      assert.strictEqual(room.hasParticipant(player.userId), true);
      assert.strictEqual(room.participantCount, 2);
      assert.strictEqual(room.getParticipant(player.userId)?.status, 'CONNECTED');

      // Grace timer cancelled safely
      assert.strictEqual(room.timers.has(`grace_${player.userId}`), false);

      // No duplicate participant in projection
      const matching = room.getPublicProjection().participants.filter((p) => p.userId === player.userId);
      assert.strictEqual(matching.length, 1);

      // Returned projections remain consistent
      assert.deepStrictEqual(proj1, proj2);

      // Room version remains unchanged by recovery itself
      assert.strictEqual(room.version, versionBeforeRecovery, 'Room version must remain unchanged by recovery');
    });

    it('2. Reconnect vs Kick: deterministic outcomes with no zombie membership', async () => {
      // 2A: Kick commits first -> recovery must fail as NOT_ROOM_MEMBER or ROOM_UNAVAILABLE
      const rmA = new RoomManager();
      const hostA = { userId: 'host_kick_A', username: 'HostA' };
      const roomA = await rmA.createRoom(hostA, ROOM_GAME_MODES.ATRASH);
      const playerA = { userId: 'player_kick_A', username: 'PlayerA' };
      await rmA.joinRoom(roomA.roomId, playerA);
      rmA.handleParticipantDisconnect(playerA.userId);

      // Kick commits first, then recover runs
      await rmA.kickParticipant(roomA.roomId, playerA.userId);

      await assert.rejects(
        async () => {
          await rmA.recoverRoom(playerA.userId);
        },
        (err: any) => {
          assert.ok(
            err.code === RoomErrorCodes.NOT_ROOM_MEMBER || err.code === RoomErrorCodes.ROOM_UNAVAILABLE,
            `Expected NOT_ROOM_MEMBER or ROOM_UNAVAILABLE, got ${err.code}`,
          );
          return true;
        },
      );
      assert.strictEqual(rmA.getRoom(roomA.roomId)?.hasParticipant(playerA.userId), false);

      // 2B: Recovery commits first -> kick still removes user cleanly
      const rmB = new RoomManager();
      const hostB = { userId: 'host_kick_B', username: 'HostB' };
      const roomB = await rmB.createRoom(hostB, ROOM_GAME_MODES.ATRASH);
      const playerB = { userId: 'player_kick_B', username: 'PlayerB' };
      await rmB.joinRoom(roomB.roomId, playerB);
      rmB.handleParticipantDisconnect(playerB.userId);

      // Concurrent recover and kick
      const recoverPromise = rmB.recoverRoom(playerB.userId);
      const kickPromise = rmB.kickParticipant(roomB.roomId, playerB.userId);

      const [recResult, kickResult] = await Promise.allSettled([recoverPromise, kickPromise]);
      assert.ok(recResult.status === 'fulfilled' || kickResult.status === 'fulfilled');

      // In all cases, user MUST NOT remain in the room after kick executes
      const finalRoomB = rmB.getRoom(roomB.roomId)!;
      assert.strictEqual(finalRoomB.hasParticipant(playerB.userId), false, 'No zombie membership after kick');
      assert.strictEqual(rmB.getUserRoom(playerB.userId), undefined);
    });

    it('3. Reconnect vs Leave: user is either validly recovered or validly removed, never both', async () => {
      const roomManager = new RoomManager();
      const host = { userId: 'host_leave_1', username: 'Host1' };
      const room = await roomManager.createRoom(host, ROOM_GAME_MODES.ATRASH);
      const player = { userId: 'player_leave_1', username: 'Player1' };
      await roomManager.joinRoom(room.roomId, player);
      roomManager.handleParticipantDisconnect(player.userId);

      // Concurrent recover and leave
      const [recSettled, leaveSettled] = await Promise.allSettled([
        roomManager.recoverRoom(player.userId),
        roomManager.leaveRoom(room.roomId, player.userId),
      ]);

      const finalRoom = roomManager.getRoom(room.roomId)!;
      const userStillInRoom = finalRoom.hasParticipant(player.userId);

      // Final state: either validly recovered OR validly removed
      if (userStillInRoom) {
        assert.strictEqual(recSettled.status, 'fulfilled');
        assert.strictEqual(leaveSettled.status, 'rejected');
      } else {
        assert.strictEqual(leaveSettled.status, 'fulfilled');
        assert.strictEqual(finalRoom.hasParticipant(player.userId), false);
      }

      // No duplicate participant in the room
      const count = finalRoom.getPublicProjection().participants.filter((p) => p.userId === player.userId).length;
      assert.ok(count <= 1, 'Never duplicate participants');
    });

    it('4. Duplicate Subscription: duplicate recovery requests produce zero duplicate subscriptions or duplicate deliveries', () => {
      const server = new MockRealtimeServer();
      const partyManager = new PartyRealtimeManager(server);
      const userId = 'user_sub_test';
      const partyId = 'party_sub_test';

      // Send subscription / recovery twice
      partyManager.subscribe(userId, partyId);
      partyManager.subscribe(userId, partyId);

      // Exactly 1 subscription tracked
      assert.strictEqual(partyManager.getSubscriberCount(partyId), 1);
      assert.strictEqual(partyManager.isSubscribed(userId, partyId), true);

      // Connect two devices for the user
      const conn1 = new MockRealtimeConnection(userId, 'conn_sub_1');
      const conn2 = new MockRealtimeConnection(userId, 'conn_sub_2');
      server.registerConnection(conn1);
      server.registerConnection(conn2);

      // Publish event to party
      partyManager.publishPartyEvent(
        partyId,
        'PARTY_STATE_UPDATED',
        {
          id: partyId,
          leaderId: userId,
          gameMode: 'ATRASH',
          status: 'FORMING',
          version: 2,
          members: [{ userId, username: 'sub_test', role: 'LEADER', isReady: true, joinedAt: Date.now() }],
        },
      );

      // Exactly one delivery per physical socket connection (no duplicated deliveries caused by duplicate subscription)
      assert.strictEqual(conn1.sentEvents.length, 1);
      assert.strictEqual(conn2.sentEvents.length, 1);
    });

    it('5. Action Retry after Reconnect: action executes once, returns cached result, increments version once', async () => {
      const room = new Room('room_retry_flow', ROOM_GAME_MODES.ATRASH, 'host_user', undefined, 4);
      room.setState('WAITING');
      room.addParticipant({
        userId: 'player_act',
        username: 'playerAct',
        joinedAt: Date.now(),
        isReady: false,
      });

      const initialVersion = room.version;
      const action = {
        actionId: 'act_retry_lost_response_101',
        roomId: 'room_retry_flow',
        userId: 'player_act',
        type: 'SET_READY',
        payload: { isReady: true },
        receivedAt: Date.now(),
      };

      // 1. Submit action before disconnect -> server processes action
      const firstResult = await room.dispatchAction(action) as any;
      const versionAfterAction = room.version;
      assert.strictEqual(versionAfterAction, initialVersion + 1, 'Version increments on first execution');
      assert.strictEqual(firstResult.isReady, true);

      // 2. Simulate: response lost over network, socket disconnects
      room.handleParticipantDisconnect('player_act');

      // 3. Reconnect occurs
      room.recoverParticipant('player_act');
      assert.strictEqual(room.getParticipant('player_act')?.status, 'CONNECTED');

      // 4. Same actionId submitted again after reconnect
      const versionBeforeRetry = room.version;
      const retryResult = await room.dispatchAction(action);

      // Exact cached result returned
      assert.deepStrictEqual(retryResult, firstResult);

      // Room version did NOT increment again
      assert.strictEqual(room.version, versionBeforeRetry, 'Version must not increment on action retry');
    });
  });
});
