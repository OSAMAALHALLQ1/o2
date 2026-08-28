import {
  FriendRequestDto, PaginatedSocialDto, PartyGameMode, PartyInviteDto,
  PartyReadyState, PartySummaryDto, PublicPlayerSummaryDto, SocialPrivacyDto,
} from '@o2/types';
import { api } from './client';

export const SocialApi = {
  search: (query: string) => api.get<PublicPlayerSummaryDto[]>(`/players/search?query=${encodeURIComponent(query)}`),
  friends: () => api.get<PaginatedSocialDto<PublicPlayerSummaryDto>>('/me/friends?page=1&limit=50'),
  incomingRequests: () => api.get<PaginatedSocialDto<FriendRequestDto>>('/me/friend-requests/incoming?page=1&limit=50'),
  outgoingRequests: () => api.get<PaginatedSocialDto<FriendRequestDto>>('/me/friend-requests/outgoing?page=1&limit=50'),
  sendRequest: (userId: string) => api.post('/friends/requests', { userId }),
  acceptRequest: (id: string) => api.post(`/friends/requests/${id}/accept`),
  rejectRequest: (id: string) => api.post(`/friends/requests/${id}/reject`),
  cancelRequest: (id: string) => api.delete(`/friends/requests/${id}`),
  removeFriend: (userId: string) => api.delete(`/friends/${userId}`),
  block: (userId: string) => api.post(`/blocks/${userId}`),
  unblock: (userId: string) => api.delete(`/blocks/${userId}`),
  blocks: () => api.get<PublicPlayerSummaryDto[]>('/me/blocks'),
  privacy: () => api.get<SocialPrivacyDto>('/me/social-privacy'),
  updatePrivacy: (privacy: Partial<SocialPrivacyDto>) => api.patch<SocialPrivacyDto>('/me/social-privacy', privacy),
  party: () => api.get<PartySummaryDto | null>('/me/party'),
  partyInvites: () => api.get<PartyInviteDto[]>('/me/party-invites'),
  createParty: () => api.post<PartySummaryDto>('/parties'),
  inviteToParty: (partyId: string, userId: string) => api.post(`/parties/${partyId}/invites`, { userId }),
  acceptPartyInvite: (id: string) => api.post<PartySummaryDto>(`/party-invites/${id}/accept`),
  rejectPartyInvite: (id: string) => api.post(`/party-invites/${id}/reject`),
  leaveParty: (partyId: string) => api.post(`/parties/${partyId}/leave`),
  kickMember: (partyId: string, userId: string) => api.post<PartySummaryDto>(`/parties/${partyId}/kick`, { userId }),
  setReady: (partyId: string, readyState: PartyReadyState) => api.post<PartySummaryDto>(`/parties/${partyId}/ready`, { readyState }),
  selectGame: (partyId: string, desiredGameMode: PartyGameMode) => api.post<PartySummaryDto>(`/parties/${partyId}/game`, { desiredGameMode }),
  setCodeAccess: (partyId: string, allowJoinByCode: boolean) => api.patch<PartySummaryDto>(`/parties/${partyId}/code-access`, { allowJoinByCode }),
  joinByCode: (code: string) => api.post<PartySummaryDto>('/parties/join-by-code', { code }),
};
