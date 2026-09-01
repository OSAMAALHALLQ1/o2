import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RoomManagerService } from '../realtime/rooms/room-manager.service';
import { MatchmakingEngineService } from './matchmaking-engine.service';
import { MatchmakingRealtimeService } from './matchmaking-realtime.service';
import { MatchmakingServiceCore } from './matchmaking.manager';

export * from './matchmaking.manager';

@Injectable()
export class MatchmakingService extends MatchmakingServiceCore {
  constructor(
    prisma: PrismaService,
    engine: MatchmakingEngineService,
    roomManager?: RoomManagerService,
    notifier?: MatchmakingRealtimeService,
  ) {
    super(prisma, engine, roomManager, notifier);
  }
}
