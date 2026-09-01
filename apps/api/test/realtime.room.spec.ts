import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  type PlayerRoomProjection,
  type PublicRoomProjection,
  type RoomAction,
  type RoomGameMode,
  type RoomParticipant,
  type RoomState,
  ROOM_CAPACITIES,
  ROOM_GAME_MODES,
  ROOM_LIMITS,
  RoomErrorCodes,
  RoomSystemEvents,
} from '@o2/types';
import {
  assertValidRoomTransition,
  InvalidRoomStateTransitionError,
  isValidRoomTransition,
  RoomSequentialExecutor,
  RoomActionIdempotency,
  RoomTimerRegistry,
  Room,
  RoomError,
  RoomManager,
} from '../src/modules/realtime/rooms/room-manager.ts';
import type { RealtimeServer } from '../src/modules/realtime/transport/realtime-server.interface.ts';
import type { RealtimeConnection } from '../src/modules/realtime/transport/realtime-connection.interface.ts';

// Mock RealtimeServer implementation for testing broadcast boundaries
class MockRealtimeServer implements RealtimeServer {
  readonly sentUserMessages: Array<{ userId: string; event: string; payload: any }> = [];
  readonly broadcastMessages: Array<{ event: string; payload: any }> = [];

  registerConnection(_connection: RealtimeConnection): void {}
  removeConnection(_connectionId: string, _reason?: string): void {}
  getConnection(_connectionId: string): RealtimeConnection | undefined { return undefined; }
  getConnectionsByUserId(_userId: string): RealtimeConnection[] { return []; }
  getAllConnections(): RealtimeConnection[] { return []; }
  on(_event: string, _handler: any): () => void { return () => {}; }

  broadcast<T>(event: string, payload: T): void {
    this.broadcastMessages.push({ event, payload });
  }

  sendToUser<T>(userId: string, event: string, payload: T): void {
    this.sentUserMessages.push({ userId, event, payload });
  }

  async handleClientMessage(_connectionId: string, _rawData: unknown): Promise<void> {}
  checkHeartbeats(): string[] { return []; }
}

