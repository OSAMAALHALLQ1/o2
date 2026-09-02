import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  type PlayerRoomProjection,
  type PublicRoomProjection,
  AtrashActionTypes,
  AtrashErrorCodes,
  AtrashSystemEvents,
  RoomErrorCodes,
  RoomSystemEvents,
} from '@o2/types';
import {
  Room,
  RoomError,
  RoomManager,
} from '../src/modules/realtime/rooms/room-manager.ts';
import { AtrashRoomAdapter } from '../src/modules/realtime/rooms/atrash/atrash-room.adapter.ts';
import type { RealtimeServer } from '../src/modules/realtime/transport/realtime-server.interface.ts';
import type { RealtimeConnection } from '../src/modules/realtime/transport/realtime-connection.interface.ts';

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

function createFiveParticipants() {
  return [
    { userId: 'u_p1', username: 'player_1', displayName: 'أنَس' },
    { userId: 'u_p2', username: 'player_2', displayName: 'كريم' },
    { userId: 'u_p3', username: 'player_3', displayName: 'نور' },
    { userId: 'u_p4', username: 'player_4', displayName: 'سلمى' },
    { userId: 'u_p5', username: 'player_5', displayName: 'طارق' },
  ];
}

function createAtrashManager(server: RealtimeServer): RoomManager {
  const manager = new RoomManager(server);
  manager.registerAdapterFactory('ATRASH', (roomId, srv) => new AtrashRoomAdapter(roomId, srv));
  return manager;
}

