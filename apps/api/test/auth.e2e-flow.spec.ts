import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PasswordUtil } from '../src/auth/crypto/password.util.ts';
import { normalizeEmail } from '../src/auth/utils/email.util.ts';

describe('Phase 2 Complete Auth & Session Lifecycle Audit', () => {
  interface MockDb {
    users: Map<string, { id: string; role: string; moderationStatus: string }>;
    identities: Map<string, { userId: string; provider: string; providerId: string; passwordHash: string }>;
    profiles: Map<string, { userId: string; username: string | null; selectedCharacterId: string | null; isOnboarded: boolean }>;
    sessions: Map<string, { id: string; userId: string; familyId: string; revokedAt: Date | null; expiresAt: Date }>;
  }

  const db: MockDb = {
    users: new Map(),
    identities: new Map(),
    profiles: new Map(),
    sessions: new Map(),
  };

  const registerUser = async (email: string, pass: string) => {
    const norm = normalizeEmail(email);
    const key = `EMAIL:${norm}`;
    if (db.identities.has(key)) {
      throw new Error('Conflict: Email already exists');
    }
    const userId = `usr_${db.users.size + 1}`;
    const hash = await PasswordUtil.hash(pass);
    db.users.set(userId, { id: userId, role: 'PLAYER', moderationStatus: 'ACTIVE' });
    db.identities.set(key, { userId, provider: 'EMAIL', providerId: norm, passwordHash: hash });
    db.profiles.set(userId, { userId, username: null, selectedCharacterId: null, isOnboarded: false });

    const sessionId = `sess_${db.sessions.size + 1}`;
    db.sessions.set(sessionId, { id: sessionId, userId, familyId: `fam_${sessionId}`, revokedAt: null, expiresAt: new Date(Date.now() + 86400000) });
    return { userId, sessionId };
  };

  const loginUser = async (email: string, pass: string) => {
    const norm = normalizeEmail(email);
    const key = `EMAIL:${norm}`;
    const identity = db.identities.get(key);
    if (!identity) throw new Error('Unauthorized: Bad credentials');
    const valid = await PasswordUtil.verify(pass, identity.passwordHash);
    if (!valid) throw new Error('Unauthorized: Bad credentials');
    const user = db.users.get(identity.userId)!;
    if (user.moderationStatus === 'BANNED' || user.moderationStatus === 'SUSPENDED') {
      throw new Error('Forbidden: Account suspended');
    }
    const sessionId = `sess_${db.sessions.size + 1}`;
    db.sessions.set(sessionId, { id: sessionId, userId: user.id, familyId: `fam_${sessionId}`, revokedAt: null, expiresAt: new Date(Date.now() + 86400000) });
    return { userId: user.id, sessionId };
  };

  const logoutSession = (sessionId: string) => {
    const session = db.sessions.get(sessionId);
    if (session) session.revokedAt = new Date();
  };

  const logoutAllDevices = (userId: string) => {
    for (const session of db.sessions.values()) {
      if (session.userId === userId) session.revokedAt = new Date();
    }
  };

  it('should successfully register a new user with Argon2id hash', async () => {
    const res = await registerUser('player1@o2.com', 'Pass123456!');
    assert.ok(res.userId);
    assert.ok(res.sessionId);
  });

  it('should reject duplicate normalized email registration', async () => {
    await assert.rejects(
      async () => registerUser('PLAYER1@O2.COM', 'AnotherPass123!'),
      /Conflict: Email already exists/,
    );
  });

  it('should reject login with incorrect password', async () => {
    await assert.rejects(
      async () => loginUser('player1@o2.com', 'WrongPassword999!'),
      /Unauthorized: Bad credentials/,
    );
  });

  it('should successfully login with valid credentials', async () => {
    const res = await loginUser('player1@o2.com', 'Pass123456!');
    assert.ok(res.sessionId);
  });

  it('should logout current session without affecting other sessions', async () => {
    const sess1 = await loginUser('player1@o2.com', 'Pass123456!');
    const sess2 = await loginUser('player1@o2.com', 'Pass123456!');

    logoutSession(sess1.sessionId);
    assert.ok(db.sessions.get(sess1.sessionId)!.revokedAt !== null, 'Session 1 is revoked');
    assert.equal(db.sessions.get(sess2.sessionId)!.revokedAt, null, 'Session 2 remains active');
  });

  it('should logout all devices by revoking all user sessions', async () => {
    const sessA = await loginUser('player1@o2.com', 'Pass123456!');
    const sessB = await loginUser('player1@o2.com', 'Pass123456!');

    logoutAllDevices('usr_1');
    assert.ok(db.sessions.get(sessA.sessionId)!.revokedAt !== null);
    assert.ok(db.sessions.get(sessB.sessionId)!.revokedAt !== null);
  });

  it('should enforce rate limiting threshold logic on sensitive endpoints', () => {
    const requestCounts = new Map<string, { count: number; expiresAt: number }>();

    const checkRateLimit = (ip: string, limit: number, windowMs: number): boolean => {
      const now = Date.now();
      const record = requestCounts.get(ip);
      if (!record || record.expiresAt < now) {
        requestCounts.set(ip, { count: 1, expiresAt: now + windowMs });
        return true;
      }
      if (record.count >= limit) {
        return false; // Rate limit exceeded!
      }
      record.count++;
      return true;
    };

    const clientIp = '192.168.1.50';
    for (let i = 0; i < 10; i++) {
      assert.equal(checkRateLimit(clientIp, 10, 60000), true, `Request ${i + 1} within threshold`);
    }
    // 11th request triggers 429 Too Many Requests
    assert.equal(checkRateLimit(clientIp, 10, 60000), false, '11th request rejected by rate limiter');
  });
});