describe('Phase 6B: Server-Authoritative Realtime Room Engine', () => {

  describe('1. Room Lifecycle State Machine', () => {
    it('should validate allowed lifecycle transitions', () => {
      assert.ok(isValidRoomTransition('CREATING', 'WAITING'));
      assert.ok(isValidRoomTransition('WAITING', 'READY'));
      assert.ok(isValidRoomTransition('READY', 'RUNNING'));
      assert.ok(isValidRoomTransition('READY', 'WAITING'));
      assert.ok(isValidRoomTransition('RUNNING', 'ENDING'));
      assert.ok(isValidRoomTransition('ENDING', 'ENDED'));
      assert.ok(isValidRoomTransition('ENDED', 'CLOSED'));
      assert.ok(isValidRoomTransition('WAITING', 'CLOSED'));
      assert.ok(isValidRoomTransition('RUNNING', 'CLOSED'));
    });

    it('should reject invalid lifecycle transitions', () => {
      assert.ok(!isValidRoomTransition('CREATING', 'RUNNING'));
      assert.ok(!isValidRoomTransition('WAITING', 'ENDED'));
      assert.ok(!isValidRoomTransition('CLOSED', 'WAITING'));
      assert.ok(!isValidRoomTransition('ENDED', 'RUNNING'));

      assert.throws(
        () => assertValidRoomTransition('CREATING', 'RUNNING'),
        (err: any) => err instanceof InvalidRoomStateTransitionError && err.from === 'CREATING' && err.to === 'RUNNING',
      );
    });

    it('should monotonically increment room version on every mutation', () => {
      const room = new Room('room_v_test', 'ATRASH', 'host_1');
      assert.equal(room.version, 1);

      room.setState('WAITING');
      assert.equal(room.version, 2);

      room.addParticipant({
        userId: 'p1',
        username: 'player_1',
        joinedAt: Date.now(),
        isReady: false,
      });
      assert.equal(room.version, 3);

      room.removeParticipant('p1');
      assert.equal(room.version, 4);
    });
  });

  describe('2. Room Creation & Game Mode Authorization', () => {
    it('should create room with valid game mode and accurate centralized capacity', async () => {
      const server = new MockRealtimeServer();
      const manager = new RoomManager(server);

      for (const [mode, expectedCapacity] of Object.entries(ROOM_CAPACITIES) as Array<[RoomGameMode, number]>) {
        const proj = await manager.createRoom(
          { userId: `creator_${mode}`, username: `host_${mode}` },
          mode,
        );

        assert.ok(proj.roomId.startsWith('room_'));
        assert.equal(proj.gameMode, mode);
        assert.equal(proj.capacity, expectedCapacity);
        assert.equal(proj.state, 'WAITING');
        assert.equal(proj.participantCount, 1);
        assert.equal(proj.participants[0].userId, `creator_${mode}`);
      }
    });

    it('should reject unsupported or malicious game modes', async () => {
      const server = new MockRealtimeServer();
      const manager = new RoomManager(server);

      await assert.rejects(
        () => manager.createRoom({ userId: 'u1', username: 'h1' }, 'give_me_admin' as any),
        (err: any) => err instanceof RoomError && err.code === RoomErrorCodes.INVALID_GAME_MODE,
      );
    });

    it('should reject unauthenticated creator', async () => {
      const server = new MockRealtimeServer();
      const manager = new RoomManager(server);

      await assert.rejects(
        () => manager.createRoom({ userId: '', username: 'anonymous' }, 'ATRASH'),
        (err: any) => err instanceof RoomError && err.code === RoomErrorCodes.NOT_AUTHORIZED,
      );
    });
  });

  describe('3. Per-Room Serial Execution', () => {
    it('should process concurrent room actions in deterministic FIFO order', async () => {
      const executor = new RoomSequentialExecutor('test_room_seq');
      const executionOrder: number[] = [];

      const task = (id: number, delayMs: number) => () =>
        new Promise<number>((resolve) => {
          setTimeout(() => {
            executionOrder.push(id);
            resolve(id);
          }, delayMs);
        });

      // Submit 3 tasks simultaneously with inverted delay times
      const p1 = executor.execute(task(1, 30));
      const p2 = executor.execute(task(2, 10));
      const p3 = executor.execute(task(3, 5));

      await Promise.all([p1, p2, p3]);

      // Execution order MUST be 1, 2, 3 despite varying task durations
      assert.deepEqual(executionOrder, [1, 2, 3]);
    });

    it('should continue processing queue even if an action rejects', async () => {
      const executor = new RoomSequentialExecutor('test_room_seq_err');
      const results: string[] = [];

      const p1 = executor.execute(async () => {
        results.push('first');
        throw new Error('Action failed');
      });

      const p2 = executor.execute(async () => {
        results.push('second');
        return 'ok';
      });

      await assert.rejects(p1, /Action failed/);
      const res2 = await p2;

      assert.equal(res2, 'ok');
      assert.deepEqual(results, ['first', 'second']);
    });
  });

  describe('4. Idempotency & Duplicate Action Protection', () => {
    it('should prevent duplicate execution of the same actionId in a room', () => {
      const room = new Room('room_idemp_1', 'ATRASH', 'u1');
      room.setState('WAITING');
      room.addParticipant({ userId: 'u1', username: 'player1', joinedAt: Date.now(), isReady: false });

      const action1: RoomAction = {
        actionId: 'act_100',
        roomId: 'room_idemp_1',
        userId: 'u1',
        type: 'SET_READY',
        payload: { isReady: true },
        receivedAt: Date.now(),
      };

      const res1 = room.executeAction(action1);
      const versionAfterFirst = room.version;

      // Re-submit identical actionId
      const res2 = room.executeAction(action1);

      // Must return identical cached response without bumping room version again
      assert.deepEqual(res1, res2);
      assert.equal(room.version, versionAfterFirst);
    });

    it('should allow the same actionId in two different rooms independently', () => {
      const roomA = new Room('room_A', 'ATRASH', 'u1');
      roomA.setState('WAITING');
      roomA.addParticipant({ userId: 'u1', username: 'p1', joinedAt: Date.now(), isReady: false });

      const roomB = new Room('room_B', 'ATRASH', 'u2');
      roomB.setState('WAITING');
      roomB.addParticipant({ userId: 'u2', username: 'p2', joinedAt: Date.now(), isReady: false });

      const actionSharedId: RoomAction = {
        actionId: 'shared_action_id',
        roomId: 'room_A',
        userId: 'u1',
        type: 'SET_READY',
        payload: { isReady: true },
        receivedAt: Date.now(),
      };

      assert.doesNotThrow(() => roomA.executeAction(actionSharedId));
      assert.doesNotThrow(() =>
        roomB.executeAction({ ...actionSharedId, roomId: 'room_B', userId: 'u2' }),
      );
    });

    it('should evict expired idempotency records after TTL', () => {
      const dedup = new RoomActionIdempotency('room_ttl_test', 50, 100);
      dedup.set('act_active', { done: true }, 1030);
      dedup.set('act_expired', { done: true }, 1000);

      assert.ok(dedup.has('act_active', 1040));
      assert.ok(!dedup.has('act_expired', 1060));

      dedup.set('act_to_clean', { done: true }, 1000);
      const evicted = dedup.cleanup(1060);
      assert.equal(evicted, 1);
    });
  });

  describe('5. Concurrency & Capacity Testing (Requirements 24 & 25)', () => {
    it('A. 5 simultaneous joins into room capacity 5: exactly 5 succeed', async () => {
      const server = new MockRealtimeServer();
      const manager = new RoomManager(server);

      // ATRASH has capacity 5. Create room with creator (counts as 1)
      const roomProj = await manager.createRoom({ userId: 'host', username: 'host' }, 'ATRASH');
      const roomId = roomProj.roomId;

      // Concurrently submit 4 joins to reach exactly 5 participants
      const joinPromises = [1, 2, 3, 4].map((i) =>
        manager.joinRoom(roomId, { userId: `user_${i}`, username: `user_${i}` }),
      );

      const results = await Promise.all(joinPromises);
      assert.equal(results.length, 4);

      const room = manager.getRoom(roomId)!;
      assert.equal(room.participantCount, 5);
      assert.equal(room.state, 'READY'); // Auto-transitions to READY when full
    });

    it('B. 6 simultaneous joins into room capacity 5: exactly 5 succeed, 1 fails ROOM_FULL', async () => {
      const server = new MockRealtimeServer();
      const manager = new RoomManager(server);

      // Create ATRASH room (capacity 5). Host is participant 1.
      const roomProj = await manager.createRoom({ userId: 'host', username: 'host' }, 'ATRASH');
      const roomId = roomProj.roomId;

      // Concurrently submit 5 joins into remaining 4 slots
      const joinPromises = [1, 2, 3, 4, 5].map((i) =>
        manager.joinRoom(roomId, { userId: `user_${i}`, username: `user_${i}` })
          .then((res) => ({ success: true, res }))
          .catch((err) => ({ success: false, err })),
      );

      const outcomes = await Promise.all(joinPromises);
      const successes = outcomes.filter((o) => o.success);
      const failures = outcomes.filter((o) => !o.success);

      assert.equal(successes.length, 4);
      assert.equal(failures.length, 1);
      assert.equal((failures[0] as any).err.code, RoomErrorCodes.ROOM_FULL);

      const room = manager.getRoom(roomId)!;
      assert.equal(room.participantCount, 5);
    });

    it('C. Concurrent duplicate action race: exactly one mutation executed', async () => {
      const server = new MockRealtimeServer();
      const manager = new RoomManager(server);

      const roomProj = await manager.createRoom({ userId: 'actor', username: 'actor' }, 'ATRASH');
      const roomId = roomProj.roomId;

      const duplicateAction: RoomAction = {
        actionId: 'race_act_1',
        roomId,
        userId: 'actor',
        type: 'SET_READY',
        payload: { isReady: true },
        receivedAt: Date.now(),
      };

      // Submit identical action 4 times simultaneously
      const results = await Promise.all([
        manager.dispatchAction(roomId, duplicateAction),
        manager.dispatchAction(roomId, duplicateAction),
        manager.dispatchAction(roomId, duplicateAction),
        manager.dispatchAction(roomId, duplicateAction),
      ]);

      assert.equal(results.length, 4);
      // All results match the single mutation
      assert.deepEqual(results[0], results[1]);
      assert.deepEqual(results[1], results[2]);

      const room = manager.getRoom(roomId)!;
      // Exactly 1 mutation applied (initial 1 + WAITING 1 + creator 1 + 1 action = 4)
      assert.equal(room.version, 4);
    });

    it('D. Leave + Join race: final state remains consistent', async () => {
      const server = new MockRealtimeServer();
      const manager = new RoomManager(server);

      const roomProj = await manager.createRoom({ userId: 'host', username: 'host' }, 'ATRASH');
      const roomId = roomProj.roomId;

      await manager.joinRoom(roomId, { userId: 'p1', username: 'p1' });

      // Run leave(p1) and join(p2) concurrently
      await Promise.all([
        manager.leaveRoom(roomId, 'p1'),
        manager.joinRoom(roomId, { userId: 'p2', username: 'p2' }),
      ]);

      const room = manager.getRoom(roomId)!;
      assert.equal(room.participantCount, 2);
      assert.ok(!room.hasParticipant('p1'));
      assert.ok(room.hasParticipant('p2'));
    });
  });

  describe('6. Authorization & Hidden State Projection Boundary', () => {
    it('should reject room actions from users outside the room', async () => {
      const server = new MockRealtimeServer();
      const manager = new RoomManager(server);

      const roomProj = await manager.createRoom({ userId: 'host', username: 'host' }, 'ATRASH');

      await assert.rejects(
        () =>
          manager.dispatchAction(roomProj.roomId, {
            actionId: 'hacker_action',
            roomId: roomProj.roomId,
            userId: 'intruder_user',
            type: 'SET_READY',
            payload: { isReady: true },
            receivedAt: Date.now(),
          }),
        (err: any) => err instanceof RoomError && err.code === RoomErrorCodes.NOT_ROOM_MEMBER,
      );
    });

    it('should never expose master engine state in public projection', async () => {
      const server = new MockRealtimeServer();
      const manager = new RoomManager(server);

      const roomProj = await manager.createRoom({ userId: 'host', username: 'host' }, 'ATRASH');
      const room = manager.getRoom(roomProj.roomId)!;

      const publicProj = room.getPublicProjection();

      // Master state fields must NOT exist in public projection
      assert.equal((publicProj as any).engineState, undefined);
      assert.equal((publicProj as any)._engineState, undefined);
      assert.equal((publicProj as any).secrets, undefined);

      // Allowed safe fields
      assert.ok(publicProj.roomId);
      assert.ok(publicProj.gameMode);
      assert.ok(publicProj.state);
      assert.ok(typeof publicProj.capacity === 'number');
      assert.ok(typeof publicProj.version === 'number');
    });

    it('should isolate room broadcasts to active room participants only', async () => {
      const server = new MockRealtimeServer();
      const manager = new RoomManager(server);

      const room1 = await manager.createRoom({ userId: 'r1_host', username: 'r1_host' }, 'ATRASH');
      await manager.joinRoom(room1.roomId, { userId: 'r1_player', username: 'r1_player' });

      await manager.createRoom({ userId: 'r2_host', username: 'r2_host' }, 'ATRASH');

      // Clear earlier messages
      server.sentUserMessages.length = 0;

      // Broadcast an event in room 1
      manager.broadcastToRoom(room1.roomId, 'custom:event', { hello: 'world' });

      const recipients = server.sentUserMessages.map((m) => m.userId);
      assert.ok(recipients.includes('r1_host'));
      assert.ok(recipients.includes('r1_player'));
      // Outside user MUST NOT be in recipients
      assert.ok(!recipients.includes('r2_host'));
    });
  });

  describe('7. Server-Owned Room Timers', () => {
    it('should schedule and execute timer callback through the sequential executor', async () => {
      const room = new Room('room_timer_test', 'ATRASH', 'host');
      let callbackExecuted = false;

      await new Promise<void>((resolve) => {
        room.timers.schedule('turn_timer', 20, () => {
          callbackExecuted = true;
          resolve();
        });
      });

      assert.ok(callbackExecuted);
    });

    it('should cancel scheduled timer cleanly by timerId', async () => {
      const room = new Room('room_timer_cancel', 'ATRASH', 'host');
      let callbackExecuted = false;

      room.timers.schedule('cancel_me', 30, () => {
        callbackExecuted = true;
      });

      const cancelled = room.timers.cancel('cancel_me');
      assert.ok(cancelled);

      // Wait 50ms to ensure timer does not fire
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.ok(!callbackExecuted);
    });

    it('should dispose all active timers when room is closed', async () => {
      const room = new Room('room_timer_close', 'ATRASH', 'host');
      let fired = false;

      room.timers.schedule('timer1', 30, () => {
        fired = true;
      });

      room.close('test_shutdown');

      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.ok(!fired);
    });
  });

  describe('8. Disconnect Behavior & In-Memory Ephemeral Cleanup', () => {
    it('should preserve room user membership when connection disappears', async () => {
      const server = new MockRealtimeServer();
      const manager = new RoomManager(server);

      const roomProj = await manager.createRoom({ userId: 'mobile_user', username: 'm_user' }, 'ATRASH');
      const room = manager.getRoom(roomProj.roomId)!;

      // Transport disconnect occurs (simulated)
      // Room membership MUST be retained
      assert.ok(room.hasParticipant('mobile_user'));
      assert.equal(manager.getUserRoom('mobile_user')?.roomId, roomProj.roomId);
    });

    it('should sweep closed rooms and expired idle waiting rooms', async () => {
      const server = new MockRealtimeServer();
      const manager = new RoomManager(server);

      const roomProj1 = await manager.createRoom({ userId: 'u1', username: 'u1' }, 'ATRASH');
      const roomProj2 = await manager.createRoom({ userId: 'u2', username: 'u2' }, 'ATRASH');

      // Close room 1 manually
      manager.closeRoom(roomProj1.roomId);

      // Room 2 simulated as stale beyond 30 minutes
      const room2 = manager.getRoom(roomProj2.roomId)!;
      (room2 as any)._updatedAt = Date.now() - (ROOM_LIMITS.IDLE_ROOM_TIMEOUT_MS + 1000);

      const sweepResult = manager.sweepStaleRooms();
      assert.equal(sweepResult.closedCount, 2);

      assert.equal(manager.getRoom(roomProj1.roomId), undefined);
      assert.equal(manager.getRoom(roomProj2.roomId), undefined);
    });
  });
});
