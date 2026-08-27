import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordUtil } from './crypto/password.util';
import { OAuthAdapter } from './adapters/oauth.adapter';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { GoogleAuthDto, AppleAuthDto } from './dto/oauth.dto';
import { AuthSessionResponse, AuthTokens } from '@o2/types';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiresInSeconds = 15 * 60; // 15 minutes
  private readonly refreshExpiresInDays = 30; // 30 days

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly oauthAdapter: OAuthAdapter,
  ) {
    this.accessSecret = this.configService.get<string>('JWT_ACCESS_SECRET') || 'dev-jwt-access-secret-min-32-chars-long';
    this.refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET') || 'dev-jwt-refresh-secret-min-32-chars-long';
  }

  async register(dto: RegisterDto): Promise<AuthSessionResponse> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Check if an email identity already exists
    const existingIdentity = await this.prisma.authIdentity.findUnique({
      where: {
        provider_providerId: {
          provider: 'EMAIL',
          providerId: normalizedEmail,
        },
      },
    });

    if (existingIdentity) {
      this.logger.warn(`Registration rejected: duplicate email attempt`);
      throw new ConflictException('البريد الإلكتروني مسجل بالفعل');
    }

    const passwordHash = await PasswordUtil.hash(dto.password);

    // Create User, AuthIdentity, and PlayerProfile in a single transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          role: 'PLAYER',
          moderationStatus: 'ACTIVE',
        },
      });

      await tx.authIdentity.create({
        data: {
          userId: user.id,
          provider: 'EMAIL',
          providerId: normalizedEmail,
          passwordHash,
        },
      });

      const profile = await tx.playerProfile.create({
        data: {
          userId: user.id,
          language: 'ar',
          isOnboarded: false,
        },
      });

      return { user, profile };
    });

    this.logger.log(`New user registered successfully: [${result.user.id}]`);
    return this.createSessionAndTokens(result.user.id, dto.deviceInfo);
  }

  async login(dto: LoginDto): Promise<AuthSessionResponse> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const identity = await this.prisma.authIdentity.findUnique({
      where: {
        provider_providerId: {
          provider: 'EMAIL',
          providerId: normalizedEmail,
        },
      },
      include: { user: { include: { profile: true } } },
    });

    if (!identity || !identity.passwordHash) {
      this.logger.warn(`Login failed: email not found or missing password hash`);
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const isValidPassword = await PasswordUtil.verify(dto.password, identity.passwordHash);
    if (!isValidPassword) {
      this.logger.warn(`Login failed: invalid password for user [${identity.userId}]`);
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    if (identity.user.moderationStatus === 'BANNED' || identity.user.moderationStatus === 'SUSPENDED') {
      throw new UnauthorizedException('تم حظر هذا الحساب من قبل إدارة O2 Universe');
    }

    // Update lastActiveAt
    await this.prisma.user.update({
      where: { id: identity.userId },
      data: { lastActiveAt: new Date() },
    });

    this.logger.log(`User logged in: [${identity.userId}]`);
    return this.createSessionAndTokens(identity.userId, dto.deviceInfo);
  }

  async googleAuth(dto: GoogleAuthDto): Promise<AuthSessionResponse> {
    const payload = await this.oauthAdapter.verifyGoogleToken(dto.idToken);
    return this.handleOAuthIdentity('GOOGLE', payload.providerId, payload.email, payload.displayName, dto.deviceInfo);
  }

  async appleAuth(dto: AppleAuthDto): Promise<AuthSessionResponse> {
    const payload = await this.oauthAdapter.verifyAppleToken(dto.identityToken, dto.rawNonce);
    return this.handleOAuthIdentity('APPLE', payload.providerId, payload.email, payload.displayName, dto.deviceInfo);
  }

  private async handleOAuthIdentity(
    provider: 'GOOGLE' | 'APPLE',
    providerId: string,
    email?: string,
    displayName?: string,
    deviceInfo?: string,
  ): Promise<AuthSessionResponse> {
    const identity = await this.prisma.authIdentity.findUnique({
      where: {
        provider_providerId: {
          provider,
          providerId,
        },
      },
      include: { user: { include: { profile: true } } },
    });

    if (!identity) {
      // Transactionally create User and OAuth Identity
      const result = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            role: 'PLAYER',
            moderationStatus: 'ACTIVE',
          },
        });

        await tx.authIdentity.create({
          data: {
            userId: user.id,
            provider,
            providerId,
          },
        });

        await tx.playerProfile.create({
          data: {
            userId: user.id,
            displayName: displayName || null,
            language: 'ar',
            isOnboarded: false,
          },
        });

        return user;
      });

      this.logger.log(`Created new account via ${provider} OAuth: [${result.id}]`);
      return this.createSessionAndTokens(result.id, deviceInfo);
    }

    if (identity.user.moderationStatus === 'BANNED' || identity.user.moderationStatus === 'SUSPENDED') {
      throw new UnauthorizedException('تم حظر هذا الحساب من قبل إدارة O2 Universe');
    }

    return this.createSessionAndTokens(identity.userId, deviceInfo);
  }

  async refreshToken(dto: RefreshTokenDto): Promise<AuthTokens> {
    let payload: any;
    try {
      payload = this.jwtService.verify(dto.refreshToken, { secret: this.refreshSecret });
    } catch {
      throw new UnauthorizedException('رمز التحديث غير صالح أو منتهي الصلاحية');
    }

    const { sub: userId, sessionId, tokenFamily } = payload;
    if (!userId || !sessionId || !tokenFamily) {
      throw new UnauthorizedException('بنية رمز التحديث غير صالحة');
    }

    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new UnauthorizedException('الجلسة غير موجودة');
    }

    const incomingHash = PasswordUtil.hashRefreshToken(dto.refreshToken);

    // REPLAY ATTACK DETECTION:
    // If session is revoked OR hash does not match active token, revoke entire token family!
    if (session.revokedAt || session.refreshTokenHash !== incomingHash) {
      this.logger.error(`Replay attack detected on session [${sessionId}] in family [${session.familyId}]. Revoking family.`);
      await this.prisma.userSession.updateMany({
        where: { familyId: session.familyId },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('تم اكتشاف محاولة إعادة استخدام رمز غير صالح، تم إنهاء الجلسة للأمان');
    }

    // Rotate refresh token
    const newRefreshToken = this.generateRawRefreshToken(userId, sessionId, session.familyId);
    const newRefreshHash = PasswordUtil.hashRefreshToken(newRefreshToken);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.refreshExpiresInDays * 24 * 60 * 60 * 1000);

    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: {
        refreshTokenHash: newRefreshHash,
        lastUsedAt: now,
        expiresAt,
        deviceInfo: dto.deviceInfo || session.deviceInfo,
      },
    });

    const accessToken = this.generateRawAccessToken(userId, sessionId);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: this.accessExpiresInSeconds,
    };
  }

  async logout(sessionId: string): Promise<{ success: boolean }> {
    await this.prisma.userSession.updateMany({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    this.logger.log(`Session [${sessionId}] logged out.`);
    return { success: true };
  }

  async logoutAll(userId: string): Promise<{ success: boolean }> {
    await this.prisma.userSession.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    });
    this.logger.log(`All sessions revoked for user [${userId}].`);
    return { success: true };
  }

  private async createSessionAndTokens(userId: string, deviceInfo?: string): Promise<AuthSessionResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    const sessionId = crypto.randomUUID();
    const familyId = crypto.randomUUID();
    const refreshToken = this.generateRawRefreshToken(userId, sessionId, familyId);
    const refreshTokenHash = PasswordUtil.hashRefreshToken(refreshToken);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.refreshExpiresInDays * 24 * 60 * 60 * 1000);

    await this.prisma.userSession.create({
      data: {
        id: sessionId,
        userId,
        familyId,
        refreshTokenHash,
        deviceInfo: deviceInfo || null,
        expiresAt,
        lastUsedAt: now,
      },
    });

    const accessToken = this.generateRawAccessToken(userId, sessionId);

    return {
      sessionId,
      user: {
        id: user.id,
        role: user.role,
        moderationStatus: user.moderationStatus,
        createdAt: user.createdAt.toISOString(),
        lastActiveAt: user.lastActiveAt.toISOString(),
      },
      profile: user.profile
        ? {
            userId: user.profile.userId,
            username: user.profile.username,
            normalizedUsername: user.profile.normalizedUsername,
            displayName: user.profile.displayName,
            language: user.profile.language,
            selectedCharacterId: user.profile.selectedCharacterId,
            isOnboarded: user.profile.isOnboarded,
            createdAt: user.profile.createdAt.toISOString(),
            updatedAt: user.profile.updatedAt.toISOString(),
          }
        : null,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: this.accessExpiresInSeconds,
      },
    };
  }

  private generateRawAccessToken(userId: string, sessionId: string): string {
    return this.jwtService.sign(
      {
        sub: userId,
        sessionId,
      },
      {
        secret: this.accessSecret,
        expiresIn: this.accessExpiresInSeconds,
      },
    );
  }

  private generateRawRefreshToken(userId: string, sessionId: string, tokenFamily: string): string {
    return this.jwtService.sign(
      {
        sub: userId,
        sessionId,
        tokenFamily,
      },
      {
        secret: this.refreshSecret,
        expiresIn: `${this.refreshExpiresInDays}d`,
      },
    );
  }
}
