import React, { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  FriendRequestDto, PartyGameMode, PartyInviteDto, PartyReadyState,
  PartyRealtimeEventPayload, PartySummaryDto, PartySystemEvents,
  PublicPlayerSummaryDto, SocialPrivacyDto,
} from '@o2/types';
import { SocialApi } from '../api/social';
import { useAuth } from './AuthContext';
import { AuthTokenStorage } from '../storage/auth-storage';
import { getSharedRealtimeClient } from '../realtime';

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
  const { authState, user } = useAuth();
  const [friends, setFriends] = useState<PublicPlayerSummaryDto[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestDto[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequestDto[]>([]);
  const [blockedPlayers, setBlockedPlayers] = useState<PublicPlayerSummaryDto[]>([]);
  const [privacy, setPrivacy] = useState<SocialPrivacyDto | null>(null);
  const [party, setParty] = useState<PartySummaryDto | null>(null);
  const [partyInvites, setPartyInvites] = useState<PartyInviteDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const partyRef = useRef<PartySummaryDto | null>(null);
  partyRef.current = party;

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

  // Phase 6C: Realtime Party Synchronization
  useEffect(() => {
    if (authState !== 'authenticated') return;

    const realtimeClient = getSharedRealtimeClient();

    // Phase 6D: configure token provider and resync recovery handler
    realtimeClient.setTokenProvider(async () => {
      return await AuthTokenStorage.getAccessToken();
    });

    realtimeClient.setResyncHandler(async () => {
      // Reconcile authoritative state upon reconnect
      await refreshSocial();
    });

    // Connect realtime transport if not already connected
    const connectRealtime = async () => {
      try {
        const token = await AuthTokenStorage.getAccessToken();
        if (token && realtimeClient.getConnectionState() === 'DISCONNECTED') {
          await realtimeClient.connect(token);
        }
      } catch {
        // Realtime is an enhancement; HTTP fallback remains active
      }
    };
    void connectRealtime();

    // Listen to authoritative party events
    const unsubscribeEvent = realtimeClient.on(PartySystemEvents.EVENT, (envelope) => {
      const payload = envelope.payload as PartyRealtimeEventPayload;
      if (!payload || !payload.partyId) return;

      const currentParty = partyRef.current;
      const myUserId = user?.id;

      // Check if this event targets or affects the current party
      if (currentParty && currentParty.partyId === payload.partyId) {
        // If current user is removed or kicked
        const isStillMember = myUserId
          ? payload.snapshot.members.some((m) => m.userId === myUserId)
          : true;

        if (!isStillMember || payload.type === 'PARTY_MEMBER_KICKED' && payload.details?.kickedUserId === myUserId) {
          setParty(null);
          realtimeClient.send(PartySystemEvents.UNSUBSCRIBE, { partyId: payload.partyId }).catch(() => {});
          return;
        }

        // Version ordering validation
        const currentVersion = currentParty.version;
        const incomingVersion = payload.version;

        if (incomingVersion < currentVersion) {
          // Stale event -> ignore
          return;
        }

        if (incomingVersion === currentVersion) {
          // Duplicate event -> ignore
          return;
        }

        if (incomingVersion === currentVersion + 1) {
          // Sequential authoritative update -> apply directly
          setParty({
            partyId: payload.snapshot.partyId,
            roomCode: payload.snapshot.roomCode,
            leaderId: payload.snapshot.leaderId,
            desiredGameMode: payload.snapshot.desiredGameMode,
            capacity: payload.snapshot.capacity,
            allowJoinByCode: payload.snapshot.allowJoinByCode,
            version: payload.snapshot.version,
            members: payload.snapshot.members,
          });
          return;
        }

        if (incomingVersion > currentVersion + 1) {
          // Version gap detected -> authoritative HTTP reconciliation
          void refreshSocial();
          return;
        }
      } else if (!currentParty && payload.snapshot) {
        // Joined a party while not locally in one
        const isMember = myUserId
          ? payload.snapshot.members.some((m) => m.userId === myUserId)
          : false;

        if (isMember) {
          setParty({
            partyId: payload.snapshot.partyId,
            roomCode: payload.snapshot.roomCode,
            leaderId: payload.snapshot.leaderId,
            desiredGameMode: payload.snapshot.desiredGameMode,
            capacity: payload.snapshot.capacity,
            allowJoinByCode: payload.snapshot.allowJoinByCode,
            version: payload.snapshot.version,
            members: payload.snapshot.members,
          });
        }
      }
    });

    return () => {
      unsubscribeEvent();
    };
  }, [authState, user?.id, refreshSocial]);

  // Subscribe to realtime party when party state changes
  useEffect(() => {
    if (!party?.partyId) return;

    const realtimeClient = getSharedRealtimeClient();
    const partyId = party.partyId;

    if (realtimeClient.getConnectionState() === 'CONNECTED') {
      realtimeClient.send(PartySystemEvents.SUBSCRIBE, { partyId }).catch(() => {});
    }

    return () => {
      if (realtimeClient.getConnectionState() === 'CONNECTED') {
        realtimeClient.send(PartySystemEvents.UNSUBSCRIBE, { partyId }).catch(() => {});
      }
    };
  }, [party?.partyId]);

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
