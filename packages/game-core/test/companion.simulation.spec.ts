import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEffectiveCareState,
  applyCareAction,
  deriveCompanionExpression,
} from '../dist/index.js';
import type { RawCareState } from '../dist/index.js';

describe('Phase 3: Companion Deterministic Simulation Engine', () => {
  const BASE_TIME = new Date('2026-08-27T12:00:00.000Z').getTime();

  const createInitialState = (overrides?: Partial<RawCareState>): RawCareState => ({
    hunger: 80.0,
    cleanliness: 80.0,
    energy: 80.0,
    mood: 80.0,
    isSleeping: false,
    sleepStartedAt: null,
    lastSimulatedAt: new Date(BASE_TIME).toISOString(),
    lastInteractionAt: new Date(BASE_TIME).toISOString(),
    ...overrides,
  });

  describe('1. Time-Based Passive Decay Curve', () => {
    it('should calculate accurate decay after 1 hour of awake time', () => {
      const state = createInitialState();
      const after1Hour = BASE_TIME + 3600000;
      const effective = calculateEffectiveCareState(state, after1Hour);

      // Hunger: 80 - (1 * 3.0) = 77.0
      assert.equal(effective.hunger, 77.0);
      // Cleanliness: 80 - (1 * 2.0) = 78.0
      assert.equal(effective.cleanliness, 78.0);
      // Energy: 80 - (1 * 2.5) = 77.5
      assert.equal(effective.energy, 77.5);
      // Mood: 80 - (1 * 2.0) = 78.0
      assert.equal(effective.mood, 78.0);
      assert.equal(effective.isSleeping, false);
    });

    it('should calculate accurate decay after 8 hours of awake time', () => {
      const state = createInitialState();
      const after8Hours = BASE_TIME + 8 * 3600000;
      const effective = calculateEffectiveCareState(state, after8Hours);

      // Hunger: 80 - (8 * 3) = 56.0
      assert.equal(effective.hunger, 56.0);
      // Cleanliness: 80 - (8 * 2) = 64.0
      assert.equal(effective.cleanliness, 64.0);
      // Energy: 80 - (8 * 2.5) = 60.0
      assert.equal(effective.energy, 60.0);
      // Mood: 80 - (8 * 2) = 64.0
      assert.equal(effective.mood, 64.0);
    });

    it('should calculate accurate decay after 24 hours of awake time', () => {
      const state = createInitialState();
      const after24Hours = BASE_TIME + 24 * 3600000;
      const effective = calculateEffectiveCareState(state, after24Hours);

      // Hunger: 80 - (24 * 3) = 8 -> clamped to floor 20.0
      assert.equal(effective.hunger, 20.0);
      // Cleanliness: 80 - (24 * 2) = 32.0
      assert.equal(effective.cleanliness, 32.0);
      // Energy: 80 - (24 * 2.5) = 20.0
      assert.equal(effective.energy, 20.0);
      // Mood: 80 - (24 * 2) = 32.0
      assert.equal(effective.mood, 32.0);
    });
  });

  describe('2. Inactivity Protection & Non-Catastrophic Floor', () => {
    it('should protect player returning after 3 days (72h) by capping decay at 48 hours and floor at 20', () => {
      const state = createInitialState({ hunger: 100, cleanliness: 100, energy: 100, mood: 100 });
      const after3Days = BASE_TIME + 72 * 3600000;
      const effective = calculateEffectiveCareState(state, after3Days);

      assert.ok(effective.hunger >= 20.0, 'Hunger must not drop below non-catastrophic floor');
      assert.ok(effective.cleanliness >= 20.0, 'Cleanliness must not drop below non-catastrophic floor');
      assert.ok(effective.energy >= 20.0, 'Energy must not drop below non-catastrophic floor');
      assert.ok(effective.mood >= 20.0, 'Mood must not drop below non-catastrophic floor');
      assert.equal(effective.hunger, 20.0);
      assert.equal(effective.cleanliness, 20.0);
      assert.equal(effective.energy, 20.0);
      assert.equal(effective.mood, 20.0);
    });

    it('should produce identical capped state whether player returns after 3 days or 7 days', () => {
      const state = createInitialState();
      const after3Days = BASE_TIME + 72 * 3600000;
      const after7Days = BASE_TIME + 168 * 3600000;

      const res3 = calculateEffectiveCareState(state, after3Days);
      const res7 = calculateEffectiveCareState(state, after7Days);

      assert.deepEqual(res3.hunger, res7.hunger);
      assert.deepEqual(res3.cleanliness, res7.cleanliness);
      assert.deepEqual(res3.energy, res7.energy);
      assert.deepEqual(res3.mood, res7.mood);
    });
  });

  describe('3. Sleep Simulation & Energy Recovery', () => {
    it('should recover energy and halve other stat decay rates while sleeping', () => {
      const state = createInitialState({
        energy: 20.0,
        hunger: 80.0,
        cleanliness: 80.0,
        mood: 80.0,
        isSleeping: true,
        sleepStartedAt: new Date(BASE_TIME).toISOString(),
      });

      const after4Hours = BASE_TIME + 4 * 3600000;
      const effective = calculateEffectiveCareState(state, after4Hours);

      // Energy recovery: 20 + (4 * 12.5) = 70.0
      assert.equal(effective.energy, 70.0);
      // Hunger decay at half rate: 80 - (4 * 1.5) = 74.0
      assert.equal(effective.hunger, 74.0);
      // Cleanliness decay at half rate: 80 - (4 * 1.0) = 76.0
      assert.equal(effective.cleanliness, 76.0);
      // Mood decay at half rate: 80 - (4 * 1.0) = 76.0
      assert.equal(effective.mood, 76.0);
      assert.equal(effective.expression, 'SLEEPING');
    });

    it('should accurately calculate sleep recovery duration based on starting energy', () => {
      // 1. From 20 (floor) to 100: takes exactly 6.4 hours ((100 - 20) / 12.5 = 6.4)
      const floorState = createInitialState({
        energy: 20.0,
        isSleeping: true,
        sleepStartedAt: new Date(BASE_TIME).toISOString(),
      });
      const after6Point4Hours = BASE_TIME + 6.4 * 3600000;
      const effectiveFloor = calculateEffectiveCareState(floorState, after6Point4Hours);
      assert.equal(effectiveFloor.energy, 100.0);

      // 2. From 80 (default) to 100: takes exactly 1.6 hours ((100 - 80) / 12.5 = 1.6)
      const defaultState = createInitialState({
        energy: 80.0,
        isSleeping: true,
        sleepStartedAt: new Date(BASE_TIME).toISOString(),
      });
      const after1Point6Hours = BASE_TIME + 1.6 * 3600000;
      const effectiveDefault = calculateEffectiveCareState(defaultState, after1Point6Hours);
      assert.equal(effectiveDefault.energy, 100.0);
    });
  });

  describe('4. Care Actions & Constraints', () => {
    it('should apply FEED action and clamp hunger to 100', () => {
      const state = createInitialState({ hunger: 85.0, mood: 70.0 });
      const result = applyCareAction(state, 'FEED', BASE_TIME);

      assert.equal(result.reaction, 'FED');
      assert.equal(result.updatedState.hunger, 100.0);
      assert.equal(result.updatedState.mood, 75.0);
      assert.equal(result.statDeltas.hunger, 25.0);
    });

    it('should apply CLEAN action and improve cleanliness', () => {
      const state = createInitialState({ cleanliness: 50.0, mood: 60.0 });
      const result = applyCareAction(state, 'CLEAN', BASE_TIME);

      assert.equal(result.reaction, 'BATHED');
      assert.equal(result.updatedState.cleanliness, 85.0);
      assert.equal(result.updatedState.mood, 65.0);
    });

    it('should apply PLAY action consuming 15 energy and raising mood', () => {
      const state = createInitialState({ mood: 50.0, energy: 60.0 });
      const result = applyCareAction(state, 'PLAY', BASE_TIME);

      assert.equal(result.reaction, 'PLAYED');
      assert.equal(result.updatedState.mood, 75.0);
      assert.equal(result.updatedState.energy, 45.0);
    });

    it('should enforce PLAY energy threshold boundary conditions (reject < 35.0, accept >= 35.0, clamp to floor 20.0)', () => {
      // 1. Boundary: 34.9 energy (threshold - epsilon) -> REJECTS
      const subThresholdState = createInitialState({ energy: 34.9 });
      assert.throws(
        () => applyCareAction(subThresholdState, 'PLAY', BASE_TIME),
        /INSUFFICIENT_ENERGY/,
      );

      // 2. Boundary: exact 35.0 energy (threshold) -> SUCCEEDS and clamps to 20.0 floor (35 - 15 = 20)
      const exactThresholdState = createInitialState({ energy: 35.0, mood: 50.0 });
      const exactResult = applyCareAction(exactThresholdState, 'PLAY', BASE_TIME);
      assert.equal(exactResult.reaction, 'PLAYED');
      assert.equal(exactResult.updatedState.energy, 20.0);

      // 3. Clamping: starting at 36.0 energy -> 36 - 15 = 21.0
      const slightlyAboveState = createInitialState({ energy: 36.0, mood: 50.0 });
      const slightlyAboveResult = applyCareAction(slightlyAboveState, 'PLAY', BASE_TIME);
      assert.equal(slightlyAboveResult.updatedState.energy, 21.0);
    });

    it('should apply PET action with mood boost', () => {
      const state = createInitialState({ mood: 60.0 });
      const result = applyCareAction(state, 'PET', BASE_TIME);

      assert.equal(result.reaction, 'PETTED');
      assert.equal(result.updatedState.mood, 70.0);
    });

    it('should transition to SLEEP state and reject active care actions during sleep', () => {
      const state = createInitialState();
      const sleepResult = applyCareAction(state, 'SLEEP', BASE_TIME);

      assert.equal(sleepResult.reaction, 'FELL_ASLEEP');
      assert.equal(sleepResult.updatedState.isSleeping, true);
      assert.ok(sleepResult.updatedState.sleepStartedAt !== null);

      // Cannot feed, play, clean or pet while sleeping
      assert.throws(() => applyCareAction(sleepResult.updatedState, 'FEED', BASE_TIME), /COMPANION_IS_SLEEPING/);
      assert.throws(() => applyCareAction(sleepResult.updatedState, 'CLEAN', BASE_TIME), /COMPANION_IS_SLEEPING/);
      assert.throws(() => applyCareAction(sleepResult.updatedState, 'PLAY', BASE_TIME), /COMPANION_IS_SLEEPING/);
      assert.throws(() => applyCareAction(sleepResult.updatedState, 'PET', BASE_TIME), /COMPANION_IS_SLEEPING/);
      assert.throws(() => applyCareAction(sleepResult.updatedState, 'SLEEP', BASE_TIME), /ALREADY_SLEEPING/);

      // Wake up succeeds
      const wakeResult = applyCareAction(sleepResult.updatedState, 'WAKE', BASE_TIME + 3600000);
      assert.equal(wakeResult.reaction, 'WOKE_UP');
      assert.equal(wakeResult.updatedState.isSleeping, false);
      assert.equal(wakeResult.updatedState.sleepStartedAt, null);
    });

    it('should reject WAKE when already awake', () => {
      const state = createInitialState({ isSleeping: false });
      assert.throws(() => applyCareAction(state, 'WAKE', BASE_TIME), /ALREADY_AWAKE/);
    });
  });

  describe('5. Expression Derivation Model', () => {
    it('should derive correct priority expressions', () => {
      assert.equal(
        deriveCompanionExpression({ hunger: 80, cleanliness: 80, energy: 80, mood: 80, isSleeping: true }),
        'SLEEPING',
      );
      assert.equal(
        deriveCompanionExpression({ hunger: 80, cleanliness: 80, energy: 15, mood: 90, isSleeping: false }),
        'TIRED',
      );
      assert.equal(
        deriveCompanionExpression({ hunger: 20, cleanliness: 80, energy: 80, mood: 90, isSleeping: false }),
        'HUNGRY',
      );
      assert.equal(
        deriveCompanionExpression({ hunger: 80, cleanliness: 20, energy: 80, mood: 90, isSleeping: false }),
        'DIRTY',
      );
      assert.equal(
        deriveCompanionExpression({ hunger: 80, cleanliness: 80, energy: 80, mood: 85, isSleeping: false }),
        'VERY_HAPPY',
      );
      assert.equal(
        deriveCompanionExpression({ hunger: 80, cleanliness: 80, energy: 80, mood: 60, isSleeping: false }),
        'HAPPY',
      );
      assert.equal(
        deriveCompanionExpression({ hunger: 80, cleanliness: 80, energy: 80, mood: 40, isSleeping: false }),
        'NEUTRAL',
      );
    });
  });

  describe('6. Determinism & Frozen Clock Purity', () => {
    it('should return identical results for same inputs across arbitrary runs', () => {
      const state = createInitialState({ hunger: 73.4, cleanliness: 61.2, energy: 45.8, mood: 59.9 });
      const evalTime = BASE_TIME + 1726354;

      const run1 = calculateEffectiveCareState(state, evalTime);
      const run2 = calculateEffectiveCareState(state, evalTime);

      assert.deepEqual(run1, run2);
    });
  });
});
