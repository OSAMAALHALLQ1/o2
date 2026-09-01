import { io, Socket } from 'socket.io-client';
import {
  ClientEventEnvelope,
  ConnectionState,
  ErrorEnvelope,
  HandshakeReadyPayload,
  HeartbeatPayload,
  REALTIME_PROTOCOL_VERSION,
  RECOVERY_CONSTANTS,
  RealtimeConnectionLifecycleState,
  RealtimeSystemEvents,
  ServerEventEnvelope,
} from '@o2/types';

export interface RealtimeClientConfig {
  url?: string;
  heartbeatIntervalMs?: number;
  requestTimeoutMs?: number;
  autoReconnect?: boolean;
}

export type RealtimeListener = (envelope: ServerEventEnvelope) => void;
export type RealtimeErrorListener = (error: ErrorEnvelope) => void;
export type RealtimeStateListener = (state: ConnectionState) => void;
export type RealtimeLifecycleListener = (state: RealtimeConnectionLifecycleState) => void;

export interface SendOptions {
  timeoutMs?: number;
  retrySafe?: boolean;
}

export class RealtimeClient {
  private socket: Socket | null = null;
  private state: ConnectionState = 'DISCONNECTED';
  private lifecycleState: RealtimeConnectionLifecycleState = 'DISCONNECTED';
  private connectionId: string | null = null;
  private userId: string | null = null;
  private sessionId: string | null = null;

  private readonly listeners = new Map<string, Set<RealtimeListener>>();
  private readonly errorListeners = new Set<RealtimeErrorListener>();
  private readonly stateListeners = new Set<RealtimeStateListener>();
  private readonly lifecycleListeners = new Set<RealtimeLifecycleListener>();
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

  // Recovery & Backoff
  private isAutoReconnectEnabled = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private tokenProvider: (() => Promise<string | null>) | null = null;
  private resyncHandler: (() => Promise<void>) | null = null;

  constructor(private readonly config: RealtimeClientConfig = {}) {
    if (config.heartbeatIntervalMs) {
      this.heartbeatIntervalMs = config.heartbeatIntervalMs;
    }
    if (config.requestTimeoutMs) {
      this.requestTimeoutMs = config.requestTimeoutMs;
    }
    if (config.autoReconnect !== undefined) {
      this.isAutoReconnectEnabled = config.autoReconnect;
    }
  }

  getConnectionState(): ConnectionState {
    return this.state;
  }

