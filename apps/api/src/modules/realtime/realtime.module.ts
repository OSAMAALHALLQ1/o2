import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { RealtimeAuthService } from './services/realtime-auth.service';
import { RealtimeRateLimiterService } from './services/realtime-rate-limiter.service';
import { RealtimeServerService } from './services/realtime-server.service';
import { RealtimeGateway } from './adapters/realtime.gateway';

/**
 * RealtimeModule (Phase 6A)
 * Transport abstraction layer, WSS connection lifecycle, JWT authentication,
 * versioned protocol envelopes, request correlation, sequence monotonicity,
 * heartbeat monitoring, and rate limiting.
 */
@Module({
  imports: [
    JwtModule.register({}),
    ConfigModule,
    PrismaModule,
  ],
  providers: [
    RealtimeAuthService,
    RealtimeRateLimiterService,
    RealtimeServerService,
    RealtimeGateway,
  ],
  exports: [
    RealtimeAuthService,
    RealtimeRateLimiterService,
    RealtimeServerService,
    RealtimeGateway,
  ],
})
export class RealtimeModule {}
