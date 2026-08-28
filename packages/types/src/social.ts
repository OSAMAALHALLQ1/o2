export type PresenceStatus = 'ACTIVE_RECENTLY' | 'IN_PARTY' | 'INACTIVE';
export type FriendshipState = 'NONE' | 'PENDING_INCOMING' | 'PENDING_OUTGOING' | 'FRIENDS';
export type FriendRequestPolicy = 'EVERYONE' | 'NOBODY';
export type FriendRequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
export type PartyReadyState = 'READY' | 'NOT_READY';
export type PartyGameMode = 'ATRASH' | 'MAFIA_CLASSIC' | 'TARNEEB' | 'HIDE_AND_SEEK' | 'O2_IMPOSTER';
export type PartyInviteStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';

export const PARTY_MAX_CAPACITY = 14 as const;
export const PARTY_INVITE_EXPIRY_MINUTES = 10 as const;
export const PARTY_GAME_CAPACITIES: Record<PartyGameMode, number> = {
  ATRASH: 5,
  MAFIA_CLASSIC: 14,
  TARNEEB: 4,
  HIDE_AND_SEEK: 8,
  O2_IMPOSTER: 8,
};

export interface PublicPlayerSummaryDto {
  userId: string;
  username: string;
  displayName: string;
  characterSlug: string | null;
  characterAsset: string | null;
  friendshipState: FriendshipState;
  presence: PresenceStatus;
}

export interface FriendSummaryDto {
  userId: string;
  username: string;
  displayName: string;
  characterSlug: string;
  presence: PresenceStatus;
  currentActivity?: string;
}

export interface FriendRequestDto {
  id: string;
  player: PublicPlayerSummaryDto;
  status: FriendRequestStatus;
  createdAt: string;
}

export interface PaginatedSocialDto<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface SocialPrivacyDto {
  friendRequestPolicy: FriendRequestPolicy;
  allowPartyInvites: boolean;
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
  readyState: PartyReadyState;
  joinedAt: string;
}

export interface PartySummaryDto {
  partyId: string;
  roomCode: string;
  leaderId: string;
  selectedGameSlug?: string;
  desiredGameMode: PartyGameMode | null;
  capacity: number;
  allowJoinByCode: boolean;
  version: number;
  members: PartyMemberDto[];
}

export interface PartyInviteDto {
  id: string;
  partyId: string;
  inviter: PublicPlayerSummaryDto;
  status: PartyInviteStatus;
  expiresAt: string;
  createdAt: string;
}

export type PartyDomainEventType =
  | 'PARTY_MEMBER_JOINED'
  | 'PARTY_MEMBER_LEFT'
  | 'PARTY_MEMBER_KICKED'
  | 'PARTY_LEADER_CHANGED'
  | 'PARTY_READY_CHANGED'
  | 'PARTY_GAME_CHANGED'
  | 'PARTY_INVITE_CREATED';

export interface PartyDomainEvent<TPayload = Record<string, unknown>> {
  type: PartyDomainEventType;
  partyId: string;
  revision: number;
  occurredAt: string;
  payload: TPayload;
}

export interface PartyMatchmakingSnapshot {
  partyId: string;
  leaderId: string;
  desiredGameMode: PartyGameMode | null;
  members: Array<{ userId: string; readyState: PartyReadyState }>;
  revision: number;
}

export type SocialAnalyticsEvent =
  | 'player_search'
  | 'friend_request_sent'
  | 'friend_request_accepted'
  | 'friend_request_rejected'
  | 'friend_removed'
  | 'user_blocked'
  | 'party_created'
  | 'party_invite_sent'
  | 'party_invite_accepted'
  | 'party_member_joined'
  | 'party_member_left'
  | 'party_member_kicked'
  | 'party_ready_changed'
  | 'party_game_selected';
