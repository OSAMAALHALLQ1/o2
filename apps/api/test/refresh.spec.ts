import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PasswordUtil } from '../src/auth/crypto/password.util.ts';

interface MockUserSession {
  id: string;
  userId: string;
  familyId: string;
  deviceInfo: string | null;
  expiresAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
}

interface MockRefreshTokenRecord {
  id: string;
  sessionId: string;
  familyId: string;
  tokenHash: string;
  consumedAt: Date | null;
  revokedAt: Date | null;
  replacedByTokenId: string | null;
  expiresAt: Date;
  createdAt: Date;
}

class InMemorySessionStore {
  sessions: MockUserSession[] = [];
  records: MockRefreshTokenRecord[] = [];

  createSession(userId: string, initialToken: string, familyId: string = 'fam_1'): { session: MockUserSession; record: MockRefreshTokenRecord } {
    const session: MockUserSession = {
      id: `sess_${this.sessions.length + 1}`,
      userId,
      familyId,
      deviceInfo: 'iOS Mobile Client',
      expiresAt: new Date(Date.now() + 30 * 86400000),
      lastUsedAt: new Date(),
      revokedAt: null,
    };
    const record: MockRefreshTokenRecord = {
      id: `rt_${this.records.length + 1}`,
      sessionId: session.id,
      familyId,
      tokenHash: PasswordUtil.hashRefreshToken(initialToken),
      consumedAt: null,
      revokedAt: null,
      replacedByTokenId: null,
      expiresAt: new Date(Date.now() + 30 * 86400000),
      createdAt: new Date(),
    };

    this.sessions.push(session);
    this.records.push(record);
    return { session, record };
  }

  // Atomic refresh rotation simulation
  rotateToken(rawToken: string, newToken: string): { success: boolean; newRecord?: MockRefreshTokenRecord; error?: string } {
    const tokenHash = PasswordUtil.hashRefreshToken(rawToken);
    const existing = this.records.find((r) => r.tokenHash === tokenHash);

    if (!existing) {
      return { success: false, error: 'TOKEN_NOT_FOUND' };
    }

    // Replay attack detection
    if (existing.consumedAt !== null || existing.revokedAt !== null) {
      // Family Revocation Triggered!
      this.records
        .filter((r) => r.familyId === existing.familyId)
        .forEach((r) => {
          r.revokedAt = new Date();
        });
      this.sessions
        .filter((s) => s.familyId === existing.familyId)
        .forEach((s) => {
          s.revokedAt = new Date();
        });

      return { success: false, error: 'SECURITY_ALERT_REPLAY_DETECTED' };
    }

    const session = this.sessions.find((s) => s.id === existing.sessionId);
    if (!session || session.revokedAt !== null) {
      return { success: false, error: 'SESSION_REVOKED' };
    }

    // Atomic issue & consume
    const newRecord: MockRefreshTokenRecord = {
      id: `rt_${this.records.length + 1}`,
      sessionId: existing.sessionId,
      familyId: existing.familyId,
      tokenHash: PasswordUtil.hashRefreshToken(newToken),
      consumedAt: null,
      revokedAt: null,
      replacedByTokenId: null,
      expiresAt: new Date(Date.now() + 30 * 86400000),
      createdAt: new Date(),
    };

    existing.consumedAt = new Date();
    existing.replacedByTokenId = newRecord.id;
    session.lastUsedAt = new Date();

    this.records.push(newRecord);
    return { success: true, newRecord };
  }
}

describe('Phase 2 Security: Refresh Token Rotation & Replay Attack Defense', () => {
  it('should issue initial session with unconsumed token T0', () => {
    const store = new InMemorySessionStore();
    const { session, record } = store.createSession('usr_01', 'token_T0');

    assert.equal(session.userId, 'usr_01');
    assert.equal(record.consumedAt, null);
    assert.equal(record.revokedAt, null);
    assert.equal(record.replacedByTokenId, null);
  });

  it('should atomically consume T0 and issue T1 on valid refresh', () => {
    const store = new InMemorySessionStore();
    store.createSession('usr_01', 'token_T0');

    const result = store.rotateToken('token_T0', 'token_T1');
    assert.equal(result.success, true);
    assert.ok(result.newRecord);

    const oldRecord = store.records.find((r) => r.tokenHash === PasswordUtil.hashRefreshToken('token_T0'));
    assert.ok(oldRecord?.consumedAt !== null, 'T0 must be marked consumed');
    assert.equal(oldRecord?.replacedByTokenId, result.newRecord.id, 'T0 must point to T1');
  });

  it('should detect replay attack when consumed T0 is re-submitted and revoke entire family', () => {
    const store = new InMemorySessionStore();
    store.createSession('usr_01', 'token_T0', 'family_alpha');

    // Legitimate rotation T0 -> T1
    const rot1 = store.rotateToken('token_T0', 'token_T1');
    assert.equal(rot1.success, true);

    // Legitimate rotation T1 -> T2
    const rot2 = store.rotateToken('token_T1', 'token_T2');
    assert.equal(rot2.success, true);

    // MALICIOUS ATTACK: Replay stolen old token T0
    const replayAttack = store.rotateToken('token_T0', 'token_attacker_T3');
    assert.equal(replayAttack.success, false);
    assert.equal(replayAttack.error, 'SECURITY_ALERT_REPLAY_DETECTED');

    // Verify all records and sessions in family_alpha are revoked
    const activeRecords = store.records.filter((r) => r.familyId === 'family_alpha' && r.revokedAt === null);
    const activeSessions = store.sessions.filter((s) => s.familyId === 'family_alpha' && s.revokedAt === null);

    assert.equal(activeRecords.length, 0, 'No active tokens remain in revoked family');
    assert.equal(activeSessions.length, 0, 'Session is revoked');
  });

  it('should prevent simultaneous race condition refresh from issuing double tokens', async () => {
    const store = new InMemorySessionStore();
    store.createSession('usr_01', 'token_T0', 'family_beta');

    // Simulate 2 simultaneous requests attempting to rotate token_T0
    const request1 = store.rotateToken('token_T0', 'token_T1_req1');
    const request2 = store.rotateToken('token_T0', 'token_T1_req2');

    // Exactly one must succeed, the second must be flagged as replay
    assert.equal(request1.success, true, 'First concurrent request succeeds');
    assert.equal(request2.success, false, 'Second concurrent request fails');
    assert.equal(request2.error, 'SECURITY_ALERT_REPLAY_DETECTED', 'Second request detected consumed token');
  });
});
