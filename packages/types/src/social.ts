export type PresenceStatus = 'OFFLINE' | 'ONLINE' | 'IN_PARTY' | 'IN_MATCH';

export interface FriendSummaryDto {
  userId: string;
  username: string;
  displayName: string;
  characterSlug: string;
  presence: PresenceStatus;
  currentActivity?: string;
}

export interface PartyMemberDto {
  userId: string;
  username: string;
  displayName: string;
  characterSlug: string;
  equippedCosmetics?: {
    outfitSlug?: string;
    hatSlug?: string;
  };
  isLeader: boolean;
  isReady: boolean;
}

export interface PartySummaryDto {
  partyId: string;
  roomCode: string;
  leaderId: string;
  selectedGameSlug?: string;
  members: PartyMemberDto[];
}
