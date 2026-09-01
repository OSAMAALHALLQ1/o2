import {
  type ClientEventEnvelope,
  REALTIME_CONSTANTS,
  REALTIME_PROTOCOL_VERSION,
  RealtimeErrorCodes,
  RealtimeSystemEvents,
} from '@o2/types';
import type {
  RealtimeEventHandler,
  RealtimeServer,
} from '../transport/realtime-server.interface';
import type { RealtimeConnection } from '../transport/realtime-connection.interface';

export interface IRealtimeRateLimiter {
  checkPayloadSize(rawPayload: unknown): boolean;
  recordEvent(
    connectionId: string,
    now?: number,
  ): { allowed: boolean; remaining: number };
  recordMalformed(
    connectionId: string,
    now?: number,
  ): { disconnectRequired: boolean };
  cleanup(connectionId: string): void;
}

export class RealtimeServerEngine implements RealtimeServer {
  private readonly connections = new Map<string, RealtimeConnection>();
  private readonly userConnections = new Map<string, Set<string>>();
  private readonly handlers = new Map<string, RealtimeEventHandler[]>();
  private readonly rateLimiter: IRealtimeRateLimiter;

  constructor(rateLimiter: IRealtimeRateLimiter) {
    this.rateLimiter = rateLimiter;
  }

  registerConnection(connection: RealtimeConnection): void {
    connection.setState('CONNECTED');
    this.connections.set(connection.connectionId, connection);

    let userConns = this.userConnections.get(connection.userId);
    if (!userConns) {
      userConns = new Set();
      this.userConnections.set(connection.userId, userConns);
    }
    userConns.add(connection.connectionId);

    connection.touchHeartbeat();

    // Emit handshake ready envelope to newly connected client
    connection.send(RealtimeSystemEvents.HANDSHAKE_READY, {
      connectionId: connection.connectionId,
      userId: connection.userId,
      sessionId: connection.sessionId,
      serverTime: Date.now(),
      heartbeatIntervalMs: REALTIME_CONSTANTS.HEARTBEAT_INTERVAL_MS,
      heartbeatTimeoutMs: REALTIME_CONSTANTS.HEARTBEAT_TIMEOUT_MS,
    });
  }

  removeConnection(connectionId: string, _reason?: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      connection.setState('DISCONNECTING');
    } catch {
      // ignore transition error during cleanup
    }

    try {
      connection.setState('DISCONNECTED');
    } catch {
      // ignore transition error during cleanup
    }

    this.connections.delete(connectionId);

    const userConns = this.userConnections.get(connection.userId);
    if (userConns) {
      userConns.delete(connectionId);
      if (userConns.size === 0) {
        this.userConnections.delete(connection.userId);
      }
    }

