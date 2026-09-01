import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { RealtimeAuthService } from './services/realtime-auth.service';
import { RealtimeRateLimiterService } from './services/realtime-rate-limiter.service';
import { RealtimeServerService } from './services/realtime-server.service';
import { RealtimeGateway } from './adapters/realtime.gateway';

import { RoomManagerService } from './rooms/room-manager.service';

/**
 * RealtimeModule (Phase 6A & 6B)
 * Transport abstraction layer, connection lifecycle, JWT authentication,
 * versioned protocol envelopes, request correlation, heartbeat monitoring,
 * and server-authoritative realtime room engine.
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
    RoomManagerService,
  ],
  exports: [
    RealtimeAuthService,
    RealtimeRateLimiterService,
    RealtimeServerService,
    RealtimeGateway,
    RoomManagerService,
  ],
})
export class RealtimeModule {}
