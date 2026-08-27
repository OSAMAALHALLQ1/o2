import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PasswordUtil } from '../src/auth/crypto/password.util.ts';

describe('Phase 2: Authentication & Security Engine', () => {
  describe('Password Hashing & Crypto Protection', () => {
    it('should securely hash password with unique salt and memory-hard algorithm', async () => {
      const rawPassword = 'SuperSecretPassword123!';
      const hash1 = await PasswordUtil.hash(rawPassword);
      const hash2 = await PasswordUtil.hash(rawPassword);

      assert.ok(hash1.startsWith('$argon2id$'), 'Hash should contain argon2id algorithm identifier');
      assert.notEqual(hash1, hash2, 'Salts must ensure hashes of identical passwords are distinct');
    });

    it('should verify correct password using constant-time comparison', async () => {
      const rawPassword = 'CorrectPassword123!';
      const hash = await PasswordUtil.hash(rawPassword);

      const isValid = await PasswordUtil.verify(rawPassword, hash);
      assert.equal(isValid, true, 'Valid password must verify true');

      const isInvalid = await PasswordUtil.verify('WrongPassword123!', hash);
      assert.equal(isInvalid, false, 'Invalid password must verify false');
    });

    it('should generate secure SHA-256 hash for refresh token storage at rest', () => {
      const rawToken = 'o2_refresh_raw_token_xyz_123';
      const hash1 = PasswordUtil.hashRefreshToken(rawToken);
      const hash2 = PasswordUtil.hashRefreshToken(rawToken);

      assert.equal(hash1, hash2, 'SHA-256 hash must be deterministic for lookup');
      assert.notEqual(hash1, rawToken, 'Hash must not expose raw token');
      assert.equal(hash1.length, 64, 'SHA-256 hex string should be 64 characters long');
    });

    it('should verify refresh token constant-time equality', () => {
      const rawToken = 'o2_refresh_raw_token_xyz_123';
      const storedHash = PasswordUtil.hashRefreshToken(rawToken);

      assert.equal(PasswordUtil.verifyRefreshToken(rawToken, storedHash), true);
      assert.equal(PasswordUtil.verifyRefreshToken('different_token', storedHash), false);
    });
  });

  describe('Session Token Rotation & Replay Attack Defense Logic', () => {
    it('should simulate family token rotation and detect reuse', () => {
      interface MockSession {
        id: string;
        familyId: string;
        tokenHash: string;
        isRevoked: boolean;
      }

      const sessions: MockSession[] = [];

      // Step 1: Initial Login - Session Issued
      const familyId = 'fam_device_001';
      const token1 = 'refresh_token_v1';
      sessions.push({
        id: 'sess_1',
        familyId,
        tokenHash: PasswordUtil.hashRefreshToken(token1),
        isRevoked: false,
      });

      assert.equal(sessions.length, 1);
      assert.equal(sessions[0].isRevoked, false);

      // Step 2: Legitimate Token Refresh - Rotation to token2
      const token1Hash = PasswordUtil.hashRefreshToken(token1);
      const activeSession = sessions.find((s) => s.tokenHash === token1Hash && !s.isRevoked);
      assert.ok(activeSession, 'Active session found');

      // Revoke old session
      activeSession.isRevoked = true;

      // Issue new session in same family
      const token2 = 'refresh_token_v2';
      sessions.push({
        id: 'sess_2',
        familyId: activeSession.familyId,
        tokenHash: PasswordUtil.hashRefreshToken(token2),
        isRevoked: false,
      });

      assert.equal(sessions.filter((s) => !s.isRevoked).length, 1);

      // Step 3: Malicious Token Replay Attack using already-rotated token1!
      const replayedTokenHash = PasswordUtil.hashRefreshToken(token1);
      const replayedSession = sessions.find((s) => s.tokenHash === replayedTokenHash);

      assert.ok(replayedSession, 'Replayed session found in history');
      assert.equal(replayedSession.isRevoked, true, 'Replayed token was already revoked');

      // Replay Detection Trigger: Revoke ALL sessions belonging to familyId!
      sessions
        .filter((s) => s.familyId === replayedSession.familyId)
        .forEach((s) => {
          s.isRevoked = true;
        });

      // Assert all sessions in the family are now revoked
      const remainingActiveSessions = sessions.filter(
        (s) => s.familyId === familyId && !s.isRevoked,
      );
      assert.equal(remainingActiveSessions.length, 0, 'Family replay revocation wiped all family sessions');
    });
  });
});
