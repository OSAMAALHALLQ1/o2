import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { validateEnvironment } from './common/config.schema';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProfileModule } from './profile/profile.module';
import { CompanionModule } from './companion/companion.module';
import { HealthModule } from './modules/health/health.module';
import { EconomyModule } from './economy/economy.module';
import { SocialModule } from './modules/social/social.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { GameRoomModule } from './modules/game-room/game-room.module';
import { MatchmakingModule } from './modules/matchmaking/matchmaking.module';
import { VoiceModule } from './modules/voice/voice.module';
import { RestaurantIntegrationModule } from './modules/restaurant-integration/restaurant-integration.module';
import { AdminModule } from './modules/admin/admin.module';
import { NotificationModule } from './modules/notification/notification.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    HealthModule,
    // Phase 2 Identity, Auth & Onboarding Modules
    AuthModule,
    ProfileModule,
    // Phase 3 Living Companion / Tamagotchi Engine
    CompanionModule,
    // Future Phase Domain Shells
    EconomyModule,
    SocialModule,
    RealtimeModule,
    GameRoomModule,
    MatchmakingModule,
    VoiceModule,
    RestaurantIntegrationModule,
    AdminModule,
    NotificationModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
