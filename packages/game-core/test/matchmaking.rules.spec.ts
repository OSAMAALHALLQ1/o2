import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertValidMatchmakingTransition,
  findExactCapacityGroup,
  getMatchmakingCapacity,
  InvalidMatchmakingStateTransitionError,
  isPartySizeCompatible,
  isValidGameMode,
  isValidMatchmakingTransition,
} from '../dist/index.js';

describe('Phase 6E: Pure Matchmaking Rules & Invariants', () => {
  describe('1. Matchmaking Lifecycle State Machine', () => {
    it('allows valid state transitions', () => {
      // Self transitions
      assert.equal(isValidMatchmakingTransition('QUEUED', 'QUEUED'), true);
      assert.equal(isValidMatchmakingTransition('MATCHING', 'MATCHING'), true);

      // Normal path: QUEUED -> MATCHING -> MATCHED
      assert.equal(isValidMatchmakingTransition('QUEUED', 'MATCHING'), true);
      assert.equal(isValidMatchmakingTransition('MATCHING', 'MATCHED'), true);

      // Cancellation and expiry from QUEUED
      assert.equal(isValidMatchmakingTransition('QUEUED', 'CANCELLED'), true);
      assert.equal(isValidMatchmakingTransition('QUEUED', 'EXPIRED'), true);
      assert.equal(isValidMatchmakingTransition('QUEUED', 'FAILED'), true);

      // Rollback to QUEUED or FAILED from MATCHING
      assert.equal(isValidMatchmakingTransition('MATCHING', 'QUEUED'), true);
      assert.equal(isValidMatchmakingTransition('MATCHING', 'FAILED'), true);

      assert.doesNotThrow(() => assertValidMatchmakingTransition('QUEUED', 'MATCHING'));
      assert.doesNotThrow(() => assertValidMatchmakingTransition('MATCHING', 'MATCHED'));
    });

    it('rejects invalid state transitions with InvalidMatchmakingStateTransitionError', () => {
      // Cannot skip MATCHING step
      assert.equal(isValidMatchmakingTransition('QUEUED', 'MATCHED'), false);
      // Terminal states cannot transition anywhere
      assert.equal(isValidMatchmakingTransition('MATCHED', 'QUEUED'), false);
      assert.equal(isValidMatchmakingTransition('MATCHED', 'MATCHING'), false);
      assert.equal(isValidMatchmakingTransition('CANCELLED', 'QUEUED'), false);
      assert.equal(isValidMatchmakingTransition('EXPIRED', 'QUEUED'), false);
      assert.equal(isValidMatchmakingTransition('FAILED', 'QUEUED'), false);
      // Cannot cancel once already MATCHING
      assert.equal(isValidMatchmakingTransition('MATCHING', 'CANCELLED'), false);

      assert.throws(
        () => assertValidMatchmakingTransition('QUEUED', 'MATCHED'),
        InvalidMatchmakingStateTransitionError,
      );
      assert.throws(
        () => assertValidMatchmakingTransition('MATCHED', 'QUEUED'),
        InvalidMatchmakingStateTransitionError,
      );
    });
  });

  describe('2. Exact Game Capacities & Party Size Compatibility', () => {
    it('validates supported game modes', () => {
      assert.equal(isValidGameMode('ATRASH'), true);
      assert.equal(isValidGameMode('MAFIA_CLASSIC'), true);
      assert.equal(isValidGameMode('TARNEEB'), true);
      assert.equal(isValidGameMode('HIDE_AND_SEEK'), true);
      assert.equal(isValidGameMode('O2_IMPOSTER'), true);
      assert.equal(isValidGameMode('INVALID_GAME'), false);
      assert.equal(isValidGameMode(''), false);
    });

    it('enforces exact configured game capacities', () => {
      assert.equal(getMatchmakingCapacity('ATRASH'), 5);
      assert.equal(getMatchmakingCapacity('MAFIA_CLASSIC'), 14);
      assert.equal(getMatchmakingCapacity('TARNEEB'), 4);
      assert.equal(getMatchmakingCapacity('HIDE_AND_SEEK'), 8);
      assert.equal(getMatchmakingCapacity('O2_IMPOSTER'), 8);
    });

    it('evaluates party size compatibility', () => {
      // Tarneeb (4)
      assert.equal(isPartySizeCompatible('TARNEEB', 1), true);
      assert.equal(isPartySizeCompatible('TARNEEB', 4), true);
      assert.equal(isPartySizeCompatible('TARNEEB', 5), false);

      // Atrash (5)
      assert.equal(isPartySizeCompatible('ATRASH', 2), true);
      assert.equal(isPartySizeCompatible('ATRASH', 5), true);
      assert.equal(isPartySizeCompatible('ATRASH', 6), false);

      // Zero or negative
      assert.equal(isPartySizeCompatible('ATRASH', 0), false);
      assert.equal(isPartySizeCompatible('ATRASH', -1), false);
    });
  });

  describe('3. Deterministic FIFO Exact-Capacity Ticket Grouping', () => {
    it('matches solo players to exact capacity in arrival order', () => {
      const tickets = [
        { id: 't1', memberCount: 1, createdAt: 100 },
        { id: 't2', memberCount: 1, createdAt: 200 },
        { id: 't3', memberCount: 1, createdAt: 300 },
        { id: 't4', memberCount: 1, createdAt: 400 },
        { id: 't5', memberCount: 1, createdAt: 500 },
      ];

      // Tarneeb capacity 4: should pick earliest 4: t1, t2, t3, t4
      const result = findExactCapacityGroup(tickets, 4);
      assert.ok(result);
      assert.equal(result.length, 4);
      assert.deepEqual(result.map((t) => t.id), ['t1', 't2', 't3', 't4']);
    });

    it('combines party and solo players to exact capacity', () => {
      const tickets = [
        { id: 't_party_2', memberCount: 2, createdAt: 100 },
        { id: 't_solo_1', memberCount: 1, createdAt: 200 },
        { id: 't_party_2b', memberCount: 2, createdAt: 300 },
      ];

      // Atrash capacity 5: 2 + 1 + 2 = 5
      const result = findExactCapacityGroup(tickets, 5);
      assert.ok(result);
      assert.equal(result.length, 3);
      assert.deepEqual(result.map((t) => t.id), ['t_party_2', 't_solo_1', 't_party_2b']);
    });

    it('NEVER splits a party to fit a remaining slot', () => {
      const tickets = [
        { id: 't_party_3', memberCount: 3, createdAt: 100 },
        { id: 't_party_3b', memberCount: 3, createdAt: 200 }, // 3 + 3 = 6 > 5
      ];

      // Atrash capacity 5: cannot fit 3 + 3 without splitting
      const result = findExactCapacityGroup(tickets, 5);
      assert.equal(result, null);
    });

    it('picks subsequent compatible tickets if head cannot complete immediately', () => {
      const tickets = [
        { id: 't_party_3', memberCount: 3, createdAt: 100 },
        { id: 't_party_3b', memberCount: 3, createdAt: 200 },
        { id: 't_party_2', memberCount: 2, createdAt: 300 }, // 3 + 2 = 5!
      ];

      // Tarneeb capacity 5: t_party_3 (3) + t_party_2 (2) = 5
      const result = findExactCapacityGroup(tickets, 5);
      assert.ok(result);
      assert.deepEqual(result.map((t) => t.id), ['t_party_3', 't_party_2']);
    });

    it('returns null when insufficient players to reach exact capacity', () => {
      const tickets = [
        { id: 't1', memberCount: 1, createdAt: 100 },
        { id: 't2', memberCount: 1, createdAt: 200 },
        { id: 't3', memberCount: 1, createdAt: 300 },
      ];

      // Tarneeb capacity 4: 3 players available -> null (never underfill!)
      assert.equal(findExactCapacityGroup(tickets, 4), null);
    });
  });
});
