import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalUserPair, generatePartyCode, getPartyCapacity } from '../dist/index.js';

describe('Phase 5 social and party domain rules', () => {
  it('canonicalizes a friendship pair independently of request direction', () => {
    assert.deepEqual(canonicalUserPair('user-b', 'user-a'), { userLowId: 'user-a', userHighId: 'user-b' });
    assert.deepEqual(canonicalUserPair('user-a', 'user-b'), { userLowId: 'user-a', userHighId: 'user-b' });
  });

  it('rejects self-relations', () => {
    assert.throws(() => canonicalUserPair('same', 'same'), /SELF_RELATION_NOT_ALLOWED/);
  });

  it('uses the configured maximum when no game is selected', () => {
    assert.equal(getPartyCapacity(null), 14);
  });

  it('returns each configured game capacity', () => {
    assert.equal(getPartyCapacity('ATRASH'), 5);
    assert.equal(getPartyCapacity('MAFIA_CLASSIC'), 14);
    assert.equal(getPartyCapacity('TARNEEB'), 4);
    assert.equal(getPartyCapacity('HIDE_AND_SEEK'), 8);
    assert.equal(getPartyCapacity('O2_IMPOSTER'), 8);
  });

  it('generates six-character non-ambiguous party codes', () => {
    for (let index = 0; index < 100; index += 1) {
      assert.match(generatePartyCode(), /^[A-HJ-NP-Z2-9]{6}$/);
    }
  });

  it('produces distinct party codes across a practical sample', () => {
    const codes = new Set(Array.from({ length: 500 }, generatePartyCode));
    assert.equal(codes.size, 500);
  });
});