describe('Phase 7: Atrash Bel Zaffeh — Realtime Room & Integration Suite', () => {

  describe('1. 5-Player Match Room Creation & Initialization', () => {
    it('creates a 5-player ATRASH match room and initializes game engine', async () => {
      const server = new MockRealtimeServer();
      const manager = createAtrashManager(server);
      const players = createFiveParticipants();

      const { room, projection } = await manager.createMatchRoom('ATRASH', players);

      assert.equal(room.gameMode, 'ATRASH');
      assert.equal(room.capacity, 5);
      assert.equal(room.participantCount, 5);
      assert.equal(room.state, 'RUNNING');
      assert.ok(room.engineAdapter instanceof AtrashRoomAdapter);

      const adapter = room.engineAdapter as AtrashRoomAdapter;
      const engine = adapter.getEngine();
      assert.equal(engine.internalState.phase, 'QUESTION_PHASE');
      assert.equal(engine.internalState.roundNumber, 1);
      assert.ok(engine.internalState.atrashUserId);
    });

    it('isolates public vs private projection across realtime boundaries', async () => {
      const server = new MockRealtimeServer();
      const manager = createAtrashManager(server);
      const players = createFiveParticipants();

      const { room } = await manager.createMatchRoom('ATRASH', players);
      const adapter = room.engineAdapter as AtrashRoomAdapter;
      const atrashUserId = adapter.getEngine().internalState.atrashUserId!;
      const informedUserId = players.find((p) => p.userId !== atrashUserId)!.userId;

      // 1. Public Projection has NO secret word
      const publicProj = room.getPublicProjection();
      const publicJson = JSON.stringify(publicProj);
      const secret = adapter.getEngine().internalState.secretItem!.word;
      assert.ok(!publicJson.includes(secret), 'Secret word must NEVER be in public projection');

      // 2. Atrash player projection has NO secret word
      const atrashProj = room.getPlayerProjection(atrashUserId);
      const atrashData = atrashProj.playerData as any;
      assert.equal(atrashData.role, 'ATRASH');
      assert.equal(atrashData.isAtrash, true);
      assert.equal(atrashData.secretWord, undefined, 'Atrash must NEVER receive the secret word');

      // 3. Informed player projection DOES have secret word
      const informedProj = room.getPlayerProjection(informedUserId);
      const informedData = informedProj.playerData as any;
      assert.equal(informedData.role, 'INFORMED');
      assert.equal(informedData.isAtrash, false);
      assert.equal(informedData.secretWord, secret);
    });
  });

  describe('2. Authoritative Q&A Actions & Authorization', () => {
    it('processes authoritative turn sequence and rejects out-of-turn actions', async () => {
      const server = new MockRealtimeServer();
      const manager = createAtrashManager(server);
      const players = createFiveParticipants();
      const { room } = await manager.createMatchRoom('ATRASH', players);
      const adapter = room.engineAdapter as AtrashRoomAdapter;
      const engine = adapter.getEngine();

      const askerId = engine.internalState.currentAskerId!;
      const answererId = engine.internalState.currentAnswererId!;
      const bystanderId = players.find((p) => p.userId !== askerId && p.userId !== answererId)!.userId;

      // Bystander tries to ask -> Rejected
      await assert.rejects(
        () =>
          manager.dispatchAction(room.roomId, {
            actionId: randomUUID(),
            roomId: room.roomId,
            userId: bystanderId,
            type: AtrashActionTypes.SUBMIT_QUESTION,
            payload: { questionText: 'هل الكلمة مأكولة؟' },
            receivedAt: Date.now(),
          }),
        (err: any) => err.message.includes('ليس دورك'),
      );

      // Legitimate asker submits question -> Accepted
      await manager.dispatchAction(room.roomId, {
        actionId: randomUUID(),
        roomId: room.roomId,
        userId: askerId,
        type: AtrashActionTypes.SUBMIT_QUESTION,
        payload: { questionText: 'هل الكلمة مأكولة؟' },
        receivedAt: Date.now(),
      });

      assert.equal(engine.internalState.turnStage, 'ANSWERING');

      // Legitimate answerer submits answer -> Accepted
      await manager.dispatchAction(room.roomId, {
        actionId: randomUUID(),
        roomId: room.roomId,
        userId: answererId,
        type: AtrashActionTypes.SUBMIT_ANSWER,
        payload: { answerText: 'نعم تؤكل بالملعقة' },
        receivedAt: Date.now(),
      });

      assert.equal(engine.internalState.currentTurnIndex, 1);
    });

    it('rejects action from non-member user', async () => {
      const server = new MockRealtimeServer();
      const manager = createAtrashManager(server);
      const players = createFiveParticipants();
      const { room } = await manager.createMatchRoom('ATRASH', players);

      await assert.rejects(
        () =>
          manager.dispatchAction(room.roomId, {
            actionId: randomUUID(),
            roomId: room.roomId,
            userId: 'intruder_x',
            type: AtrashActionTypes.SUBMIT_QUESTION,
            payload: { questionText: 'سؤال غير مصرح به' },
            receivedAt: Date.now(),
          }),
        (err: any) => err instanceof RoomError && err.code === RoomErrorCodes.NOT_ROOM_MEMBER,
      );
    });
  });

  describe('3. Voting, Tie Handling & Last Chance Flow', () => {
    it('executes full voting, reveal, and last chance resolution', async () => {
      const server = new MockRealtimeServer();
      const manager = createAtrashManager(server);
      const players = createFiveParticipants();
      const { room } = await manager.createMatchRoom('ATRASH', players);
      const adapter = room.engineAdapter as AtrashRoomAdapter;
      const engine = adapter.getEngine();

      const atrashId = engine.internalState.atrashUserId!;
      const informedPlayers = players.filter((p) => p.userId !== atrashId);

      // Advance directly to VOTING
      engine.internalState.phase = 'DISCUSSION_PHASE';
      engine.advanceFromDiscussionToVoting();

      // All 4 informed players vote for Atrash
      for (const inf of informedPlayers) {
        await manager.dispatchAction(room.roomId, {
          actionId: randomUUID(),
          roomId: room.roomId,
          userId: inf.userId,
          type: AtrashActionTypes.CAST_VOTE,
          payload: { targetUserId: atrashId },
          receivedAt: Date.now(),
        });
      }

      // Atrash votes for informed[0]
      await manager.dispatchAction(room.roomId, {
        actionId: randomUUID(),
        roomId: room.roomId,
        userId: atrashId,
        type: AtrashActionTypes.CAST_VOTE,
        payload: { targetUserId: informedPlayers[0].userId },
        receivedAt: Date.now(),
      });

      // Voting is complete and resolved: Atrash detected -> VOTE_REVEAL
      assert.equal(engine.internalState.phase, 'VOTE_REVEAL');
      assert.equal(engine.internalState.voteRevealData?.highestVotedUserId, atrashId);
      assert.equal(engine.internalState.voteRevealData?.atrashDetected, true);

      // Start Last Chance
      const { options } = engine.startLastChance();
      assert.equal(options.length, 4);
      assert.equal(engine.internalState.phase, 'ATRASH_LAST_CHANCE');

      // Atrash guesses correctly
      const secret = engine.internalState.secretItem!.word;
      await manager.dispatchAction(room.roomId, {
        actionId: randomUUID(),
        roomId: room.roomId,
        userId: atrashId,
        type: AtrashActionTypes.SUBMIT_LAST_CHANCE,
        payload: { selectedWord: secret },
        receivedAt: Date.now(),
      });

      assert.equal(engine.internalState.phase, 'ROUND_RESULT');
      const roundRes = engine.internalState.roundResultData!;
      assert.equal(roundRes.atrashDetected, true);
      assert.equal(roundRes.lastChanceSuccess, true);
      assert.equal(roundRes.scoreDeltas[atrashId], 1); // +1 point for correct guess
    });
  });

  describe('4. Concurrency & Race Condition Hardening', () => {
    it('race: two concurrent actions for the same turn (strictly one succeeds)', async () => {
      const server = new MockRealtimeServer();
      const manager = createAtrashManager(server);
      const players = createFiveParticipants();
      const { room } = await manager.createMatchRoom('ATRASH', players);
      const adapter = room.engineAdapter as AtrashRoomAdapter;
      const askerId = adapter.getEngine().internalState.currentAskerId!;

      const action1 = {
        actionId: 'action_race_1',
        roomId: room.roomId,
        userId: askerId,
        type: AtrashActionTypes.SUBMIT_QUESTION,
        payload: { questionText: 'السؤال الأول من السباق؟' },
        receivedAt: Date.now(),
      };

      const action2 = {
        actionId: 'action_race_2',
        roomId: room.roomId,
        userId: askerId,
        type: AtrashActionTypes.SUBMIT_QUESTION,
        payload: { questionText: 'السؤال الثاني من السباق؟' },
        receivedAt: Date.now(),
      };

      // Execute both concurrently through room sequential executor
      const results = await Promise.allSettled([
        manager.dispatchAction(room.roomId, action1),
        manager.dispatchAction(room.roomId, action2),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.equal(fulfilled.length, 1, 'Exactly one concurrent action must succeed');
      assert.equal(rejected.length, 1, 'The competing action must be rejected');
    });

    it('race: two concurrent votes from the same player (strictly one succeeds)', async () => {
      const server = new MockRealtimeServer();
      const manager = createAtrashManager(server);
      const players = createFiveParticipants();
      const { room } = await manager.createMatchRoom('ATRASH', players);
      const adapter = room.engineAdapter as AtrashRoomAdapter;
      const engine = adapter.getEngine();

      engine.internalState.phase = 'DISCUSSION_PHASE';
      engine.advanceFromDiscussionToVoting();

      const voterId = 'u_p1';

      const vote1 = {
        actionId: 'vote_race_1',
        roomId: room.roomId,
        userId: voterId,
        type: AtrashActionTypes.CAST_VOTE,
        payload: { targetUserId: 'u_p2' },
        receivedAt: Date.now(),
      };

      const vote2 = {
        actionId: 'vote_race_2',
        roomId: room.roomId,
        userId: voterId,
        type: AtrashActionTypes.CAST_VOTE,
        payload: { targetUserId: 'u_p3' },
        receivedAt: Date.now(),
      };

      const results = await Promise.allSettled([
        manager.dispatchAction(room.roomId, vote1),
        manager.dispatchAction(room.roomId, vote2),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.equal(fulfilled.length, 1);
      assert.equal(rejected.length, 1);
      assert.equal(engine.internalState.votes.size, 1);
      assert.equal(engine.internalState.votes.get(voterId)?.targetUserId, 'u_p2');
    });

    it('idempotency: duplicate submission with same actionId returns cached response', async () => {
      const server = new MockRealtimeServer();
      const manager = createAtrashManager(server);
      const players = createFiveParticipants();
      const { room } = await manager.createMatchRoom('ATRASH', players);
      const adapter = room.engineAdapter as AtrashRoomAdapter;
      const askerId = adapter.getEngine().internalState.currentAskerId!;

      const action = {
        actionId: 'idempotent_action_101',
        roomId: room.roomId,
        userId: askerId,
        type: AtrashActionTypes.SUBMIT_QUESTION,
        payload: { questionText: 'سؤال يتم إرساله مرتين بالشبكة؟' },
        receivedAt: Date.now(),
      };

      const res1 = await manager.dispatchAction(room.roomId, action);
      const res2 = await manager.dispatchAction(room.roomId, action);

      assert.deepEqual(res1, res2);
      assert.equal(adapter.getEngine().internalState.turnStage, 'ANSWERING');
    });

    it('reconnect recovery: disconnected player recovers and receives masked state without leaking secret', async () => {
      const server = new MockRealtimeServer();
      const manager = createAtrashManager(server);
      const players = createFiveParticipants();
      const { room } = await manager.createMatchRoom('ATRASH', players);
      const adapter = room.engineAdapter as AtrashRoomAdapter;
      const atrashUserId = adapter.getEngine().internalState.atrashUserId!;

      // Simulate network drop
      manager.handleParticipantDisconnect(atrashUserId);
      assert.equal(room.getParticipant(atrashUserId)?.status, 'DISCONNECTED_GRACE');
      assert.equal(adapter.getEngine().internalState.participants.find((p) => p.userId === atrashUserId)?.isConnected, false);

      // Reconnect and recover
      const recovered = await manager.recoverRoom(atrashUserId);
      assert.equal(recovered.self.status, 'CONNECTED');
      const pData = recovered.playerData as any;
      assert.equal(pData.role, 'ATRASH');
      assert.equal(pData.secretWord, undefined, 'Reconnecting Atrash must never see the secret word');
    });

    it('race E & F: vote arriving after voting timer expiry is rejected', async () => {
      const server = new MockRealtimeServer();
      const manager = createAtrashManager(server);
      const players = createFiveParticipants();
      const { room } = await manager.createMatchRoom('ATRASH', players);
      const adapter = room.engineAdapter as AtrashRoomAdapter;
      const engine = adapter.getEngine();

      engine.internalState.phase = 'DISCUSSION_PHASE';
      engine.advanceFromDiscussionToVoting();

      // Simulate timer expired
      engine.internalState.votingDeadline = Date.now() - 1000;

      await assert.rejects(
        () =>
          manager.dispatchAction(room.roomId, {
            actionId: 'expired_vote_1',
            roomId: room.roomId,
            userId: 'u_p1',
            type: AtrashActionTypes.CAST_VOTE,
            payload: { targetUserId: 'u_p2' },
            receivedAt: Date.now(),
          }),
        (err: any) => err.message.includes('انتهى وقت التصويت'),
      );
    });

    it('race G & H: disconnect and reconnect during voting does not clear existing vote or leak secrets', async () => {
      const server = new MockRealtimeServer();
      const manager = createAtrashManager(server);
      const players = createFiveParticipants();
      const { room } = await manager.createMatchRoom('ATRASH', players);
      const adapter = room.engineAdapter as AtrashRoomAdapter;
      const engine = adapter.getEngine();

      engine.internalState.phase = 'DISCUSSION_PHASE';
      engine.advanceFromDiscussionToVoting();

      // Player 1 casts vote
      await manager.dispatchAction(room.roomId, {
        actionId: 'vote_p1',
        roomId: room.roomId,
        userId: 'u_p1',
        type: AtrashActionTypes.CAST_VOTE,
        payload: { targetUserId: 'u_p2' },
        receivedAt: Date.now(),
      });
      assert.equal(engine.internalState.votes.size, 1);

      // Player 1 disconnects
      manager.handleParticipantDisconnect('u_p1');
      assert.equal(room.getParticipant('u_p1')?.status, 'DISCONNECTED_GRACE');

      // Player 1 reconnects during voting
      const rec = await manager.recoverRoom('u_p1');
      assert.equal(rec.self.status, 'CONNECTED');
      // Vote remains recorded
      assert.equal(engine.internalState.votes.size, 1);
      assert.equal(engine.internalState.votes.get('u_p1')?.targetUserId, 'u_p2');
    });

    it('race I, J & L: disconnect during last chance and duplicate last-chance race (exactly one wins)', async () => {
      const server = new MockRealtimeServer();
      const manager = createAtrashManager(server);
      const players = createFiveParticipants();
      const { room } = await manager.createMatchRoom('ATRASH', players);
      const adapter = room.engineAdapter as AtrashRoomAdapter;
      const engine = adapter.getEngine();
      const atrashId = engine.internalState.atrashUserId!;

      engine.internalState.phase = 'VOTE_REVEAL';
      engine.internalState.voteRevealData = {
        highestVotedUserId: atrashId,
        voteCounts: { [atrashId]: 4 },
        atrashDetected: true,
        isTie: false,
        tiedUserIds: [],
        isRevote: false,
        revealedAt: Date.now(),
      };
      engine.startLastChance();
      assert.equal(engine.internalState.phase, 'ATRASH_LAST_CHANCE');

      // Disconnect and reconnect
      manager.handleParticipantDisconnect(atrashId);
      const rec = await manager.recoverRoom(atrashId);
      assert.equal(rec.self.status, 'CONNECTED');
      assert.equal(engine.internalState.phase, 'ATRASH_LAST_CHANCE');

      // Concurrent duplicate last-chance submissions
      const secret = engine.internalState.secretItem!.word;
      const results = await Promise.allSettled([
        manager.dispatchAction(room.roomId, {
          actionId: 'lc_action_1',
          roomId: room.roomId,
          userId: atrashId,
          type: AtrashActionTypes.SUBMIT_LAST_CHANCE,
          payload: { selectedWord: secret },
          receivedAt: Date.now(),
        }),
        manager.dispatchAction(room.roomId, {
          actionId: 'lc_action_2',
          roomId: room.roomId,
          userId: atrashId,
          type: AtrashActionTypes.SUBMIT_LAST_CHANCE,
          payload: { selectedWord: 'كلمة_أخرى' },
          receivedAt: Date.now(),
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      assert.equal(fulfilled.length, 1, 'Exactly one last-chance submission must win');
      assert.equal(rejected.length, 1, 'Competing submission must be rejected');
      assert.equal(engine.internalState.phase, 'ROUND_RESULT');
    });
  });

  describe('5. Game Security Boundaries & Anti-Cheat Invariants', () => {
    it('client cannot choose or alter role, score, or timer', async () => {
      const server = new MockRealtimeServer();
      const manager = createAtrashManager(server);
      const players = createFiveParticipants();
      const { room } = await manager.createMatchRoom('ATRASH', players);
      const adapter = room.engineAdapter as AtrashRoomAdapter;
      const engine = adapter.getEngine();

      const initialScores = { ...engine.internalState.scores };
      const initialRoles = { ...engine.internalState.roles };

      // Attacker sends malformed action trying to inject score or role changes
      await assert.rejects(
        () =>
          manager.dispatchAction(room.roomId, {
            actionId: 'hack_attempt_1',
            roomId: room.roomId,
            userId: 'u_p1',
            type: 'ALTER_SCORE' as any,
            payload: { scores: { u_p1: 100 }, roles: { u_p1: 'INFORMED' } },
            receivedAt: Date.now(),
          }),
      );

      // State is unaltered
      assert.deepEqual(engine.internalState.scores, initialScores);
      assert.deepEqual(engine.internalState.roles, initialRoles);
    });

    it('client cannot vote for self', async () => {
      const server = new MockRealtimeServer();
      const manager = createAtrashManager(server);
      const players = createFiveParticipants();
      const { room } = await manager.createMatchRoom('ATRASH', players);
      const adapter = room.engineAdapter as AtrashRoomAdapter;
      const engine = adapter.getEngine();

      engine.internalState.phase = 'DISCUSSION_PHASE';
      engine.advanceFromDiscussionToVoting();

      await assert.rejects(
        () =>
          manager.dispatchAction(room.roomId, {
            actionId: 'self_vote',
            roomId: room.roomId,
            userId: 'u_p1',
            type: AtrashActionTypes.CAST_VOTE,
            payload: { targetUserId: 'u_p1' },
            receivedAt: Date.now(),
          }),
        (err: any) => err.message.includes('لا يمكنك التصويت لنفسك'),
      );
    });

    it('errors and projections never contain the secret word', async () => {
      const server = new MockRealtimeServer();
      const manager = createAtrashManager(server);
      const players = createFiveParticipants();
      const { room } = await manager.createMatchRoom('ATRASH', players);
      const adapter = room.engineAdapter as AtrashRoomAdapter;
      const secret = adapter.getEngine().internalState.secretItem!.word;

      try {
        await manager.dispatchAction(room.roomId, {
          actionId: 'err_test',
          roomId: room.roomId,
          userId: 'u_p1',
          type: AtrashActionTypes.SUBMIT_QUESTION,
          payload: { questionText: 'ق' }, // too short
          receivedAt: Date.now(),
        });
      } catch (err: any) {
        assert.ok(!err.message.includes(secret), 'Error message must not leak secret');
      }

      const publicStr = JSON.stringify(room.getPublicProjection());
      assert.ok(!publicStr.includes(secret), 'Public projection must not leak secret');
    });
  });

  describe('6. Reconnect Audit across All Authoritative Phases', () => {
    it('reconnects cleanly from each phase with zero state leak', async () => {
      const server = new MockRealtimeServer();
      const manager = createAtrashManager(server);
      const players = createFiveParticipants();
      const { room } = await manager.createMatchRoom('ATRASH', players);
      const adapter = room.engineAdapter as AtrashRoomAdapter;
      const engine = adapter.getEngine();
      const atrashId = engine.internalState.atrashUserId!;

      const phases = ['QUESTION_PHASE', 'DISCUSSION_PHASE', 'VOTING', 'VOTE_REVEAL'] as const;

      for (const ph of phases) {
        engine.internalState.phase = ph as any;
        manager.handleParticipantDisconnect(atrashId);
        const rec = await manager.recoverRoom(atrashId);
        assert.equal(rec.self.status, 'CONNECTED');
        const pData = rec.playerData as any;
        assert.equal(pData.isAtrash, true);
        assert.equal(pData.secretWord, undefined, `Secret must NOT leak during reconnect in phase ${ph}`);
      }
    });
  });
});