  getLifecycleState(): RealtimeConnectionLifecycleState {
    return this.lifecycleState;
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

  setTokenProvider(provider: () => Promise<string | null>): void {
    this.tokenProvider = provider;
  }

  setResyncHandler(handler: () => Promise<void>): void {
    this.resyncHandler = handler;
  }

  calculateBackoffDelay(attempt: number): number {
    const base = RECOVERY_CONSTANTS.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
    const capped = Math.min(base, RECOVERY_CONSTANTS.MAX_RETRY_DELAY_MS);
    const jitterRange = capped * RECOVERY_CONSTANTS.JITTER_FACTOR;
    const jitter = (Math.random() * 2 - 1) * jitterRange;
    return Math.max(0, Math.round(capped + jitter));
  }

  connect(token: string): Promise<HandshakeReadyPayload> {
    if (this.socket && (this.state === 'CONNECTED' || this.state === 'AUTHENTICATING')) {
      return Promise.reject(new Error('Realtime client is already connected or authenticating'));
    }

    this.updateState('CONNECTING');
    this.updateLifecycleState('CONNECTING');

    const defaultUrl = process.env.EXPO_PUBLIC_WS_URL || process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';
    const serverUrl = this.config.url || defaultUrl;

    return new Promise((resolve, reject) => {
      let settled = false;

      this.socket = io(serverUrl, {
        transports: ['websocket'],
        auth: { token },
        autoConnect: false,
        reconnection: false, // Managed manually via exponential backoff
      });

      this.socket.on('connect', () => {
        this.updateState('AUTHENTICATING');
        this.updateLifecycleState('AUTHENTICATING');
      });

      this.socket.on(RealtimeSystemEvents.HANDSHAKE_READY, async (envelope: ServerEventEnvelope<HandshakeReadyPayload>) => {
        if (!settled) {
          settled = true;
          this.connectionId = envelope.payload.connectionId;
          this.userId = envelope.payload.userId;
          this.sessionId = envelope.payload.sessionId;
          if (envelope.payload.heartbeatIntervalMs) {
            this.heartbeatIntervalMs = envelope.payload.heartbeatIntervalMs;
          }
          this.reconnectAttempt = 0;
          this.updateState('CONNECTED');
          this.updateLifecycleState('CONNECTED');
          this.startHeartbeat();

          // If a resync handler is registered, execute authoritative recovery
          if (this.resyncHandler) {
            this.updateLifecycleState('RESYNCING');
            try {
              await this.resyncHandler();
            } catch (err) {
              console.warn('Realtime client resync handler warning:', err);
            }
          }
          this.updateLifecycleState('READY');
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
        this.updateLifecycleState('DISCONNECTED');

        if (this.isAutoReconnectEnabled) {
          this.scheduleReconnect();
        }
      });

      this.socket.on('connect_error', (err) => {
        if (!settled) {
          settled = true;
          this.updateState('DISCONNECTED');
          this.updateLifecycleState('DISCONNECTED');
          reject(err);

          if (this.isAutoReconnectEnabled) {
            this.scheduleReconnect();
          }
        }
      });

      this.socket.connect();
    });
  }

  private scheduleReconnect(): void {
    if (!this.isAutoReconnectEnabled || this.reconnectTimer) return;

    this.updateLifecycleState('CONNECTING');
    const delay = this.calculateBackoffDelay(this.reconnectAttempt);
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        const token = this.tokenProvider ? await this.tokenProvider() : null;
        if (!token) {
          this.updateLifecycleState('FAILED');
          return;
        }
        await this.connect(token);
      } catch {
        // Retry next attempt with bounded backoff
        this.scheduleReconnect();
      }
    }, delay);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
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
    this.updateLifecycleState('DISCONNECTED');
  }

  async send<TPayload = unknown, TResponse = unknown>(
    event: string,
    payload: TPayload,
    options?: SendOptions | number,
  ): Promise<ServerEventEnvelope<TResponse>> {
    const opts: SendOptions = typeof options === 'number' ? { timeoutMs: options } : options || {};
    const timeoutMs = opts.timeoutMs ?? this.requestTimeoutMs;
    const retrySafe = opts.retrySafe ?? false;

    if (this.state !== 'CONNECTED' || !this.socket) {
      return Promise.reject(new Error('Cannot send message: Realtime client is not connected'));
    }

    const executeSend = (): Promise<ServerEventEnvelope<TResponse>> => {
      return new Promise((resolve, reject) => {
        const requestId = this.generateRequestId();
        const envelope: ClientEventEnvelope<TPayload> = {
          protocolVersion: REALTIME_PROTOCOL_VERSION,
          event,
          requestId,
          payload,
        };

        const timer = setTimeout(() => {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Realtime request timed out after ${timeoutMs}ms (event: ${event})`));
        }, timeoutMs);

        this.pendingRequests.set(requestId, {
          resolve,
          reject,
          timer,
        });

        this.socket!.emit('message', envelope);
      });
    };

    try {
      return await executeSend();
    } catch (err) {
      // Retry once only if the action is explicitly retrySafe
      if (retrySafe && this.state === 'CONNECTED') {
        return await executeSend();
      }
      throw err;
    }
  }

  emit<TPayload = unknown>(event: string, payload: TPayload): void {
    if (this.state !== 'CONNECTED' || !this.socket) {
      return;
    }

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

  onLifecycleStateChange(listener: RealtimeLifecycleListener): () => void {
    this.lifecycleListeners.add(listener);
    listener(this.lifecycleState);
    return () => {
      this.lifecycleListeners.delete(listener);
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
        console.error('Error listener threw an error', err);
      }
    }
  }

  private updateState(nextState: ConnectionState): void {
    if (this.state === nextState) return;
    this.state = nextState;
    for (const listener of this.stateListeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('State listener error', err);
      }
    }
  }

  private updateLifecycleState(nextState: RealtimeConnectionLifecycleState): void {
    if (this.lifecycleState === nextState) return;
    this.lifecycleState = nextState;
    for (const listener of this.lifecycleListeners) {
      try {
        listener(this.lifecycleState);
      } catch (err) {
        console.error('Lifecycle listener error', err);
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
        this.socket.emit('message', pingEnvelope);
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
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(reason);
    }
    this.pendingRequests.clear();
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
