import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './common/config.schema';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { CompanionModule } from './modules/companion/companion.module';
import { EconomyModule } from './modules/economy/economy.module';
import { SocialModule } from './modules/social/social.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { GameRoomModule } from './modules/game-room/game-room.module';
import { MatchmakingModule } from './modules/matchmaking/matchmaking.module';
import { RestaurantIntegrationModule } from './modules/restaurant-integration/restaurant-integration.module';
import { AdminModule } from './modules/admin/admin.module';
import { NotificationModule } from './modules/notification/notification.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    HealthModule,
    // Architectural Module Boundaries
    AuthModule,
    CompanionModule,
    EconomyModule,
    SocialModule,
    RealtimeModule,
    GameRoomModule,
    MatchmakingModule,
    RestaurantIntegrationModule,
    AdminModule,
    NotificationModule,
  ],
})
export class AppModule {}
