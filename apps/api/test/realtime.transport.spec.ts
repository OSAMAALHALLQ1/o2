import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {
  type ClientEventEnvelope,
  type ConnectionState,
  REALTIME_CONSTANTS,
  REALTIME_PROTOCOL_VERSION,
  RealtimeErrorCodes,
  RealtimeSystemEvents,
  type ServerEventEnvelope,
} from '@o2/types';
import {
  assertValidTransition,
  InvalidStateTransitionError,
  isValidTransition,
} from '../src/modules/realtime/transport/connection-state-machine.ts';
import { RealtimeAuth, RealtimeAuthError } from '../src/modules/realtime/services/realtime-auth.ts';
import { RealtimeRateLimiter } from '../src/modules/realtime/services/realtime-rate-limiter.ts';
import { RealtimeServerEngine } from '../src/modules/realtime/services/realtime-server.ts';
import type { RealtimeConnection } from '../src/modules/realtime/transport/realtime-connection.interface.ts';

// Mock connection implementation for unit testing
class MockRealtimeConnection implements RealtimeConnection {
  readonly connectionId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly role: string;
  readonly connectedAt: number;

  state: ConnectionState = 'AUTHENTICATING';
  sequence = 0;
  lastHeartbeatAt: number;

  readonly sentEnvelopes: ServerEventEnvelope[] = [];
  readonly sentErrors: any[] = [];
  disconnected = false;
  disconnectReason?: string;

  constructor(id: string, userId: string, sessionId: string, role = 'PLAYER') {
    this.connectionId = id;
    this.userId = userId;
    this.sessionId = sessionId;
    this.role = role;
    this.connectedAt = Date.now();
    this.lastHeartbeatAt = Date.now();
  }

  setState(nextState: ConnectionState): void {
    assertValidTransition(this.state, nextState);
    this.state = nextState;
  }

  touchHeartbeat(): void {
    this.lastHeartbeatAt = Date.now();
  }

  send<T = unknown>(event: string, payload: T, requestId?: string): ServerEventEnvelope<T> {
    this.sequence += 1;
    const envelope: ServerEventEnvelope<T> = {
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      event,
      requestId,
      sequence: this.sequence,
      serverTimestamp: Date.now(),
      payload,
    };
    this.sentEnvelopes.push(envelope);
    return envelope;
  }

  sendError(code: string, message: string, requestId?: string) {
    const err = {
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      requestId,
      code,
      message,
    };
    this.sentErrors.push(err);
    return err;
  }

  disconnect(reason?: string): void {
    this.disconnected = true;
    this.disconnectReason = reason;
    try {
      this.setState('DISCONNECTING');
    } catch {
      // ignore
    }
  }
}

