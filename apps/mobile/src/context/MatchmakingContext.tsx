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
  type MatchAssignmentDto,
  type MatchmakingTicketDto,
  type RoomGameMode,
  MatchmakingSystemEvents,
} from '@o2/types';
import { MatchmakingApi } from '../api/matchmaking';
import { useAuth } from './AuthContext';
import { getSharedRealtimeClient } from '../realtime';

interface MatchmakingContextValue {
  ticket: MatchmakingTicketDto | null;
  match: MatchAssignmentDto | null;
  isQueued: boolean;
  isMatching: boolean;
  isMatched: boolean;
  elapsedSeconds: number;
  isLoading: boolean;
  joinQueue: (gameMode: RoomGameMode) => Promise<void>;
  cancelQueue: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  clearMatch: () => void;
}

const MatchmakingContext = createContext<MatchmakingContextValue | undefined>(
  undefined,
);

export function MatchmakingProvider({ children }: { children: ReactNode }) {
  const { authState, user } = useAuth();
  const [ticket, setTicket] = useState<MatchmakingTicketDto | null>(null);
  const [match, setMatch] = useState<MatchAssignmentDto | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshStatus = useCallback(async () => {
    if (!user || authState !== 'authenticated') return;
    try {
      const res = await MatchmakingApi.status();
      if (res.ticket) {
        setTicket(res.ticket);
      } else {
        setTicket(null);
      }
      if (res.match) {
        setMatch(res.match);
      }
    } catch {
      // Ignored during background polling
    }
  }, [user, authState]);

  // Elapsed seconds timer when in QUEUED state
  useEffect(() => {
    if (ticket && (ticket.status === 'QUEUED' || ticket.status === 'MATCHING')) {
      const startAt = ticket.createdAt || Date.now();
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startAt) / 1000)));

      if (!timerRef.current) {
        timerRef.current = setInterval(() => {
          setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startAt) / 1000)));
        }, 1000);
      }
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (!ticket) {
        setElapsedSeconds(0);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [ticket]);

  // Realtime event subscriptions
  useEffect(() => {
    if (!user || authState !== 'authenticated') {
      setTicket(null);
      setMatch(null);
      return;
    }

    const realtime = getSharedRealtimeClient();

    const handleTicketStatus = (envelope: any) => {
      const payload: MatchmakingTicketDto = envelope.payload;
      setTicket(payload);
      if (payload.status === 'CANCELLED' || payload.status === 'EXPIRED') {
        setTicket(null);
      }
    };

    const handleMatchFound = (envelope: any) => {
      const payload: MatchAssignmentDto = envelope.payload;
      setMatch(payload);
      setTicket((prev) => (prev ? { ...prev, status: 'MATCHED' } : null));
    };

    const handleTicketCancelled = () => {
      setTicket(null);
    };

    realtime.on(MatchmakingSystemEvents.TICKET_STATUS, handleTicketStatus);
    realtime.on(MatchmakingSystemEvents.MATCH_FOUND, handleMatchFound);
    realtime.on(MatchmakingSystemEvents.TICKET_CANCELLED, handleTicketCancelled);

    void refreshStatus();

    // Fallback polling every 5s while queued
    const pollInterval = setInterval(() => {
      if (ticket && ticket.status === 'QUEUED') {
        void refreshStatus();
      }
    }, 5000);

    return () => {
      realtime.off(MatchmakingSystemEvents.TICKET_STATUS, handleTicketStatus);
      realtime.off(MatchmakingSystemEvents.MATCH_FOUND, handleMatchFound);
      realtime.off(MatchmakingSystemEvents.TICKET_CANCELLED, handleTicketCancelled);
      clearInterval(pollInterval);
    };
  }, [user, authState, refreshStatus, ticket]);

  const joinQueue = useCallback(
    async (gameMode: RoomGameMode) => {
      setIsLoading(true);
      try {
        const created = await MatchmakingApi.join(gameMode);
        setTicket(created);
        setMatch(null);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const cancelQueue = useCallback(async () => {
    setIsLoading(true);
    try {
      await MatchmakingApi.cancel(ticket?.ticketId);
      setTicket(null);
    } finally {
      setIsLoading(false);
    }
  }, [ticket]);

  const clearMatch = useCallback(() => {
    setMatch(null);
    setTicket(null);
  }, []);

  const isQueued = ticket?.status === 'QUEUED';
  const isMatching = ticket?.status === 'MATCHING';
  const isMatched = ticket?.status === 'MATCHED' || Boolean(match);

  const value: MatchmakingContextValue = {
    ticket,
    match,
    isQueued,
    isMatching,
    isMatched,
    elapsedSeconds,
    isLoading,
    joinQueue,
    cancelQueue,
    refreshStatus,
    clearMatch,
  };

  return (
    <MatchmakingContext.Provider value={value}>
      {children}
    </MatchmakingContext.Provider>
  );
}

export function useMatchmaking(): MatchmakingContextValue {
  const ctx = useContext(MatchmakingContext);
  if (!ctx) {
    throw new Error('useMatchmaking must be used within a MatchmakingProvider');
  }
  return ctx;
}
