import { Injectable } from '@nestjs/common';
import { PartyRealtimeManager } from './party-realtime.manager';
import { RealtimeServerService } from '../services/realtime-server.service';

export * from './party-realtime.manager';

/**
 * NestJS Injectable wrapper for PartyRealtimeService
 */
@Injectable()
export class PartyRealtimeService extends PartyRealtimeManager {
  constructor(realtimeServer: RealtimeServerService) {
    super(realtimeServer);
  }
}
