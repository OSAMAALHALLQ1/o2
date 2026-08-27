import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OAuthAdapter } from './adapters/oauth.adapter';

@Module({
  imports: [
    JwtModule.register({}),
    ConfigModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    OAuthAdapter,
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    JwtModule,
  ],
})
export class AuthModule {}
