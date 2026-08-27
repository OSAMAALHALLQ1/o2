import { api } from './client';
import {
  CompanionActionResponseDto,
  CompanionCareActionType,
  CompanionCareStateDto,
} from '@o2/types';

export const CompanionApi = {
  getCareState: async (): Promise<CompanionCareStateDto> => {
    return api.get<CompanionCareStateDto>('/me/companion');
  },

  performCareAction: async (
    action: CompanionCareActionType,
    clientActionId: string,
  ): Promise<CompanionActionResponseDto> => {
    return api.post<CompanionActionResponseDto>('/me/companion/actions', {
      action,
      clientActionId,
    });
  },
};
