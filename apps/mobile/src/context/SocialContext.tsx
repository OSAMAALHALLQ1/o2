import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import {
  FriendRequestDto, PartyGameMode, PartyInviteDto, PartyReadyState,
  PartySummaryDto, PublicPlayerSummaryDto, SocialPrivacyDto,
} from '@o2/types';
import { SocialApi } from '../api/social';
import { useAuth } from './AuthContext';

interface SocialContextValue {
  friends: PublicPlayerSummaryDto[];
  incomingRequests: FriendRequestDto[];
  outgoingRequests: FriendRequestDto[];
  blockedPlayers: PublicPlayerSummaryDto[];
  privacy: SocialPrivacyDto | null;
  party: PartySummaryDto | null;
  partyInvites: PartyInviteDto[];
  isLoading: boolean;
  refreshSocial: () => Promise<void>;
  searchPlayers: (query: string) => Promise<PublicPlayerSummaryDto[]>;
  sendFriendRequest: (userId: string) => Promise<void>;
  acceptFriendRequest: (id: string) => Promise<void>;
  rejectFriendRequest: (id: string) => Promise<void>;
  cancelFriendRequest: (id: string) => Promise<void>;
  removeFriend: (userId: string) => Promise<void>;
  blockPlayer: (userId: string) => Promise<void>;
  unblockPlayer: (userId: string) => Promise<void>;
  updatePrivacy: (privacy: Partial<SocialPrivacyDto>) => Promise<void>;
  createParty: () => Promise<void>;
  acceptPartyInvite: (id: string) => Promise<void>;
  rejectPartyInvite: (id: string) => Promise<void>;
  inviteFriend: (userId: string) => Promise<void>;
  leaveParty: () => Promise<void>;
  kickMember: (userId: string) => Promise<void>;
  setReady: (state: PartyReadyState) => Promise<void>;
  selectGame: (mode: PartyGameMode) => Promise<void>;
  setCodeAccess: (allow: boolean) => Promise<void>;
  joinByCode: (code: string) => Promise<void>;
}

const SocialContext = createContext<SocialContextValue | undefined>(undefined);

export function SocialProvider({ children }: { children: ReactNode }) {
  const { authState } = useAuth();
  const [friends, setFriends] = useState<PublicPlayerSummaryDto[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestDto[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequestDto[]>([]);
  const [blockedPlayers, setBlockedPlayers] = useState<PublicPlayerSummaryDto[]>([]);
  const [privacy, setPrivacy] = useState<SocialPrivacyDto | null>(null);
  const [party, setParty] = useState<PartySummaryDto | null>(null);
  const [partyInvites, setPartyInvites] = useState<PartyInviteDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshSocial = useCallback(async () => {
    if (authState !== 'authenticated') return;
    setIsLoading(true);
    try {
      const [friendResult, requestResult, outgoingResult, blockResult, privacyResult, partyResult, inviteResult] = await Promise.all([
        SocialApi.friends(), SocialApi.incomingRequests(), SocialApi.outgoingRequests(),
        SocialApi.blocks(), SocialApi.privacy(), SocialApi.party(), SocialApi.partyInvites(),
      ]);
      setFriends(friendResult.data);
      setIncomingRequests(requestResult.data);
      setOutgoingRequests(outgoingResult.data);
      setBlockedPlayers(blockResult);
      setPrivacy(privacyResult);
      setParty(partyResult);
      setPartyInvites(inviteResult);
    } finally {
      setIsLoading(false);
    }
  }, [authState]);

  useEffect(() => { void refreshSocial(); }, [refreshSocial]);

  const reconcile = async (mutation: () => Promise<unknown>) => {
    try { await mutation(); } finally { await refreshSocial(); }
  };

  return (
    <SocialContext.Provider value={{
      friends, incomingRequests, outgoingRequests, blockedPlayers, privacy,
      party, partyInvites, isLoading, refreshSocial,
      searchPlayers: SocialApi.search,
      sendFriendRequest: (userId) => reconcile(() => SocialApi.sendRequest(userId)),
      acceptFriendRequest: (id) => reconcile(() => SocialApi.acceptRequest(id)),
      rejectFriendRequest: (id) => reconcile(() => SocialApi.rejectRequest(id)),
      cancelFriendRequest: (id) => reconcile(() => SocialApi.cancelRequest(id)),
      removeFriend: (userId) => reconcile(() => SocialApi.removeFriend(userId)),
      blockPlayer: (userId) => reconcile(() => SocialApi.block(userId)),
      unblockPlayer: (userId) => reconcile(() => SocialApi.unblock(userId)),
      updatePrivacy: (next) => reconcile(() => SocialApi.updatePrivacy(next)),
      createParty: () => reconcile(() => SocialApi.createParty()),
      acceptPartyInvite: (id) => reconcile(() => SocialApi.acceptPartyInvite(id)),
      rejectPartyInvite: (id) => reconcile(() => SocialApi.rejectPartyInvite(id)),
      inviteFriend: (userId) => party ? reconcile(() => SocialApi.inviteToParty(party.partyId, userId)) : Promise.resolve(),
      leaveParty: () => party ? reconcile(() => SocialApi.leaveParty(party.partyId)) : Promise.resolve(),
      kickMember: (userId) => party ? reconcile(() => SocialApi.kickMember(party.partyId, userId)) : Promise.resolve(),
      setReady: (state) => party ? reconcile(() => SocialApi.setReady(party.partyId, state)) : Promise.resolve(),
      selectGame: (mode) => party ? reconcile(() => SocialApi.selectGame(party.partyId, mode)) : Promise.resolve(),
      setCodeAccess: (allow) => party ? reconcile(() => SocialApi.setCodeAccess(party.partyId, allow)) : Promise.resolve(),
      joinByCode: (code) => reconcile(() => SocialApi.joinByCode(code)),
    }}>
      {children}
    </SocialContext.Provider>
  );
}

export function useSocial() {
  const value = useContext(SocialContext);
  if (!value) throw new Error('useSocial must be used within SocialProvider');
  return value;
}
