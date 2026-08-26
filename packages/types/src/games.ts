export type GameSlug =
  | 'mafia'
  | 'atrash'
  | 'tarneeb'
  | 'hide_seek'
  | 'imposter_sabotage'
  | 'imposter_classic';

export interface GameDefinitionDto {
  slug: GameSlug;
  nameKey: string;
  minPlayers: number;
  maxPlayers: number;
  publicMatchCount: number;
  descriptionKey: string;
  badge?: string;
  isAvailable: boolean;
}

export type RoomStatus = 'WAITING' | 'IN_PROGRESS' | 'FINISHED' | 'ABANDONED';

export interface BaseRoomParticipantDto {
  userId: string;
  username: string;
  displayName: string;
  characterSlug: string;
  equippedFrameSlug?: string;
  slotIndex: number;
  isReady: boolean;
  isSpectator: boolean;
}

export interface MaskedGameStateProjection<TData = any> {
  roomCode: string;
  gameSlug: GameSlug;
  status: RoomStatus;
  participants: BaseRoomParticipantDto[];
  currentPhase: string;
  timeRemainingSeconds?: number;
  lastAppliedActionSeq: number;
  serverTimestamp: number;
  projectionData: TData;
}
