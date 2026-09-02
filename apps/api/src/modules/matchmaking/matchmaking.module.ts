import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { MatchmakingController } from './matchmaking.controller';
import { MatchmakingService } from './matchmaking.service';
import { MatchmakingEngineService } from './matchmaking-engine.service';
import { MatchmakingRealtimeService } from './matchmaking-realtime.service';
import { AuthModule } from '../../auth/auth.module';

/**
 * MatchmakingModule (Phase 6E)
 * Server-authoritative matchmaking foundation with exact capacities,
 * party-as-unit grouping, snapshot revalidation, and room allocation.
 */
@Module({
  imports: [PrismaModule, RealtimeModule, AuthModule],
  controllers: [MatchmakingController],
  providers: [
    MatchmakingRealtimeService,
    MatchmakingEngineService,
    MatchmakingService,
  ],
  exports: [MatchmakingService, MatchmakingEngineService],
})
export class MatchmakingModule {}
