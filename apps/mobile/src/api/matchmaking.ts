import {
  type MatchmakingStatusResponseDto,
  type MatchmakingTicketDto,
  type RoomGameMode,
} from '@o2/types';
import { api } from './client';

export const MatchmakingApi = {
  join: (gameMode: RoomGameMode) =>
    api.post<MatchmakingTicketDto>('/matchmaking/join', { gameMode }),

  cancel: (ticketId?: string) =>
    api.post<{ cancelled: boolean; ticketId: string }>('/matchmaking/cancel', {
      ticketId,
    }),

  status: () =>
    api.get<MatchmakingStatusResponseDto>('/matchmaking/status'),
};
