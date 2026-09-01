import type { ClientEventEnvelope } from '@o2/types';
import type { RealtimeConnection } from './realtime-connection.interface';

export type RealtimeEventHandler<T = unknown, R = unknown> = (
  connection: RealtimeConnection,
  envelope: ClientEventEnvelope<T>,
) => Promise<R | void> | R | void;

export interface RealtimeServer {
  registerConnection(connection: RealtimeConnection): void;
  removeConnection(connectionId: string, reason?: string): void;
  getConnection(connectionId: string): RealtimeConnection | undefined;
  getConnectionsByUserId(userId: string): RealtimeConnection[];
  getAllConnections(): RealtimeConnection[];
  on(event: string, handler: RealtimeEventHandler): () => void;
  broadcast<T>(event: string, payload: T): void;
  sendToUser<T>(userId: string, event: string, payload: T): void;
  handleClientMessage(connectionId: string, rawData: unknown): Promise<void>;
  checkHeartbeats(now?: number): string[];
}
