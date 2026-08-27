import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PasswordUtil } from '../src/auth/crypto/password.util.ts';
import { normalizeEmail } from '../src/auth/utils/email.util.ts';

describe('Phase 2 Security: Argon2id Hashing & Email Normalization', () => {
  describe('1. Argon2id Password Hashing Engine', () => {
    it('should generate valid RFC 9106 Argon2id hash containing $argon2id$ identifier', async () => {
      const password = 'CorrectHorseBatteryStaple2026!';
      const encoded = await PasswordUtil.hash(password);

      assert.ok(encoded.startsWith('$argon2id$'), 'Must use Argon2id variant');
      assert.ok(encoded.includes('m=19456,t=3,p=4'), 'Must match RFC 9106 memory (19MiB), time (3), parallelism (4)');
    });

    it('should produce distinct hashes for identical passwords due to cryptographic salting', async () => {
      const password = 'IdenticalPassword123!';
      const hash1 = await PasswordUtil.hash(password);
      const hash2 = await PasswordUtil.hash(password);

      assert.notEqual(hash1, hash2, 'Salts must ensure distinct hashes');
    });

    it('should verify valid password using native Argon2 verification API', async () => {
      const password = 'ValidSecurePassword99#';
      const hash = await PasswordUtil.hash(password);

      const isValid = await PasswordUtil.verify(password, hash);
      assert.equal(isValid, true, 'Valid password must verify true');
    });

    it('should reject incorrect password', async () => {
      const password = 'ValidSecurePassword99#';
      const hash = await PasswordUtil.hash(password);

      const isInvalid = await PasswordUtil.verify('WrongPassword123!', hash);
      assert.equal(isInvalid, false, 'Incorrect password must verify false');
    });

    it('should safely handle malformed or truncated stored hashes without crashing', async () => {
      assert.equal(await PasswordUtil.verify('test', ''), false);
      assert.equal(await PasswordUtil.verify('test', 'not-a-hash'), false);
      assert.equal(await PasswordUtil.verify('test', '$argon2id$invalid_payload'), false);
      assert.equal(await PasswordUtil.verify('test', '$argon2id$v=19$m=19456$truncated'), false);
    });
  });

  describe('2. Email Normalization & Identity Constraints', () => {
    it('should deterministically normalize email addresses by trimming and lowercasing', () => {
      assert.equal(normalizeEmail('  ANAS@O2.COM  '), 'anas@o2.com');
      assert.equal(normalizeEmail('Player.One@Gmail.Com'), 'player.one@gmail.com');
      assert.equal(normalizeEmail('support@O2Universe.APP'), 'support@o2universe.app');
    });

    it('should detect email duplicate collisions under case-insensitive normalization', () => {
      const registeredIdentities = new Set<string>();

      const registerEmail = (email: string): boolean => {
        const normalized = normalizeEmail(email);
        if (registeredIdentities.has(normalized)) {
          return false;
        }
        registeredIdentities.add(normalized);
        return true;
      };

      assert.equal(registerEmail('Anas@O2.com'), true, 'First registration succeeds');
      assert.equal(registerEmail('anas@o2.com'), false, 'Lowercase duplicate rejected');
      assert.equal(registerEmail('ANAS@O2.COM'), false, 'Uppercase duplicate rejected');
      assert.equal(registerEmail('  anas@o2.com  '), false, 'Untrimmed duplicate rejected');
    });
  });

  describe('3. Deterministic SHA-256 Token Storage at Rest', () => {
    it('should compute 64-character SHA-256 hex hash for refresh tokens', () => {
      const rawToken = 'o2_rt_8fbc9823472034982374982374982374';
      const hash1 = PasswordUtil.hashRefreshToken(rawToken);
      const hash2 = PasswordUtil.hashRefreshToken(rawToken);

      assert.equal(hash1, hash2);
      assert.equal(hash1.length, 64);
      assert.notEqual(hash1, rawToken);
    });

    it('should constant-time verify refresh tokens', () => {
      const rawToken = 'o2_rt_8fbc9823472034982374982374982374';
      const storedHash = PasswordUtil.hashRefreshToken(rawToken);

      assert.equal(PasswordUtil.verifyRefreshToken(rawToken, storedHash), true);
      assert.equal(PasswordUtil.verifyRefreshToken('wrong_token', storedHash), false);
    });
  });
});
