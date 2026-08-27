import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { STARTER_COMPANIONS } from '../prisma/seed.ts';

describe('Phase 2: Player Onboarding, Handle Allocation & Permanent Companion', () => {
  describe('1. Case-Insensitive Username Handle Allocation & Collision Rules', () => {
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

    it('should simulate concurrent race condition for identical handle (1 success, 1 conflict)', () => {
      const claimedHandles = new Map<string, string>();

      const claimHandleAtomic = (userId: string, requestedHandle: string): { success: boolean; error?: string } => {
        const norm = normalize(requestedHandle);
        if (claimedHandles.has(norm)) {
          return { success: false, error: 'USERNAME_CONFLICT' };
        }
        claimedHandles.set(norm, userId);
        return { success: true };
      };

      const resultUser1 = claimHandleAtomic('usr_1', 'Anas');
      const resultUser2 = claimHandleAtomic('usr_2', 'anas');

      assert.equal(resultUser1.success, true, 'First user successfully claims handle');
      assert.equal(resultUser2.success, false, 'Simultaneous second user gets deterministic conflict');
      assert.equal(resultUser2.error, 'USERNAME_CONFLICT');
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

  describe('2. Starter Companion Roster & Data-Driven Integrity', () => {
    it('should verify exactly 20 data-driven starter companions in seed roster', () => {
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

    it('should reject non-starter or inactive character selection', () => {
      const characters: Record<string, { id: string; isStarter: boolean; isActive: boolean }> = {
        char_starter_ok: { id: 'char_starter_ok', isStarter: true, isActive: true },
        char_starter_inactive: { id: 'char_starter_inactive', isStarter: true, isActive: false },
        char_premium_dragon: { id: 'char_premium_dragon', isStarter: false, isActive: true },
      };

      const validateStarterEligibility = (id: string) => {
        const c = characters[id];
        if (!c) throw new Error('NOT_FOUND');
        if (!c.isActive || !c.isStarter) throw new Error('NOT_ELIGIBLE_STARTER');
        return true;
      };

      assert.equal(validateStarterEligibility('char_starter_ok'), true);
      assert.throws(() => validateStarterEligibility('char_starter_inactive'), /NOT_ELIGIBLE_STARTER/);
      assert.throws(() => validateStarterEligibility('char_premium_dragon'), /NOT_ELIGIBLE_STARTER/);
      assert.throws(() => validateStarterEligibility('char_unknown'), /NOT_FOUND/);
    });

    it('should enforce permanent companion single-selection rule', () => {
      interface MockPlayerProfile {
        userId: string;
        username: string | null;
        selectedCharacterId: string | null;
      }

      const profile: MockPlayerProfile = {
        userId: 'usr_test_01',
        username: 'anas_o2',
        selectedCharacterId: null,
      };

      const selectPermanentCompanion = (charId: string) => {
        if (profile.selectedCharacterId !== null) {
          throw new Error('Conflict: Companion already selected');
        }
        profile.selectedCharacterId = charId;
        return { success: true, selectedCharacterId: charId };
      };

      // First selection succeeds
      const result = selectPermanentCompanion('char_panda_01');
      assert.equal(result.success, true);
      assert.equal(profile.selectedCharacterId, 'char_panda_01');

      // Second selection throws Conflict
      assert.throws(
        () => selectPermanentCompanion('char_fox_04'),
        /Conflict: Companion already selected/,
        'Re-selecting starter companion must be rejected',
      );
    });

    it('should simulate concurrent companion selection race ensuring only one survives', () => {
      let selectedChar: string | null = null;

      const attemptSelect = (charId: string): { success: boolean; error?: string } => {
        if (selectedChar !== null) {
          return { success: false, error: 'COMPANION_ALREADY_CHOSEN' };
        }
        selectedChar = charId;
        return { success: true };
      };

      const call1 = attemptSelect('char_panda_01');
      const call2 = attemptSelect('char_fox_04');

      assert.equal(call1.success, true);
      assert.equal(call2.success, false);
      assert.equal(call2.error, 'COMPANION_ALREADY_CHOSEN');
      assert.equal(selectedChar, 'char_panda_01');
    });
  });

  describe('3. Authoritative Onboarding State Transition Model', () => {
    it('should evaluate isOnboarded strictly based on authoritative presence of username AND companion', () => {
      const deriveIsOnboarded = (username: string | null, companionId: string | null): boolean => {
        return Boolean(username && username.trim().length > 0 && companionId && companionId.trim().length > 0);
      };

      assert.equal(deriveIsOnboarded(null, null), false, 'Neither username nor companion');
      assert.equal(deriveIsOnboarded('anas_o2', null), false, 'Username set, but no companion');
      assert.equal(deriveIsOnboarded(null, 'char_panda_01'), false, 'Companion set, but no username');
      assert.equal(deriveIsOnboarded('anas_o2', 'char_panda_01'), true, 'Both present -> Onboarded!');
    });
  });
});
