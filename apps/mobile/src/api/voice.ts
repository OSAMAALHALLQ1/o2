import type {
  ReportVoiceParticipantDto,
  RequestVoiceGrantDto,
  UpdateVoicePermissionsDto,
  VoiceAccessGrantDto,
  VoiceParticipantState,
  VoiceRoomContextType,
  VoiceRoomSummaryDto,
} from '@o2/types';
import { api } from './client';

export const VoiceApi = {
  requestToken: (dto: RequestVoiceGrantDto) =>
    api.post<VoiceAccessGrantDto>('/voice/token', dto),

  getRoomSummary: (contextType: VoiceRoomContextType, contextId: string) =>
    api.get<VoiceRoomSummaryDto>(`/voice/room/${contextType}/${contextId}`),

  leave: (contextType: VoiceRoomContextType, contextId: string) =>
    api.post<{ left: boolean }>(`/voice/room/${contextType}/${contextId}/leave`, {}),

  setSelfMute: (
    contextType: VoiceRoomContextType,
    contextId: string,
    isMuted: boolean,
  ) =>
    api.post<VoiceParticipantState>(
      `/voice/room/${contextType}/${contextId}/self-mute`,
      { isMuted },
    ),

  updatePermissions: (
    contextType: VoiceRoomContextType,
    contextId: string,
    dto: UpdateVoicePermissionsDto,
  ) =>
    api.post<VoiceRoomSummaryDto>(
      `/voice/room/${contextType}/${contextId}/permissions`,
      dto,
    ),

  report: (dto: ReportVoiceParticipantDto) =>
    api.post<{ reported: boolean; reportId: string }>('/voice/report', dto),
};
