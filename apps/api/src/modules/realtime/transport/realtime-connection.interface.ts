import type {
  ConnectionState,
  ErrorEnvelope,
  RealtimeErrorCode,
  ServerEventEnvelope,
} from '@o2/types';

export interface AuthenticatedSocketIdentity {
  connectionId: string;
  userId: string;
  sessionId: string;
  role: string;
}

export interface RealtimeConnection {
  readonly connectionId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly role: string;
  readonly state: ConnectionState;
  readonly sequence: number;
  readonly lastHeartbeatAt: number;
  readonly connectedAt: number;

  setState(nextState: ConnectionState): void;
  send<T = unknown>(
    event: string,
    payload: T,
    requestId?: string,
  ): ServerEventEnvelope<T>;
  sendError(
    code: RealtimeErrorCode | string,
    message: string,
    requestId?: string,
  ): ErrorEnvelope;
  disconnect(reason?: string): void;
  touchHeartbeat(): void;
}
