import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CompanionController } from './companion.controller';
import { CompanionService } from './companion.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get<string>('JWT_ACCESS_SECRET') ||
          'dev-jwt-access-secret-change-in-prod-min-32-chars-length',
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [CompanionController],
  providers: [CompanionService],
  exports: [CompanionService],
})
export class CompanionModule {}
