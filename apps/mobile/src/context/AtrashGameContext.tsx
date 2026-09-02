import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  type AtrashActionType,
  type AtrashPlayerPrivateState,
  type AtrashPublicState,
  AtrashActionTypes,
  AtrashSystemEvents,
  RoomSystemEvents,
} from '@o2/types';
import { getSharedRealtimeClient } from '../realtime';
import { MobileRoomClient } from '../realtime/room-client';
import { useAuth } from './AuthContext';

interface AtrashGameContextValue {
  roomId: string | null;
  publicState: AtrashPublicState | null;
  playerState: AtrashPlayerPrivateState | null;
  isLoading: boolean;
  isConnected: boolean;
  isResyncing: boolean;
  timeRemainingSeconds: number;
  joinAtrashRoom: (roomId: string) => Promise<void>;
  startGame: () => Promise<void>;
  submitQuestion: (questionText: string) => Promise<void>;
  submitAnswer: (answerText: string) => Promise<void>;
  castVote: (targetUserId: string) => Promise<void>;
  submitLastChance: (selectedWord: string) => Promise<void>;
  advancePhase: () => Promise<void>;
  leaveRoom: () => Promise<void>;
}

const AtrashGameContext = createContext<AtrashGameContextValue | undefined>(undefined);

export function AtrashGameProvider({ children }: { children: ReactNode }) {
  const { user, authState } = useAuth();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [publicState, setPublicState] = useState<AtrashPublicState | null>(null);
  const [playerState, setPlayerState] = useState<AtrashPlayerPrivateState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [isResyncing, setIsResyncing] = useState(false);
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState(0);

  const roomClientRef = useRef<MobileRoomClient | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getRoomClient = useCallback(() => {
    if (!roomClientRef.current) {
      const realtime = getSharedRealtimeClient();
      roomClientRef.current = new MobileRoomClient(realtime);
    }
    return roomClientRef.current;
  }, []);

  // Timer ticker calculation based on current phase and deadlines
  useEffect(() => {
    if (!publicState) {
      setTimeRemainingSeconds(0);
      return;
    }

    let deadline = 0;
    if (publicState.phase === 'QUESTION_PHASE' && publicState.turn) {
      deadline = publicState.turn.turnDeadline;
    } else if (publicState.phase === 'DISCUSSION_PHASE' && publicState.discussionDeadline) {
      deadline = publicState.discussionDeadline;
    } else if (publicState.phase === 'VOTING' && publicState.votingDeadline) {
      deadline = publicState.votingDeadline;
    } else if (publicState.phase === 'ATRASH_LAST_CHANCE' && publicState.lastChance) {
      deadline = publicState.lastChance.deadline;
    }

    if (deadline > 0) {
      const calcRemaining = () => Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTimeRemainingSeconds(calcRemaining());

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        const remaining = calcRemaining();
        setTimeRemainingSeconds(remaining);
        if (remaining <= 0 && timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }, 500);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setTimeRemainingSeconds(0);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [publicState]);

  // Realtime listeners for room state and events
  useEffect(() => {
    if (!user || authState !== 'authenticated') return;
    const client = getSharedRealtimeClient();

    // Connection lifecycle
    const unsubConn = client.on('connection:state_changed', (envelope: any) => {
      const connState = envelope?.payload?.state;
      setIsConnected(connState === 'CONNECTED');
      setIsResyncing(connState === 'RECONNECTING');
    });

    // 1. STATE_SYNC updates
    const unsubState = client.on(RoomSystemEvents.STATE_SYNC, (envelope: any) => {
      const payload = envelope.payload || {};
      if (payload.publicProjection?.gameState) {
        setPublicState(payload.publicProjection.gameState as AtrashPublicState);
      }
    });

    // 2. Direct Atrash system events
    const unsubRound = client.on(AtrashSystemEvents.ROUND_STARTED, () => {
      void refreshPlayerProjection();
    });

    const unsubTurn = client.on(AtrashSystemEvents.TURN_STARTED, () => {
      void refreshPlayerProjection();
    });

    const unsubVoting = client.on(AtrashSystemEvents.VOTING_STARTED, () => {
      void refreshPlayerProjection();
    });

    const unsubLastChance = client.on(AtrashSystemEvents.ATRASH_LAST_CHANCE_STARTED, () => {
      void refreshPlayerProjection();
    });

    const unsubRoundResult = client.on(AtrashSystemEvents.ROUND_RESULT, () => {
      void refreshPlayerProjection();
    });

    const unsubMatchResult = client.on(AtrashSystemEvents.MATCH_RESULT, () => {
      void refreshPlayerProjection();
    });

    return () => {
      unsubConn();
      unsubState();
      unsubRound();
      unsubTurn();
      unsubVoting();
      unsubLastChance();
      unsubRoundResult();
      unsubMatchResult();
    };
  }, [user, authState]);

  const refreshPlayerProjection = useCallback(async () => {
    if (!roomId) return;
    try {
      const roomClient = getRoomClient();
      const proj = await roomClient.recoverRoom();
      if (proj.playerData) {
        setPlayerState(proj.playerData as AtrashPlayerPrivateState);
      }
      if ((proj as any).gameState) {
        setPublicState((proj as any).gameState as AtrashPublicState);
      }
    } catch {
      // Ignored
    }
  }, [roomId, getRoomClient]);

  const joinAtrashRoom = useCallback(async (targetRoomId: string) => {
    setIsLoading(true);
    setRoomId(targetRoomId);
    try {
      const roomClient = getRoomClient();
      const proj = await roomClient.recoverRoom();
      if (proj.playerData) {
        setPlayerState(proj.playerData as AtrashPlayerPrivateState);
      }
      if ((proj as any).gameState) {
        setPublicState((proj as any).gameState as AtrashPublicState);
      }
    } catch {
      try {
        const roomClient = getRoomClient();
        const proj = await roomClient.joinRoom(targetRoomId);
        if (proj.playerData) {
          setPlayerState(proj.playerData as AtrashPlayerPrivateState);
        }
        if ((proj as any).gameState) {
          setPublicState((proj as any).gameState as AtrashPublicState);
        }
      } catch (joinErr: any) {
        console.warn('Failed to join/recover room:', joinErr.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [getRoomClient]);

  const sendAction = useCallback(async (type: AtrashActionType, payload: unknown = {}) => {
    if (!roomId) throw new Error('لا توجد غرفة نشطة');
    const roomClient = getRoomClient();
    const result = await roomClient.sendRoomAction(roomId, type, payload);
    await refreshPlayerProjection();
    return result;
  }, [roomId, getRoomClient, refreshPlayerProjection]);

  const startGame = useCallback(async () => {
    await sendAction(AtrashActionTypes.START_GAME);
  }, [sendAction]);

  const submitQuestion = useCallback(async (questionText: string) => {
    await sendAction(AtrashActionTypes.SUBMIT_QUESTION, { questionText });
  }, [sendAction]);

  const submitAnswer = useCallback(async (answerText: string) => {
    await sendAction(AtrashActionTypes.SUBMIT_ANSWER, { answerText });
  }, [sendAction]);

  const castVote = useCallback(async (targetUserId: string) => {
    await sendAction(AtrashActionTypes.CAST_VOTE, { targetUserId });
  }, [sendAction]);

  const submitLastChance = useCallback(async (selectedWord: string) => {
    await sendAction(AtrashActionTypes.SUBMIT_LAST_CHANCE, { selectedWord });
  }, [sendAction]);

  const advancePhase = useCallback(async () => {
    await sendAction(AtrashActionTypes.ADVANCE_PHASE);
  }, [sendAction]);

  const leaveRoom = useCallback(async () => {
    if (!roomId) return;
    try {
      const roomClient = getRoomClient();
      await roomClient.leaveRoom(roomId);
    } finally {
      setRoomId(null);
      setPublicState(null);
      setPlayerState(null);
    }
  }, [roomId, getRoomClient]);

  const value: AtrashGameContextValue = {
    roomId,
    publicState,
    playerState,
    isLoading,
    isConnected,
    isResyncing,
    timeRemainingSeconds,
    joinAtrashRoom,
    startGame,
    submitQuestion,
    submitAnswer,
    castVote,
    submitLastChance,
    advancePhase,
    leaveRoom,
  };

  return (
    <AtrashGameContext.Provider value={value}>
      {children}
    </AtrashGameContext.Provider>
  );
}

export function useAtrashGame() {
  const ctx = useContext(AtrashGameContext);
  if (!ctx) {
    throw new Error('useAtrashGame must be used within an AtrashGameProvider');
  }
  return ctx;
}
