import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { RealtimeAuthService } from './services/realtime-auth.service';
import { RealtimeRateLimiterService } from './services/realtime-rate-limiter.service';
import { RealtimeServerService } from './services/realtime-server.service';
import { RealtimeGateway } from './adapters/realtime.gateway';

import { RoomManagerService } from './rooms/room-manager.service';
import { PartyRealtimeService } from './party/party-realtime.service';

/**
 * RealtimeModule (Phase 6A, 6B & 6C)
 * Transport abstraction layer, connection lifecycle, JWT authentication,
 * versioned protocol envelopes, request correlation, heartbeat monitoring,
 * server-authoritative room engine, and party realtime synchronization.
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
    PartyRealtimeService,
  ],
  exports: [
    RealtimeAuthService,
    RealtimeRateLimiterService,
    RealtimeServerService,
    RealtimeGateway,
    RoomManagerService,
    PartyRealtimeService,
  ],
})
export class RealtimeModule {}
