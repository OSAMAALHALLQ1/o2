import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { RoomManager } from './room-manager';
import { RealtimeServerService } from '../services/realtime-server.service';
import { AtrashRoomAdapter } from './atrash/atrash-room.adapter';
import { GameHistoryService } from './atrash/game-history.service';

@Injectable()
export class RoomManagerService extends RoomManager implements OnModuleDestroy {
  private sweepInterval: NodeJS.Timeout | null = null;

  constructor(
    realtimeServer: RealtimeServerService,
    gameHistory?: GameHistoryService,
  ) {
    super(realtimeServer);

    this.registerAdapterFactory('ATRASH', (roomId, srv) => {
      const adapter = new AtrashRoomAdapter(roomId, srv);
      if (gameHistory) {
        adapter.setOnMatchCompleted(async (result) => {
          if (result) {
            await gameHistory.recordMatchHistory({
              roomId,
              matchId: `match_${roomId.replace('room_', '')}`,
              winnerUserId: result.atrashDetected ? result.atrashUserId : 'system',
              participants: [],
              finalScores: {},
              totalRounds: result.roundNumber,
            });
          }
        });
      }
      return adapter;
    });

    // Sweep every 60 seconds
    this.sweepInterval = setInterval(() => {
      this.sweepStaleRooms();
    }, 60_000);
    this.sweepInterval.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
  }
}
