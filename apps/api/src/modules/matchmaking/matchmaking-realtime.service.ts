import { Injectable } from '@nestjs/common';
import { RealtimeServerService } from '../realtime/services/realtime-server.service';
import { MatchmakingRealtimeNotifier } from './matchmaking-realtime.manager';

export * from './matchmaking-realtime.manager';

@Injectable()
export class MatchmakingRealtimeService extends MatchmakingRealtimeNotifier {
  constructor(realtimeServer?: RealtimeServerService) {
    super(realtimeServer);
  }
}
