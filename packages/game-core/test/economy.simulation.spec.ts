import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCurrencyScope,
  validateIntegerAmount,
  hashEconomyRequest,
  applyConsumableItem,
} from '../dist/index.js';
import type { RawCareState } from '../dist/index.js';

describe('Phase 4: Game Core Economy Rules & Consumables Unit Tests', () => {
  describe('1. Currency Scope Validation', () => {
    it('should allow valid COIN with no scope', () => {
      const res = validateCurrencyScope({ currencyKind: 'COIN' });
      assert.equal(res.isValid, true);
    });

    it('should reject COIN with scopeType or scopeId', () => {
      const res1 = validateCurrencyScope({ currencyKind: 'COIN', scopeType: 'EVENT' });
      assert.equal(res1.isValid, false);

      const res2 = validateCurrencyScope({ currencyKind: 'COIN', scopeId: 'evt_001' });
      assert.equal(res2.isValid, false);
    });

    it('should allow valid GEM with no scope', () => {
      const res = validateCurrencyScope({ currencyKind: 'GEM' });
      assert.equal(res.isValid, true);
    });

    it('should reject GEM with scopeType or scopeId', () => {
      const res = validateCurrencyScope({ currencyKind: 'GEM', scopeType: 'SEASON' });
      assert.equal(res.isValid, false);
    });

    it('should allow EVENT_TOKEN with valid scopeType and scopeId', () => {
      const res = validateCurrencyScope({
        currencyKind: 'EVENT_TOKEN',
        scopeType: 'EVENT',
        scopeId: 'summer_carnival_2026',
      });
      assert.equal(res.isValid, true);
    });

    it('should reject EVENT_TOKEN with missing scopeType or scopeId', () => {
      const res1 = validateCurrencyScope({ currencyKind: 'EVENT_TOKEN' });
      assert.equal(res1.isValid, false);

      const res2 = validateCurrencyScope({
        currencyKind: 'EVENT_TOKEN',
        scopeType: 'EVENT',
        scopeId: '   ',
      });
      assert.equal(res2.isValid, false);
    });
  });

  describe('2. Integer Amount Validation', () => {
    it('should accept valid positive integers', () => {
      assert.equal(validateIntegerAmount(100).isValid, true);
      assert.equal(validateIntegerAmount(1).isValid, true);
    });

    it('should reject non-integers, decimals, and negative amounts', () => {
      assert.equal(validateIntegerAmount(10.5).isValid, false);
      assert.equal(validateIntegerAmount(0).isValid, false);
      assert.equal(validateIntegerAmount(-50).isValid, false);
      assert.equal(validateIntegerAmount('100' as any).isValid, false);
    });
  });

  describe('3. Request Fingerprint Hashing', () => {
    it('should generate identical SHA-256 hash regardless of key order', () => {
      const hash1 = hashEconomyRequest('usr_1', 'PURCHASE', { offerId: 'off_1', clientTxId: 'tx_1' });
      const hash2 = hashEconomyRequest('usr_1', 'PURCHASE', { clientTxId: 'tx_1', offerId: 'off_1' });
      assert.equal(hash1, hash2);
    });

    it('should generate different hash for different payload', () => {
      const hash1 = hashEconomyRequest('usr_1', 'PURCHASE', { offerId: 'off_1' });
      const hash2 = hashEconomyRequest('usr_1', 'PURCHASE', { offerId: 'off_2' });
      assert.notEqual(hash1, hash2);
    });

    it('should recursively canonicalize nested objects without omitting meaningful fields', () => {
      const hash1 = hashEconomyRequest('usr_1', 'PURCHASE:v1', {
        offerId: 'off_1',
        scope: { scopeType: 'EVENT', scopeId: 'summer-2026' },
      });
      const reordered = hashEconomyRequest('usr_1', 'PURCHASE:v1', {
        scope: { scopeId: 'summer-2026', scopeType: 'EVENT' },
        offerId: 'off_1',
      });
      const changed = hashEconomyRequest('usr_1', 'PURCHASE:v1', {
        offerId: 'off_1',
        scope: { scopeType: 'EVENT', scopeId: 'winter-2026' },
      });

      assert.equal(hash1, reordered);
      assert.notEqual(hash1, changed);
    });
  });

  describe('4. Consumable Item Simulation Integration', () => {
    it('should apply consumable hunger and mood boosts correctly', () => {
      const now = Date.now();
      const raw: RawCareState = {
        hunger: 40.0,
        cleanliness: 70.0,
        energy: 60.0,
        mood: 50.0,
        isSleeping: false,
        sleepStartedAt: null,
        lastSimulatedAt: new Date(now).toISOString(),
        lastInteractionAt: new Date(now).toISOString(),
      };

      const result = applyConsumableItem(
        raw,
        { hungerDelta: 30.0, moodDelta: 15.0, reactionKey: 'YUMMY_SHAWARMA' },
        now,
      );

      assert.equal(result.updatedState.hunger, 70.0);
      assert.equal(result.updatedState.mood, 65.0);
      assert.equal(result.reactionKey, 'YUMMY_SHAWARMA');
    });

    it('should clamp stats to 100.0 maximum', () => {
      const now = Date.now();
      const raw: RawCareState = {
        hunger: 85.0,
        cleanliness: 90.0,
        energy: 80.0,
        mood: 95.0,
        isSleeping: false,
        sleepStartedAt: null,
        lastSimulatedAt: new Date(now).toISOString(),
        lastInteractionAt: new Date(now).toISOString(),
      };

      const result = applyConsumableItem(
        raw,
        { hungerDelta: 40.0, moodDelta: 20.0 },
        now,
      );

      assert.equal(result.updatedState.hunger, 100.0);
      assert.equal(result.updatedState.mood, 100.0);
    });
  });
});
