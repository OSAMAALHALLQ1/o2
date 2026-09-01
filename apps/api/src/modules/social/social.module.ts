import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PartyController } from './party.controller';
import { PartyService } from './party.service';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';

/**
 * SocialModule (Phase 5 & 6C)
 * Handles Friend graph, block lists, persistent parties, user presence,
 * and realtime party synchronization.
 */
@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [SocialController, PartyController],
  providers: [SocialService, PartyService],
  exports: [SocialService, PartyService],
})
export class SocialModule {}
