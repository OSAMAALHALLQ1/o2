import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

describe('Phase 2 Security: Access JWT & Session Authorization Guard', () => {
  const SECRET = 'dev-test-jwt-access-secret-32-chars-long!';
  const WRONG_SECRET = 'completely-wrong-secret-key-12345678!';

  const createTestToken = (payload: object, options?: jwt.SignOptions) => {
    return jwt.sign(payload, SECRET, {
      algorithm: 'HS256',
      issuer: 'o2-universe-auth-service',
      audience: 'o2-universe-clients',
      expiresIn: '15m',
      ...options,
    });
  };

  it('should generate and verify valid JWT access token with required claims', () => {
    const token = createTestToken({ sub: 'usr_001', sessionId: 'sess_001', familyId: 'fam_001' });
    const decoded = jwt.verify(token, SECRET, {
      issuer: 'o2-universe-auth-service',
      audience: 'o2-universe-clients',
    }) as any;

    assert.equal(decoded.sub, 'usr_001');
    assert.equal(decoded.sessionId, 'sess_001');
    assert.equal(decoded.familyId, 'fam_001');
    assert.equal(decoded.iss, 'o2-universe-auth-service');
    assert.equal(decoded.aud, 'o2-universe-clients');
  });

  it('should reject malformed token string', () => {
    assert.throws(
      () => jwt.verify('not.a.valid.jwt.token', SECRET),
      /jwt malformed/,
    );
  });

  it('should reject token with invalid cryptographic signature', () => {
    const token = createTestToken({ sub: 'usr_001', sessionId: 'sess_001' });
    assert.throws(
      () => jwt.verify(token, WRONG_SECRET),
      /invalid signature/,
    );
  });

  it('should reject expired JWT token', () => {
    const expiredToken = createTestToken(
      { sub: 'usr_001', sessionId: 'sess_001' },
      { expiresIn: '-1s' },
    );
    assert.throws(
      () => jwt.verify(expiredToken, SECRET),
      /jwt expired/,
    );
  });

  it('should simulate session revocation check rejecting valid JWT for revoked session', () => {
    interface SessionEntity {
      id: string;
      userId: string;
      revokedAt: Date | null;
      moderationStatus: string;
    }

    const sessions: Record<string, SessionEntity> = {
      sess_active: { id: 'sess_active', userId: 'u1', revokedAt: null, moderationStatus: 'ACTIVE' },
      sess_revoked: { id: 'sess_revoked', userId: 'u2', revokedAt: new Date(), moderationStatus: 'ACTIVE' },
      sess_banned: { id: 'sess_banned', userId: 'u3', revokedAt: null, moderationStatus: 'BANNED' },
    };

    const validateSession = (token: string): { valid: boolean; reason?: string } => {
      try {
        const payload = jwt.verify(token, SECRET) as any;
        const session = sessions[payload.sessionId];
        if (!session) return { valid: false, reason: 'SESSION_NOT_FOUND' };
        if (session.revokedAt !== null) return { valid: false, reason: 'SESSION_REVOKED' };
        if (session.moderationStatus === 'BANNED' || session.moderationStatus === 'SUSPENDED') {
          return { valid: false, reason: 'ACCOUNT_BANNED' };
        }
        return { valid: true };
      } catch (err: any) {
        return { valid: false, reason: err.message };
      }
    };

    const validToken = createTestToken({ sub: 'u1', sessionId: 'sess_active' });
    const revokedToken = createTestToken({ sub: 'u2', sessionId: 'sess_revoked' });
    const bannedToken = createTestToken({ sub: 'u3', sessionId: 'sess_banned' });

    assert.equal(validateSession(validToken).valid, true);
    assert.equal(validateSession(revokedToken).reason, 'SESSION_REVOKED');
    assert.equal(validateSession(bannedToken).reason, 'ACCOUNT_BANNED');
  });
});
