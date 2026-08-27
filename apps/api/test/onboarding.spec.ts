import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { STARTER_COMPANIONS } from '../prisma/seed.ts';

describe('Phase 2: Player Onboarding & Handle Allocation', () => {
  describe('Case-Insensitive Username Handle Allocation', () => {
    const normalize = (username: string) => username.trim().toLowerCase();

    it('should normalize usernames to lowercase and trim spaces', () => {
      assert.equal(normalize('Anas'), 'anas');
      assert.equal(normalize('  ANAS_O2  '), 'anas_o2');
      assert.equal(normalize('Gamer_Girl'), 'gamer_girl');
    });

    it('should detect collisions regardless of case (Anas vs anas vs ANAS)', () => {
      const takenUsernames = new Set<string>();

      const registerHandle = (handle: string): boolean => {
        const normalized = normalize(handle);
        if (takenUsernames.has(normalized)) {
          return false;
        }
        takenUsernames.add(normalized);
        return true;
      };

      assert.equal(registerHandle('Anas'), true, 'First handle registration succeeds');
      assert.equal(registerHandle('anas'), false, 'Lowercase duplicate handle is rejected');
      assert.equal(registerHandle('ANAS'), false, 'Uppercase duplicate handle is rejected');
      assert.equal(registerHandle('aNaS'), false, 'Mixed-case duplicate handle is rejected');
      assert.equal(registerHandle('anas2'), true, 'Distinct handle is accepted');
    });

    it('should block reserved system handles', () => {
      const RESERVED = new Set(['admin', 'administrator', 'system', 'support', 'moderator', 'o2']);

      const isAllowed = (handle: string): boolean => {
        const norm = normalize(handle);
        return !RESERVED.has(norm);
      };

      assert.equal(isAllowed('admin'), false);
      assert.equal(isAllowed('ADMIN'), false);
      assert.equal(isAllowed('System'), false);
      assert.equal(isAllowed('o2'), false);
      assert.equal(isAllowed('anas_player'), true);
    });

    it('should validate handle regex rules (3-20 chars, alphanumeric + underscore)', () => {
      const isValidFormat = (handle: string): boolean => {
        const trimmed = handle.trim();
        if (trimmed.length < 3 || trimmed.length > 20) return false;
        return /^[a-zA-Z0-9_]+$/.test(trimmed);
      };

      assert.equal(isValidFormat('an'), false, 'Too short (<3)');
      assert.equal(isValidFormat('a'.repeat(21)), false, 'Too long (>20)');
      assert.equal(isValidFormat('anas-o2'), false, 'Hyphen not allowed');
      assert.equal(isValidFormat('anas o2'), false, 'Space not allowed');
      assert.equal(isValidFormat('anas@o2'), false, 'Special chars not allowed');
      assert.equal(isValidFormat('anas_007'), true, 'Valid alphanumeric with underscore');
    });
  });

  describe('Starter Companion Roster & Permanent Selection', () => {
    it('should verify 20 data-driven starter companions are defined in seed', () => {
      assert.equal(STARTER_COMPANIONS.length, 20, 'Exactly 20 starter companions must be present');

      const slugs = new Set<string>();
      for (const companion of STARTER_COMPANIONS) {
        assert.ok(companion.slug, 'Companion must have slug');
        assert.ok(companion.nameAr, 'Companion must have Arabic name');
        assert.ok(companion.nameEn, 'Companion must have English name');
        assert.ok(companion.descriptionAr, 'Companion must have Arabic bio');
        assert.ok(companion.archetype, 'Companion must have archetype');
        assert.equal(companion.isStarter, true, 'Must be marked as starter');

        assert.equal(slugs.has(companion.slug), false, `Slug [${companion.slug}] must be unique`);
        slugs.add(companion.slug);
      }
    });

    it('should enforce permanent companion selection (reject re-selection)', () => {
      interface MockPlayerProfile {
        userId: string;
        username: string | null;
        selectedCharacterId: string | null;
        isOnboarded: boolean;
      }

      const profile: MockPlayerProfile = {
        userId: 'usr_test_01',
        username: 'anas_o2',
        selectedCharacterId: null,
        isOnboarded: false,
      };

      const selectPermanentCompanion = (charId: string) => {
        if (profile.selectedCharacterId) {
          throw new Error('Conflict: Companion already selected');
        }
        profile.selectedCharacterId = charId;
        profile.isOnboarded = Boolean(profile.username);
        return { success: true, selectedCharacterId: charId };
      };

      // First selection succeeds
      const result = selectPermanentCompanion('char_panda_01');
      assert.equal(result.success, true);
      assert.equal(profile.selectedCharacterId, 'char_panda_01');
      assert.equal(profile.isOnboarded, true, 'User with username and companion is onboarded');

      // Attempting second selection throws Conflict
      assert.throws(
        () => selectPermanentCompanion('char_fox_04'),
        /Conflict: Companion already selected/,
        'Re-selecting starter companion must be rejected',
      );
    });
  });
});
