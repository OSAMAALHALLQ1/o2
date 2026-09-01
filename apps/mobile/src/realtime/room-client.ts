import type {
  PlayerRoomProjection,
  PublicRoomProjection,
  RoomGameMode,
} from '@o2/types';
import { RoomSystemEvents } from '@o2/types';
import type { RealtimeClient } from './client';

export class MobileRoomClient {
  private readonly client: RealtimeClient;

  constructor(client: RealtimeClient) {
    this.client = client;
  }

  async createRoom(
    gameMode: RoomGameMode,
    customCapacity?: number,
  ): Promise<PublicRoomProjection> {
    const envelope = await this.client.send<
      { gameMode: RoomGameMode; customCapacity?: number },
      PublicRoomProjection
    >('room:create', { gameMode, customCapacity });
    return envelope.payload;
  }

  async joinRoom(roomId: string): Promise<PlayerRoomProjection> {
    const envelope = await this.client.send<{ roomId: string }, PlayerRoomProjection>(
      'room:join',
      { roomId },
    );
    return envelope.payload;
  }

  async leaveRoom(
    roomId: string,
  ): Promise<{ left: boolean; roomClosed: boolean }> {
    const envelope = await this.client.send<
      { roomId: string },
      { left: boolean; roomClosed: boolean }
    >('room:leave', { roomId });
    return envelope.payload;
  }

  async sendRoomAction<T = unknown, R = unknown>(
    roomId: string,
    type: string,
    payload: T,
    actionId?: string,
  ): Promise<R> {
    const envelope = await this.client.send<
      { roomId: string; type: string; payload: T; actionId?: string },
      R
    >('room:action', { roomId, type, payload, actionId });
    return envelope.payload;
  }

  onRoomState(handler: (data: { version: number; publicProjection: PublicRoomProjection }) => void): () => void {
    return this.client.on(RoomSystemEvents.STATE_SYNC, (envelope) => {
      handler(envelope.payload as any);
    });
  }

  onPlayerJoined(handler: (data: { joinedUser: any; roomProjection: PublicRoomProjection }) => void): () => void {
    return this.client.on(RoomSystemEvents.PLAYER_JOINED, (envelope) => {
      handler(envelope.payload as any);
    });
  }

  onPlayerLeft(handler: (data: { leftUser: any; roomProjection: PublicRoomProjection }) => void): () => void {
    return this.client.on(RoomSystemEvents.PLAYER_LEFT, (envelope) => {
      handler(envelope.payload as any);
    });
  }

  onRoomClosed(handler: (data: { roomId: string; reason: string; closedAt: number }) => void): () => void {
    return this.client.on(RoomSystemEvents.ROOM_CLOSED, (envelope) => {
      handler(envelope.payload as any);
    });
  }
}
