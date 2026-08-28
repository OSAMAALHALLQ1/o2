import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PartyController } from './party.controller';
import { PartyService } from './party.service';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';

/**
 * SocialModule (Phase 5)
 * Handles Friend graph, block lists, persistent parties, and user presence.
 */
@Module({
  imports: [AuthModule],
  controllers: [SocialController, PartyController],
  providers: [SocialService, PartyService],
  exports: [SocialService, PartyService],
})
export class SocialModule {}
