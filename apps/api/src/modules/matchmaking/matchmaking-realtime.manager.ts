import {
  type MatchAssignmentDto,
  type MatchmakingTicketDto,
  MatchmakingSystemEvents,
} from '@o2/types';
import type { RealtimeServer } from '../realtime/transport/realtime-server.interface';

export class MatchmakingRealtimeNotifier {
  private readonly realtimeServer?: RealtimeServer;

  constructor(realtimeServer?: RealtimeServer) {
    this.realtimeServer = realtimeServer;
  }

  notifyTicketStatus(userIds: string[], ticket: MatchmakingTicketDto): void {
    if (!this.realtimeServer) return;
    for (const userId of userIds) {
      this.realtimeServer.sendToUser(
        userId,
        MatchmakingSystemEvents.TICKET_STATUS,
        ticket,
      );
    }
  }

  notifyMatchFound(assignment: MatchAssignmentDto): void {
    if (!this.realtimeServer) return;
    for (const participant of assignment.participants) {
      this.realtimeServer.sendToUser(
        participant.userId,
        MatchmakingSystemEvents.MATCH_FOUND,
        assignment,
      );
    }
  }

  notifyTicketCancelled(userIds: string[], ticketId: string): void {
    if (!this.realtimeServer) return;
    for (const userId of userIds) {
      this.realtimeServer.sendToUser(
        userId,
        MatchmakingSystemEvents.TICKET_CANCELLED,
        { ticketId },
      );
    }
  }
}
