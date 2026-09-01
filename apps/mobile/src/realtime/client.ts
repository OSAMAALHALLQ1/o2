import { io, Socket } from 'socket.io-client';
import {
  ClientEventEnvelope,
  ConnectionState,
  ErrorEnvelope,
  HandshakeReadyPayload,
  HeartbeatPayload,
  REALTIME_PROTOCOL_VERSION,
  RealtimeSystemEvents,
  ServerEventEnvelope,
} from '@o2/types';

export interface RealtimeClientConfig {
  url?: string;
  heartbeatIntervalMs?: number;
  requestTimeoutMs?: number;
}

export type RealtimeListener = (envelope: ServerEventEnvelope) => void;
export type RealtimeErrorListener = (error: ErrorEnvelope) => void;
export type RealtimeStateListener = (state: ConnectionState) => void;

export class RealtimeClient {
  private socket: Socket | null = null;
  private state: ConnectionState = 'DISCONNECTED';
  private connectionId: string | null = null;
  private userId: string | null = null;
  private sessionId: string | null = null;

  private readonly listeners = new Map<string, Set<RealtimeListener>>();
  private readonly errorListeners = new Set<RealtimeErrorListener>();
  private readonly stateListeners = new Set<RealtimeStateListener>();
  private readonly pendingRequests = new Map<
    string,
    {
      resolve: (value: ServerEventEnvelope<any>) => void;
      reject: (reason: any) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatIntervalMs = 15_000;
  private requestTimeoutMs = 10_000;

  constructor(private readonly config: RealtimeClientConfig = {}) {
    if (config.heartbeatIntervalMs) {
      this.heartbeatIntervalMs = config.heartbeatIntervalMs;
    }
    if (config.requestTimeoutMs) {
      this.requestTimeoutMs = config.requestTimeoutMs;
    }
  }

  getConnectionState(): ConnectionState {
    return this.state;
  }

  getConnectionId(): string | null {
    return this.connectionId;
  }

  getUserId(): string | null {
    return this.userId;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  connect(token: string): Promise<HandshakeReadyPayload> {
    if (this.socket && (this.state === 'CONNECTED' || this.state === 'AUTHENTICATING')) {
      return Promise.reject(new Error('Realtime client is already connected or authenticating'));
    }

    this.updateState('CONNECTING');

    const defaultUrl = process.env.EXPO_PUBLIC_WS_URL || process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';
    const serverUrl = this.config.url || defaultUrl;

    return new Promise((resolve, reject) => {
      let settled = false;

      this.socket = io(serverUrl, {
        transports: ['websocket'],
        auth: { token },
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', () => {
        this.updateState('AUTHENTICATING');
      });

      this.socket.on(RealtimeSystemEvents.HANDSHAKE_READY, (envelope: ServerEventEnvelope<HandshakeReadyPayload>) => {
        if (!settled) {
          settled = true;
          this.connectionId = envelope.payload.connectionId;
          this.userId = envelope.payload.userId;
          this.sessionId = envelope.payload.sessionId;
          if (envelope.payload.heartbeatIntervalMs) {
            this.heartbeatIntervalMs = envelope.payload.heartbeatIntervalMs;
          }
          this.updateState('CONNECTED');
          this.startHeartbeat();
          resolve(envelope.payload);
        }
      });

      this.socket.on(RealtimeSystemEvents.ERROR, (error: ErrorEnvelope) => {
        this.notifyErrorListeners(error);
        if (!settled && this.state !== 'CONNECTED') {
          settled = true;
          this.disconnect();
          reject(new Error(error.message || error.code));
        }
      });

      this.socket.on('message', (envelope: ServerEventEnvelope | ErrorEnvelope) => {
        this.handleIncomingEnvelope(envelope);
      });

      this.socket.onAny((event: string, envelope: ServerEventEnvelope) => {
        if (event !== 'message' && event !== 'connect' && event !== 'disconnect' && event !== RealtimeSystemEvents.ERROR) {
          this.notifyEventListeners(event, envelope);
        }
      });

      this.socket.on('disconnect', () => {
        this.stopHeartbeat();
        this.rejectAllPendingRequests(new Error('Connection lost'));
        this.updateState('DISCONNECTED');
      });

      this.socket.on('connect_error', (err) => {
        if (!settled) {
          settled = true;
          this.updateState('DISCONNECTED');
          reject(err);
        }
      });

      this.socket.connect();
    });
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.rejectAllPendingRequests(new Error('Client explicitly disconnected'));
    if (this.socket) {
      this.updateState('DISCONNECTING');
      this.socket.disconnect();
      this.socket = null;
    }
    this.connectionId = null;
    this.userId = null;
    this.sessionId = null;
    this.updateState('DISCONNECTED');
  }

  send<TPayload = unknown, TResponse = unknown>(
    event: string,
    payload: TPayload,
    timeoutMs = this.requestTimeoutMs,
  ): Promise<ServerEventEnvelope<TResponse>> {
    if (this.state !== 'CONNECTED' || !this.socket) {
      return Promise.reject(new Error('Cannot send message: Realtime client is not connected'));
    }

    const requestId = this.generateRequestId();

    const envelope: ClientEventEnvelope<TPayload> = {
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      event,
      requestId,
      payload,
    };

    return new Promise<ServerEventEnvelope<TResponse>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Realtime request timed out after ${timeoutMs}ms (event: ${event})`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve: resolve as any,
        reject,
        timer,
      });

      this.socket!.emit('action', envelope);
    });
  }

  sendOneWay<TPayload = unknown>(event: string, payload: TPayload): void {
    if (this.state !== 'CONNECTED' || !this.socket) return;
    const envelope: ClientEventEnvelope<TPayload> = {
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      event,
      requestId: this.generateRequestId(),
      payload,
    };
    this.socket.emit('action', envelope);
  }

  on(event: string, listener: RealtimeListener): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);

    return () => this.off(event, listener);
  }

  off(event: string, listener: RealtimeListener): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  onStateChange(listener: RealtimeStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  onError(listener: RealtimeErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  private handleIncomingEnvelope(envelope: ServerEventEnvelope | ErrorEnvelope): void {
    if ('code' in envelope && 'message' in envelope) {
      // Error envelope
      if (envelope.requestId && this.pendingRequests.has(envelope.requestId)) {
        const pending = this.pendingRequests.get(envelope.requestId)!;
        clearTimeout(pending.timer);
        this.pendingRequests.delete(envelope.requestId);
        pending.reject(new Error(envelope.message || envelope.code));
      }
      this.notifyErrorListeners(envelope as ErrorEnvelope);
      return;
    }

    const serverEnvelope = envelope as ServerEventEnvelope;

    // Check request correlation
    if (serverEnvelope.requestId && this.pendingRequests.has(serverEnvelope.requestId)) {
      const pending = this.pendingRequests.get(serverEnvelope.requestId)!;
      clearTimeout(pending.timer);
      this.pendingRequests.delete(serverEnvelope.requestId);
      pending.resolve(serverEnvelope);
    }

    this.notifyEventListeners(serverEnvelope.event, serverEnvelope);
  }

  private notifyEventListeners(event: string, envelope: ServerEventEnvelope): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        try {
          listener(envelope);
        } catch (err) {
          console.error(`Listener error for event ${event}`, err);
        }
      }
    }
  }

  private notifyErrorListeners(error: ErrorEnvelope): void {
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch (err) {
        console.error('Error listener crashed', err);
      }
    }
  }

  private updateState(newState: ConnectionState): void {
    if (this.state === newState) return;
    this.state = newState;
    for (const listener of this.stateListeners) {
      try {
        listener(newState);
      } catch (err) {
        console.error('State listener crashed', err);
      }
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.state === 'CONNECTED' && this.socket) {
        const pingEnvelope: ClientEventEnvelope<HeartbeatPayload> = {
          protocolVersion: REALTIME_PROTOCOL_VERSION,
          event: RealtimeSystemEvents.PING,
          requestId: this.generateRequestId(),
          payload: { clientTime: Date.now(), serverTime: 0 },
        };
        this.socket.emit('action', pingEnvelope);
      }
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private rejectAllPendingRequests(reason: Error): void {
    for (const [, req] of this.pendingRequests.entries()) {
      clearTimeout(req.timer);
      req.reject(reason);
    }
    this.pendingRequests.clear();
  }

  private generateRequestId(): string {
    const rand = Math.random().toString(36).substring(2, 9);
    return `req_${Date.now()}_${rand}`;
  }
}

export const realtimeClient = new RealtimeClient();
