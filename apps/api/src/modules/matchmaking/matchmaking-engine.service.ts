import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { MATCHMAKING_CONSTANTS } from '@o2/types';
import { PrismaService } from '../../prisma/prisma.service';
import { RoomManagerService } from '../realtime/rooms/room-manager.service';
import { MatchmakingRealtimeService } from './matchmaking-realtime.service';
import { MatchmakingEngineCore } from './matchmaking.engine';

export * from './matchmaking.engine';

@Injectable()
export class MatchmakingEngineService
  extends MatchmakingEngineCore
  implements OnModuleDestroy
{
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    prisma: PrismaService,
    roomManager?: RoomManagerService,
    notifier?: MatchmakingRealtimeService,
  ) {
    super(prisma, roomManager, notifier);

    // Periodic cleanup of expired tickets
    this.sweepTimer = setInterval(() => {
      void this.sweepExpiredTickets();
    }, MATCHMAKING_CONSTANTS.SWEEP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }
}