    this.rateLimiter.cleanup(connectionId);
  }

  getConnection(connectionId: string): RealtimeConnection | undefined {
    return this.connections.get(connectionId);
  }

  getConnectionsByUserId(userId: string): RealtimeConnection[] {
    const connIds = this.userConnections.get(userId);
    if (!connIds) return [];
    const conns: RealtimeConnection[] = [];
    for (const id of connIds) {
      const conn = this.connections.get(id);
      if (conn) conns.push(conn);
    }
    return conns;
  }

  getAllConnections(): RealtimeConnection[] {
    return Array.from(this.connections.values());
  }

  on(event: string, handler: RealtimeEventHandler): () => void {
    let list = this.handlers.get(event);
    if (!list) {
      list = [];
      this.handlers.set(event, list);
    }
    list.push(handler);

    return () => {
      const current = this.handlers.get(event);
      if (current) {
        const index = current.indexOf(handler);
        if (index >= 0) current.splice(index, 1);
        if (current.length === 0) this.handlers.delete(event);
      }
    };
  }

  broadcast<T>(event: string, payload: T): void {
    for (const conn of this.connections.values()) {
      if (conn.state === 'CONNECTED') {
        try {
          conn.send(event, payload);
        } catch {
          // safe drop on connection error
        }
      }
    }
  }

  sendToUser<T>(userId: string, event: string, payload: T): void {
    const conns = this.getConnectionsByUserId(userId);
    for (const conn of conns) {
      if (conn.state === 'CONNECTED') {
        try {
          conn.send(event, payload);
        } catch {
          // safe drop on connection error
        }
      }
    }
  }

  async handleClientMessage(connectionId: string, rawData: unknown): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.state !== 'CONNECTED') return;

    // 1. Check payload byte size
    if (!this.rateLimiter.checkPayloadSize(rawData)) {
      connection.sendError(
        RealtimeErrorCodes.PAYLOAD_TOO_LARGE,
        'حجم الرسالة يتجاوز الحد المسموح به',
      );
      return;
    }

    // 2. Check rate limit
    const rateCheck = this.rateLimiter.recordEvent(connectionId);
    if (!rateCheck.allowed) {
      connection.sendError(
        RealtimeErrorCodes.RATE_LIMIT_EXCEEDED,
        'تم تجاوز معدل إرسال الرسائل المسموح به',
      );
      return;
    }

    // 3. Envelope structural validation
    if (!this.isRawEnvelope(rawData)) {
      const { disconnectRequired } = this.rateLimiter.recordMalformed(connectionId);
      connection.sendError(
        RealtimeErrorCodes.MALFORMED_ENVELOPE,
        'بنية الرسالة غير صالحة',
      );
      if (disconnectRequired) {
        connection.disconnect('EXCESSIVE_MALFORMED_FRAMES');
        this.removeConnection(connectionId, 'EXCESSIVE_MALFORMED_FRAMES');
      }
      return;
    }

    const envelope = rawData as ClientEventEnvelope;

    // 4. Protocol version validation
    if (envelope.protocolVersion !== REALTIME_PROTOCOL_VERSION) {
      connection.sendError(
        RealtimeErrorCodes.INVALID_PROTOCOL_VERSION,
        `إصدار البروتوكول غير مدعوم: ${envelope.protocolVersion}`,
        envelope.requestId,
      );
      return;
    }

    // 5. RequestId validation
    if (
      typeof envelope.requestId !== 'string' ||
      envelope.requestId.length === 0 ||
      envelope.requestId.length > REALTIME_CONSTANTS.MAX_REQUEST_ID_LENGTH ||
      !REALTIME_CONSTANTS.REQUEST_ID_REGEX.test(envelope.requestId)
    ) {
      connection.sendError(
        RealtimeErrorCodes.INVALID_REQUEST_ID,
        'معرف الطلب غير صالح',
        typeof envelope.requestId === 'string' && envelope.requestId.length <= 64
          ? envelope.requestId
          : undefined,
      );
      return;
    }

    // 6. Handle built-in system heartbeat ping
    if (envelope.event === RealtimeSystemEvents.PING) {
      connection.touchHeartbeat();
      connection.send(
        RealtimeSystemEvents.PONG,
        {
          clientTime: (envelope.payload as any)?.clientTime,
          serverTime: Date.now(),
        },
        envelope.requestId,
      );
      return;
    }

    // 7. Route to registered application handlers
    const handlers = this.handlers.get(envelope.event);
    if (!handlers || handlers.length === 0) {
      connection.sendError(
        RealtimeErrorCodes.UNKNOWN_EVENT,
        `حدث غير معروف: ${envelope.event}`,
        envelope.requestId,
      );
      return;
    }

    for (const handler of handlers) {
      try {
        const result = await handler(connection, envelope);
        if (result !== undefined) {
          connection.send(
            `${envelope.event}:response`,
            result,
            envelope.requestId,
          );
        }
      } catch {
        connection.sendError(
          RealtimeErrorCodes.INTERNAL_ERROR,
          'حدث خطأ داخلي أثناء معالجة الطلب',
          envelope.requestId,
        );
      }
    }
  }

  checkHeartbeats(now = Date.now()): string[] {
    const timedOut: string[] = [];
    for (const [connectionId, conn] of this.connections.entries()) {
      if (conn.state !== 'CONNECTED') continue;
      if (now - conn.lastHeartbeatAt > REALTIME_CONSTANTS.HEARTBEAT_TIMEOUT_MS) {
        timedOut.push(connectionId);
        try {
          conn.sendError(
            RealtimeErrorCodes.HEARTBEAT_TIMEOUT,
            'انتهت مهلة نبضات الاتصال (Heartbeat Timeout)',
          );
          conn.disconnect('HEARTBEAT_TIMEOUT');
        } catch {
          // ignore disconnect error
        }
        this.removeConnection(connectionId, 'HEARTBEAT_TIMEOUT');
      }
    }
    return timedOut;
  }

  private isRawEnvelope(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const record = obj as Record<string, unknown>;
    return (
      typeof record.protocolVersion === 'string' &&
      typeof record.event === 'string' &&
      typeof record.requestId === 'string' &&
      'payload' in record
    );
  }
}
