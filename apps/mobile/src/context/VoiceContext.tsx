import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  VoiceAccessGrantDto,
  VoiceConnectionState,
  VoiceParticipantState,
  VoiceRoomContextType,
} from '@o2/types';
import { VoiceApi } from '../api/voice';
import { VoiceClient } from '../voice/voice-client';
import { useAuth } from './AuthContext';

interface VoiceContextType {
  connectionState: VoiceConnectionState;
  grant: VoiceAccessGrantDto | null;
  participants: VoiceParticipantState[];
  isSelfMuted: boolean;
  isConnecting: boolean;
  isConnected: boolean;
  joinVoice: (contextType: VoiceRoomContextType, contextId: string) => Promise<void>;
  leaveVoice: () => Promise<void>;
  toggleSelfMute: () => Promise<void>;
  setLocalMute: (userId: string, isMuted: boolean) => void;
  isLocallyMuted: (userId: string) => boolean;
  reportUser: (reportedUserId: string, reason: string, details?: string) => Promise<void>;
}

const VoiceContext = createContext<VoiceContextType | null>(null);

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const { user, authState } = useAuth();
  const clientRef = useRef<VoiceClient>(new VoiceClient());
  const [connectionState, setConnectionState] = useState<VoiceConnectionState>('DISCONNECTED');
  const [grant, setGrant] = useState<VoiceAccessGrantDto | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipantState[]>([]);
  const [isSelfMuted, setIsSelfMuted] = useState<boolean>(false);
  const [, setLocalMuteVersion] = useState(0);

  const client = clientRef.current;

  // Sync client events to state
  useEffect(() => {
    const unsub = client.on((_event, _data) => {
      setConnectionState(client.getConnectionState());
      setParticipants(client.getParticipants());
      setGrant(client.getGrant());
      setLocalMuteVersion((v) => v + 1);
    });

    return () => {
      unsub();
      client.disconnect();
    };
  }, [client]);

  // Clean up if user logs out
  useEffect(() => {
    if (!user || authState !== 'authenticated') {
      client.disconnect();
      setGrant(null);
      setParticipants([]);
      setIsSelfMuted(false);
    }
  }, [user, authState, client]);

  const joinVoice = useCallback(
    async (contextType: VoiceRoomContextType, contextId: string) => {
      if (!user || authState !== 'authenticated') return;

      try {
        const accessGrant = await VoiceApi.requestToken({ contextType, contextId });
        await client.connect(accessGrant);
        setGrant(accessGrant);

        // Fetch initial room summary
        const summary = await VoiceApi.getRoomSummary(contextType, contextId);
        for (const p of summary.participants) {
          client.handleRemoteEvent('voice:participant_joined', { participant: p });
        }
      } catch (err) {
        client.disconnect();
        throw err;
      }
    },
    [user, authState, client],
  );

  const leaveVoice = useCallback(async () => {
    if (grant) {
      try {
        await VoiceApi.leave(grant.contextType, grant.contextId);
      } catch {
        // Suppress leave errors during teardown
      }
    }
    client.disconnect();
    setGrant(null);
    setParticipants([]);
    setIsSelfMuted(false);
  }, [grant, client]);

  const toggleSelfMute = useCallback(async () => {
    if (!grant) return;
    const nextMute = !isSelfMuted;
    await VoiceApi.setSelfMute(grant.contextType, grant.contextId, nextMute);
    setIsSelfMuted(nextMute);
    if (user) {
      client.handleRemoteEvent('voice:speaking_changed', {
        userId: user.id,
        isSelfMuted: nextMute,
        isSpeaking: false,
      });
    }
  }, [grant, isSelfMuted, user, client]);

  const setLocalMute = useCallback(
    (userId: string, isMuted: boolean) => {
      client.setLocalMute(userId, isMuted);
      setLocalMuteVersion((v) => v + 1);
    },
    [client],
  );

  const isLocallyMuted = useCallback(
    (userId: string) => client.isLocallyMuted(userId),
    [client],
  );

  const reportUser = useCallback(
    async (reportedUserId: string, reason: string, details?: string) => {
      if (!grant) return;
      await VoiceApi.report({
        contextType: grant.contextType,
        contextId: grant.contextId,
        reportedUserId,
        reason,
        details,
      });
    },
    [grant],
  );

  return (
    <VoiceContext.Provider
      value={{
        connectionState,
        grant,
        participants,
        isSelfMuted,
        isConnecting: connectionState === 'CONNECTING',
        isConnected: connectionState === 'CONNECTED',
        joinVoice,
        leaveVoice,
        toggleSelfMute,
        setLocalMute,
        isLocallyMuted,
        reportUser,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice(): VoiceContextType {
  const context = useContext(VoiceContext);
  if (!context) {
    throw new Error('useVoice must be used within a VoiceProvider');
  }
  return context;
}
