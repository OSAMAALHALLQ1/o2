import { Socket } from 'socket.io';
import {
  ConnectionState,
  ErrorEnvelope,
  REALTIME_PROTOCOL_VERSION,
  RealtimeErrorCode,
  RealtimeSystemEvents,
  ServerEventEnvelope,
} from '@o2/types';
import {
  AuthenticatedSocketIdentity,
  RealtimeConnection,
} from '../transport/realtime-connection.interface';
import { assertValidTransition } from '../transport/connection-state-machine';

export class SocketIoRealtimeConnection implements RealtimeConnection {
  readonly connectionId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly role: string;
  readonly connectedAt: number;

  private readonly socket: Socket;
  private _state: ConnectionState = 'AUTHENTICATING';
  private _sequence = 0;
  private _lastHeartbeatAt: number;

  constructor(
    socket: Socket,
    identity: AuthenticatedSocketIdentity,
  ) {
    this.socket = socket;
    this.connectionId = identity.connectionId;
    this.userId = identity.userId;
    this.sessionId = identity.sessionId;
    this.role = identity.role;
    this.connectedAt = Date.now();
    this._lastHeartbeatAt = Date.now();
  }

  get state(): ConnectionState {
    return this._state;
  }

  get sequence(): number {
    return this._sequence;
  }

  get lastHeartbeatAt(): number {
    return this._lastHeartbeatAt;
  }

  setState(nextState: ConnectionState): void {
    assertValidTransition(this._state, nextState);
    this._state = nextState;
  }

  touchHeartbeat(): void {
    this._lastHeartbeatAt = Date.now();
  }

  send<T = unknown>(
    event: string,
    payload: T,
    requestId?: string,
  ): ServerEventEnvelope<T> {
    this._sequence += 1;
    const envelope: ServerEventEnvelope<T> = {
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      event,
      requestId,
      sequence: this._sequence,
      serverTimestamp: Date.now(),
      payload,
    };

    // Emit both on the specific event channel and generic message channel for maximum client flexibility
    this.socket.emit(event, envelope);
    this.socket.emit('message', envelope);

    return envelope;
  }

  sendError(
    code: RealtimeErrorCode | string,
    message: string,
    requestId?: string,
  ): ErrorEnvelope {
    const errorEnvelope: ErrorEnvelope = {
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      requestId,
      code,
      message,
    };

    this.socket.emit(RealtimeSystemEvents.ERROR, errorEnvelope);
    this.socket.emit('message', errorEnvelope);

    return errorEnvelope;
  }

  disconnect(_reason?: string): void {
    try {
      this.setState('DISCONNECTING');
    } catch {
      // ignore state transition if already disconnecting
    }
    this.socket.disconnect(true);
  }
}
