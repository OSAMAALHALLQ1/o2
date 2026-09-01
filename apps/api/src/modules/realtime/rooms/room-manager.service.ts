import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { RoomManager } from './room-manager';
import { RealtimeServerService } from '../services/realtime-server.service';

@Injectable()
export class RoomManagerService extends RoomManager implements OnModuleDestroy {
  private sweepInterval: NodeJS.Timeout | null = null;

  constructor(realtimeServer: RealtimeServerService) {
    super(realtimeServer);
    // Sweep every 60 seconds
    this.sweepInterval = setInterval(() => {
      this.sweepStaleRooms();
    }, 60_000);
  }

  onModuleDestroy(): void {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
  }
}