describe('Phase 6A: Authenticated Realtime Transport Foundation', () => {
  const SECRET = 'dev-jwt-access-secret-min-32-chars-long';

  const makeToken = (payload: object, options?: jwt.SignOptions) =>
    jwt.sign(payload, SECRET, { algorithm: 'HS256', expiresIn: '15m', ...options });

  describe('1. Connection State Machine Transitions', () => {
    it('should validate allowed lifecycle transitions', () => {
      assert.equal(isValidTransition('CONNECTING', 'AUTHENTICATING'), true);
      assert.equal(isValidTransition('AUTHENTICATING', 'CONNECTED'), true);
      assert.equal(isValidTransition('CONNECTED', 'DISCONNECTING'), true);
      assert.equal(isValidTransition('DISCONNECTING', 'DISCONNECTED'), true);
      assert.equal(isValidTransition('CONNECTED', 'DISCONNECTED'), true);
    });

    it('should reject invalid lifecycle transitions', () => {
      assert.equal(isValidTransition('CONNECTED', 'CONNECTING'), false);
      assert.equal(isValidTransition('DISCONNECTED', 'CONNECTED'), false);
      assert.equal(isValidTransition('DISCONNECTING', 'CONNECTED'), false);

      assert.throws(
        () => assertValidTransition('DISCONNECTED', 'CONNECTED'),
        InvalidStateTransitionError,
      );
    });
  });

  describe('2. Realtime Handshake Authentication & Session Verification', () => {
    const mockSessions: Record<string, any> = {
      'sess-active': {
        id: 'sess-active',
        userId: 'usr-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 3600_000),
        user: { role: 'PLAYER', moderationStatus: 'ACTIVE' },
      },
      'sess-revoked': {
        id: 'sess-revoked',
        userId: 'usr-2',
        revokedAt: new Date(Date.now() - 1000),
        expiresAt: new Date(Date.now() + 3600_000),
        user: { role: 'PLAYER', moderationStatus: 'ACTIVE' },
      },
      'sess-expired': {
        id: 'sess-expired',
        userId: 'usr-3',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        user: { role: 'PLAYER', moderationStatus: 'ACTIVE' },
      },
      'sess-banned': {
        id: 'sess-banned',
        userId: 'usr-4',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 3600_000),
        user: { role: 'PLAYER', moderationStatus: 'BANNED' },
      },
    };

    const mockPrisma: any = {
      userSession: {
        findUnique: async ({ where }: any) => mockSessions[where.id] ?? null,
      },
    };

    const mockJwt: any = {
      verify: (token: string, opts: any) => jwt.verify(token, opts.secret),
    };

    const mockConfig: any = {
      get: (key: string) => (key === 'JWT_ACCESS_SECRET' ? SECRET : null),
    };

    const authService = new RealtimeAuth(mockJwt, mockConfig, mockPrisma);

    it('should successfully authenticate valid token and resolve socket identity', async () => {
      const token = makeToken({ sub: 'usr-1', sessionId: 'sess-active' });
      const identity = await authService.authenticateHandshake(token);

      assert.equal(identity.userId, 'usr-1');
      assert.equal(identity.sessionId, 'sess-active');
      assert.equal(identity.role, 'PLAYER');
      assert.ok(identity.connectionId);
    });

    it('should reject missing or empty token', async () => {
      await assert.rejects(
        () => authService.authenticateHandshake(null),
        (err: any) => err.code === RealtimeErrorCodes.UNAUTHORIZED,
      );
      await assert.rejects(
        () => authService.authenticateHandshake('   '),
        (err: any) => err.code === RealtimeErrorCodes.UNAUTHORIZED,
      );
    });

    it('should reject malformed or wrong secret token', async () => {
      await assert.rejects(
        () => authService.authenticateHandshake('not-a-token'),
        (err: any) => err.code === RealtimeErrorCodes.UNAUTHORIZED,
      );

      const badSig = jwt.sign({ sub: 'u', sessionId: 's' }, 'wrong-secret');
      await assert.rejects(
        () => authService.authenticateHandshake(badSig),
        (err: any) => err.code === RealtimeErrorCodes.UNAUTHORIZED,
      );
    });

    it('should reject expired JWT token', async () => {
      const expired = makeToken({ sub: 'usr-1', sessionId: 'sess-active' }, { expiresIn: '-1s' });
      await assert.rejects(
        () => authService.authenticateHandshake(expired),
        (err: any) => err.code === RealtimeErrorCodes.UNAUTHORIZED,
      );
    });

    it('should reject revoked session even if JWT signature is valid', async () => {
      const token = makeToken({ sub: 'usr-2', sessionId: 'sess-revoked' });
      await assert.rejects(
        () => authService.authenticateHandshake(token),
        (err: any) => err.code === RealtimeErrorCodes.SESSION_REVOKED,
      );
    });

    it('should reject expired session record in database', async () => {
      const token = makeToken({ sub: 'usr-3', sessionId: 'sess-expired' });
      await assert.rejects(
        () => authService.authenticateHandshake(token),
        (err: any) => err.code === RealtimeErrorCodes.SESSION_EXPIRED,
      );
    });

    it('should reject banned/suspended user account', async () => {
      const token = makeToken({ sub: 'usr-4', sessionId: 'sess-banned' });
      await assert.rejects(
        () => authService.authenticateHandshake(token),
        (err: any) => err.code === RealtimeErrorCodes.ACCOUNT_RESTRICTED,
      );
    });
  });

  describe('3. Rate Limiting & Payload Protection', () => {
    it('should detect oversized payloads beyond 16KB', () => {
      const limiter = new RealtimeRateLimiter();
      const small = { test: 'hello world' };
      const large = 'a'.repeat(REALTIME_CONSTANTS.MAX_PAYLOAD_BYTES + 100);

      assert.equal(limiter.checkPayloadSize(small), true);
      assert.equal(limiter.checkPayloadSize(large), false);
    });

    it('should throttle events exceeding max limit within window', () => {
      const limiter = new RealtimeRateLimiter();
      const connId = 'conn-throttle-test';
      const now = 1000_000;

      for (let i = 0; i < REALTIME_CONSTANTS.RATE_LIMIT_MAX_EVENTS; i++) {
        const res = limiter.recordEvent(connId, now + i);
        assert.equal(res.allowed, true);
      }

      // 51st event in window should be blocked
      const blocked = limiter.recordEvent(connId, now + 100);
      assert.equal(blocked.allowed, false);

      // After window passes, events allowed again
      const afterWindow = limiter.recordEvent(connId, now + REALTIME_CONSTANTS.RATE_LIMIT_WINDOW_MS + 1);
      assert.equal(afterWindow.allowed, true);
    });

    it('should track malformed payloads and trigger disconnect on threshold', () => {
      const limiter = new RealtimeRateLimiter();
      const connId = 'conn-malformed-test';

      for (let i = 0; i < REALTIME_CONSTANTS.RATE_LIMIT_MAX_MALFORMED - 1; i++) {
        const res = limiter.recordMalformed(connId);
        assert.equal(res.disconnectRequired, false);
      }

      const thresholdRes = limiter.recordMalformed(connId);
      assert.equal(thresholdRes.disconnectRequired, true);
    });
  });

  describe('4. Server Coordination, Envelopes & Correlation', () => {
    it('should assign monotonically increasing sequences per connection', () => {
      const conn = new MockRealtimeConnection('conn-seq', 'u1', 's1');
      assert.equal(conn.sequence, 0);

      const e1 = conn.send('test:event', { a: 1 });
      const e2 = conn.send('test:event', { a: 2 });
      const e3 = conn.send('test:event', { a: 3 });

      assert.equal(e1.sequence, 1);
      assert.equal(e2.sequence, 2);
      assert.equal(e3.sequence, 3);
      assert.equal(conn.sequence, 3);
    });

    it('should emit auth:ready with handshake configuration upon registration', () => {
      const rateLimiter = new RealtimeRateLimiter();
      const server = new RealtimeServerEngine(rateLimiter);
      const conn = new MockRealtimeConnection('conn-reg', 'u1', 's1');

      server.registerConnection(conn);

      assert.equal(conn.state, 'CONNECTED');
      assert.equal(conn.sentEnvelopes.length, 1);
      assert.equal(conn.sentEnvelopes[0].event, RealtimeSystemEvents.HANDSHAKE_READY);
      assert.equal((conn.sentEnvelopes[0].payload as any).connectionId, 'conn-reg');
      assert.equal((conn.sentEnvelopes[0].payload as any).userId, 'u1');
    });

    it('should reject invalid protocol versions with ErrorEnvelope', async () => {
      const rateLimiter = new RealtimeRateLimiter();
      const server = new RealtimeServerEngine(rateLimiter);
      const conn = new MockRealtimeConnection('conn-proto', 'u1', 's1');
      server.registerConnection(conn);

      const badEnvelope: ClientEventEnvelope = {
        protocolVersion: '99.0',
        event: 'test:action',
        requestId: 'req-001',
        payload: {},
      };

      await server.handleClientMessage(conn.connectionId, badEnvelope);

      assert.equal(conn.sentErrors.length, 1);
      assert.equal(conn.sentErrors[0].code, RealtimeErrorCodes.INVALID_PROTOCOL_VERSION);
      assert.equal(conn.sentErrors[0].requestId, 'req-001');
    });

    it('should reject invalid requestId formats', async () => {
      const rateLimiter = new RealtimeRateLimiter();
      const server = new RealtimeServerEngine(rateLimiter);
      const conn = new MockRealtimeConnection('conn-reqid', 'u1', 's1');
      server.registerConnection(conn);

      const invalidReqEnvelope: ClientEventEnvelope = {
        protocolVersion: REALTIME_PROTOCOL_VERSION,
        event: 'test:action',
        requestId: 'invalid space in id!@#',
        payload: {},
      };

      await server.handleClientMessage(conn.connectionId, invalidReqEnvelope);

      assert.equal(conn.sentErrors.length, 1);
      assert.equal(conn.sentErrors[0].code, RealtimeErrorCodes.INVALID_REQUEST_ID);
    });

    it('should reply with system:pong and serverTime upon receiving system:ping', async () => {
      const rateLimiter = new RealtimeRateLimiter();
      const server = new RealtimeServerEngine(rateLimiter);
      const conn = new MockRealtimeConnection('conn-ping', 'u1', 's1');
      server.registerConnection(conn);

      const pingEnvelope: ClientEventEnvelope = {
        protocolVersion: REALTIME_PROTOCOL_VERSION,
        event: RealtimeSystemEvents.PING,
        requestId: 'req-ping-123',
        payload: { clientTime: 123456 },
      };

      await server.handleClientMessage(conn.connectionId, pingEnvelope);

      const pong = conn.sentEnvelopes.find((e) => e.event === RealtimeSystemEvents.PONG);
      assert.ok(pong);
      assert.equal(pong.requestId, 'req-ping-123');
      assert.equal((pong.payload as any).clientTime, 123456);
      assert.ok((pong.payload as any).serverTime > 0);
    });

    it('should handle unknown events cleanly with UNKNOWN_EVENT code without crashing', async () => {
      const rateLimiter = new RealtimeRateLimiter();
      const server = new RealtimeServerEngine(rateLimiter);
      const conn = new MockRealtimeConnection('conn-unknown', 'u1', 's1');
      server.registerConnection(conn);

      const unknownEnvelope: ClientEventEnvelope = {
        protocolVersion: REALTIME_PROTOCOL_VERSION,
        event: 'non_existent_event_name',
        requestId: 'req-unknown-1',
        payload: { something: true },
      };

      await server.handleClientMessage(conn.connectionId, unknownEnvelope);

      assert.equal(conn.sentErrors.length, 1);
      assert.equal(conn.sentErrors[0].code, RealtimeErrorCodes.UNKNOWN_EVENT);
      assert.equal(conn.sentErrors[0].requestId, 'req-unknown-1');
    });

    it('should route registered application events with correlated response envelope', async () => {
      const rateLimiter = new RealtimeRateLimiter();
      const server = new RealtimeServerEngine(rateLimiter);
      const conn = new MockRealtimeConnection('conn-app', 'u1', 's1');
      server.registerConnection(conn);

      server.on('echo:test', (_c, envelope) => {
        return { echoed: envelope.payload };
      });

      const envelope: ClientEventEnvelope = {
        protocolVersion: REALTIME_PROTOCOL_VERSION,
        event: 'echo:test',
        requestId: 'req-echo-99',
        payload: { message: 'hello realtime' },
      };

      await server.handleClientMessage(conn.connectionId, envelope);

      const response = conn.sentEnvelopes.find((e) => e.event === 'echo:test:response');
      assert.ok(response);
      assert.equal(response.requestId, 'req-echo-99');
      assert.deepEqual((response.payload as any).echoed, { message: 'hello realtime' });
    });

    it('should support event listener unsubscription cleanly', async () => {
      const rateLimiter = new RealtimeRateLimiter();
      const server = new RealtimeServerEngine(rateLimiter);
      const conn = new MockRealtimeConnection('conn-unsub', 'u1', 's1');
      server.registerConnection(conn);

      let callCount = 0;
      const unsubscribe = server.on('counter:inc', () => {
        callCount++;
      });

      const envelope: ClientEventEnvelope = {
        protocolVersion: REALTIME_PROTOCOL_VERSION,
        event: 'counter:inc',
        requestId: 'req-inc',
        payload: {},
      };

      await server.handleClientMessage(conn.connectionId, envelope);
      assert.equal(callCount, 1);

      unsubscribe();

      await server.handleClientMessage(conn.connectionId, envelope);
      assert.equal(callCount, 1); // Not called after unsubscribe
    });
  });

  describe('5. Heartbeat Timeout & Disconnection Detection', () => {
    it('should detect stale connections exceeding heartbeat timeout', () => {
      const rateLimiter = new RealtimeRateLimiter();
      const server = new RealtimeServerEngine(rateLimiter);

      const connFresh = new MockRealtimeConnection('conn-fresh', 'u1', 's1');
      const connStale = new MockRealtimeConnection('conn-stale', 'u2', 's2');

      server.registerConnection(connFresh);
      server.registerConnection(connStale);

      // Artificially age connStale heartbeat beyond 45s timeout
      const now = Date.now();
      connStale.lastHeartbeatAt = now - (REALTIME_CONSTANTS.HEARTBEAT_TIMEOUT_MS + 1000);
      connFresh.lastHeartbeatAt = now - 5000;

      const timedOut = server.checkHeartbeats(now);

      assert.equal(timedOut.length, 1);
      assert.equal(timedOut[0], 'conn-stale');
      assert.equal(connStale.disconnected, true);
      assert.equal(connStale.disconnectReason, 'HEARTBEAT_TIMEOUT');
      assert.equal(server.getConnection('conn-stale'), undefined);
      assert.ok(server.getConnection('conn-fresh'));
    });
  });

  describe('6. Multi-Device Concurrency & User Targeting', () => {
    it('should support multiple independent connections for the same user concurrently', () => {
      const rateLimiter = new RealtimeRateLimiter();
      const server = new RealtimeServerEngine(rateLimiter);

      const device1 = new MockRealtimeConnection('conn-dev-1', 'usr-multi', 'sess-1');
      const device2 = new MockRealtimeConnection('conn-dev-2', 'usr-multi', 'sess-2');

      server.registerConnection(device1);
      server.registerConnection(device2);

      const userConns = server.getConnectionsByUserId('usr-multi');
      assert.equal(userConns.length, 2);

      // Sending to user sends to both independent connections
      server.sendToUser('usr-multi', 'user:notification', { alert: 'hello devices' });

      const env1 = device1.sentEnvelopes.find((e) => e.event === 'user:notification');
      const env2 = device2.sentEnvelopes.find((e) => e.event === 'user:notification');

      assert.ok(env1);
      assert.ok(env2);
      assert.equal((env1.payload as any).alert, 'hello devices');
      assert.equal((env2.payload as any).alert, 'hello devices');

      // Disconnecting one device does not affect the other
      server.removeConnection('conn-dev-1');
      assert.equal(server.getConnectionsByUserId('usr-multi').length, 1);
      assert.equal(server.getConnectionsByUserId('usr-multi')[0].connectionId, 'conn-dev-2');
    });
  });
});
