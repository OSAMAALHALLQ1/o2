import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordUtil } from './crypto/password.util';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthSessionResponse, AuthTokens } from '@o2/types';
import { OAuthAdapter } from './adapters/oauth.adapter';

import { normalizeEmail } from './utils/email.util';

export { normalizeEmail };

export const ACCESS_TOKEN_EXPIRATION = '15m';
export const REFRESH_TOKEN_EXPIRATION_DAYS = 30;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly oauthAdapter: OAuthAdapter,
  ) {}

  private getJwtAccessSecret(): string {
    return (
      this.configService.get<string>('JWT_ACCESS_SECRET') ||
      'dev-jwt-access-secret-change-in-prod-min-32-chars-length'
    );
  }

  private generateSecureTokenString(): string {
    return `o2_rt_${crypto.randomBytes(32).toString('hex')}`;
  }

  async register(dto: RegisterDto, deviceInfo?: string): Promise<AuthSessionResponse> {
    const normalized = normalizeEmail(dto.email);

    const existingIdentity = await this.prisma.authIdentity.findUnique({
      where: {
        provider_providerId: {
          provider: 'EMAIL',
          providerId: normalized,
        },
      },
    });

    if (existingIdentity) {
      throw new ConflictException('البريد الإلكتروني مسجل بالفعل');
    }

    const passwordHash = await PasswordUtil.hash(dto.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          role: 'PLAYER',
          moderationStatus: 'ACTIVE',
        },
      });

      await tx.authIdentity.create({
        data: {
          userId: newUser.id,
          provider: 'EMAIL',
          providerId: normalized,
          passwordHash,
        },
      });

      await tx.playerProfile.create({
        data: {
          userId: newUser.id,
          language: 'ar',
          isOnboarded: false,
        },
      });

      return newUser;
    });

    return this.createSessionAndTokens(user.id, deviceInfo);
  }

  async login(dto: LoginDto, deviceInfo?: string): Promise<AuthSessionResponse> {
    const normalized = normalizeEmail(dto.email);

    const identity = await this.prisma.authIdentity.findUnique({
      where: {
        provider_providerId: {
          provider: 'EMAIL',
          providerId: normalized,
        },
      },
      include: {
        user: true,
      },
    });

    if (!identity || !identity.passwordHash) {
      throw new UnauthorizedException('بيانات الاعتماد غير صحيحة');
    }

    const isPasswordValid = await PasswordUtil.verify(dto.password, identity.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('بيانات الاعتماد غير صحيحة');
    }

    if (identity.user.moderationStatus === 'BANNED' || identity.user.moderationStatus === 'SUSPENDED') {
      throw new ForbiddenException('الحساب موقوف أو محظور');
    }

    return this.createSessionAndTokens(identity.userId, deviceInfo);
  }

  async loginWithGoogle(idToken: string, deviceInfo?: string): Promise<AuthSessionResponse> {
    const payload = await this.oauthAdapter.verifyGoogleToken(idToken);
    return this.handleOAuthIdentity('GOOGLE', payload.providerId, payload.email, payload.displayName, deviceInfo);
  }

  async loginWithApple(identityToken: string, rawNonce?: string, deviceInfo?: string): Promise<AuthSessionResponse> {
    const payload = await this.oauthAdapter.verifyAppleToken(identityToken, rawNonce);
    return this.handleOAuthIdentity('APPLE', payload.providerId, payload.email, payload.displayName, deviceInfo);
  }

  /**
   * OAuth Account-Linking Policy:
   * Multi-provider identities are strictly mapped by (provider, providerId).
   * We NEVER automatically merge OAuth accounts into existing password accounts based purely on email.
   */
  private async handleOAuthIdentity(
    provider: 'GOOGLE' | 'APPLE',
    providerId: string,
    email?: string,
    displayName?: string,
    deviceInfo?: string,
  ): Promise<AuthSessionResponse> {
    const identity = await this.prisma.authIdentity.findUnique({
      where: {
        provider_providerId: { provider, providerId },
      },
      include: { user: true },
    });

    if (identity) {
      if (identity.user.moderationStatus === 'BANNED' || identity.user.moderationStatus === 'SUSPENDED') {
        throw new ForbiddenException('الحساب موقوف أو محظور');
      }
      return this.createSessionAndTokens(identity.userId, deviceInfo);
    }

    // First time OAuth user creation
    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          role: 'PLAYER',
          moderationStatus: 'ACTIVE',
        },
      });

      await tx.authIdentity.create({
        data: {
          userId: newUser.id,
          provider,
          providerId,
        },
      });

      await tx.playerProfile.create({
        data: {
          userId: newUser.id,
          displayName: displayName || null,
          language: 'ar',
          isOnboarded: false,
        },
      });

      return newUser;
    });

    return this.createSessionAndTokens(user.id, deviceInfo);
  }

  /**
   * Atomic Token Generation: Creates UserSession and first RefreshTokenRecord in a transaction.
   */
  private async createSessionAndTokens(userId: string, deviceInfo?: string): Promise<AuthSessionResponse> {
    const familyId = crypto.randomUUID();
    const rawRefreshToken = this.generateSecureTokenString();
    const tokenHash = PasswordUtil.hashRefreshToken(rawRefreshToken);

    const sessionExpiresAt = new Date();
    sessionExpiresAt.setDate(sessionExpiresAt.getDate() + REFRESH_TOKEN_EXPIRATION_DAYS);

    const { session } = await this.prisma.$transaction(async (tx) => {
      const newSession = await tx.userSession.create({
        data: {
          userId,
          familyId,
          deviceInfo: deviceInfo || null,
          expiresAt: sessionExpiresAt,
        },
      });

      await tx.refreshTokenRecord.create({
        data: {
          sessionId: newSession.id,
          familyId,
          tokenHash,
          expiresAt: sessionExpiresAt,
        },
      });

      return { session: newSession };
    });

    const accessToken = this.generateAccessToken(userId, session.id, familyId);

    const fullProfile = await this.prisma.playerProfile.findUnique({
      where: { userId },
      include: { selectedCharacter: true },
    });

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    return {
      sessionId: session.id,
      tokens: {
        accessToken,
        refreshToken: rawRefreshToken,
        expiresIn: 900, // 15 minutes
      },
      user: {
        id: user.id,
        role: user.role,
        moderationStatus: user.moderationStatus,
        createdAt: user.createdAt.toISOString(),
        lastActiveAt: user.lastActiveAt.toISOString(),
      },
      profile: fullProfile
        ? {
            userId: fullProfile.userId,
            username: fullProfile.username,
            normalizedUsername: fullProfile.normalizedUsername,
            displayName: fullProfile.displayName,
            language: fullProfile.language,
            selectedCharacterId: fullProfile.selectedCharacterId,
            isOnboarded: fullProfile.isOnboarded,
            createdAt: fullProfile.createdAt.toISOString(),
            updatedAt: fullProfile.updatedAt.toISOString(),
          }
        : null,
    };
  }

  /**
   * Refresh Token Rotation with Atomic Consumption & Family Replay Attack Revocation
   */
  async refreshTokens(dto: RefreshTokenDto, ipAddress?: string): Promise<AuthTokens> {
    if (!dto.refreshToken || typeof dto.refreshToken !== 'string') {
      throw new BadRequestException('رمز التجديد مطلوب');
    }

    const tokenHash = PasswordUtil.hashRefreshToken(dto.refreshToken);

    const tokenRecord = await this.prisma.refreshTokenRecord.findUnique({
      where: { tokenHash },
      include: {
        session: {
          include: { user: true },
        },
      },
    });

    if (!tokenRecord) {
      this.logger.warn(`Refresh attempt with non-existent token hash [${tokenHash.slice(0, 8)}]`);
      throw new UnauthorizedException('رمز التجديد غير صالح');
    }

    // REPLAY ATTACK DETECTION:
    // If the token was already consumed or revoked, someone is replaying a stolen/expired token.
    // Immediately revoke the ENTIRE token family/session family!
    if (tokenRecord.consumedAt !== null || tokenRecord.revokedAt !== null) {
      this.logger.error(
        `[SECURITY_ALERT: REFRESH_TOKEN_REPLAY] Replay detected for familyId: [${tokenRecord.familyId}], sessionId: [${tokenRecord.sessionId}]. Revoking entire session family.`,
      );

      const now = new Date();
      await this.prisma.$transaction([
        this.prisma.refreshTokenRecord.updateMany({
          where: { familyId: tokenRecord.familyId },
          data: { revokedAt: now },
        }),
        this.prisma.userSession.updateMany({
          where: { familyId: tokenRecord.familyId },
          data: { revokedAt: now },
        }),
      ]);

      throw new UnauthorizedException('تم اكتشاف محاولة إعادة استخدام رمز أمان قديم. تم إبطال الجلسة لحمايتك.');
    }

    // Check expiration
    if (new Date() > tokenRecord.expiresAt) {
      throw new UnauthorizedException('رمز التجديد منتهي الصلاحية');
    }

    // Check session validity
    if (tokenRecord.session.revokedAt !== null) {
      throw new UnauthorizedException('الجلسة ملغاة');
    }

    // Check account status
    if (
      tokenRecord.session.user.moderationStatus === 'BANNED' ||
      tokenRecord.session.user.moderationStatus === 'SUSPENDED'
    ) {
      throw new ForbiddenException('الحساب موقوف أو محظور');
    }

    // ATOMIC ROTATION
    const newRawRefreshToken = this.generateSecureTokenString();
    const newTokenHash = PasswordUtil.hashRefreshToken(newRawRefreshToken);
    const now = new Date();

    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + REFRESH_TOKEN_EXPIRATION_DAYS);

    await this.prisma.$transaction(async (tx) => {
      // 1. Create new child RefreshTokenRecord
      const newChildRecord = await tx.refreshTokenRecord.create({
        data: {
          sessionId: tokenRecord.sessionId,
          familyId: tokenRecord.familyId,
          tokenHash: newTokenHash,
          expiresAt: newExpiresAt,
        },
      });

      // 2. Mark current record as consumed atomically
      await tx.refreshTokenRecord.update({
        where: { id: tokenRecord.id },
        data: {
          consumedAt: now,
          replacedByTokenId: newChildRecord.id,
        },
      });

      // 3. Update session lastUsedAt
      await tx.userSession.update({
        where: { id: tokenRecord.sessionId },
        data: {
          lastUsedAt: now,
          ipAddress: ipAddress || undefined,
        },
      });
    });

    const newAccessToken = this.generateAccessToken(
      tokenRecord.session.userId,
      tokenRecord.sessionId,
      tokenRecord.familyId,
    );

    return {
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
      expiresIn: 900,
    };
  }

  async logout(sessionId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.userSession.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.refreshTokenRecord.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }

  async logoutAll(userId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.refreshTokenRecord.updateMany({
        where: { session: { userId }, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }

  private generateAccessToken(userId: string, sessionId: string, familyId: string): string {
    return this.jwtService.sign(
      {
        sub: userId,
        sessionId,
        familyId,
      },
      {
        secret: this.getJwtAccessSecret(),
        expiresIn: ACCESS_TOKEN_EXPIRATION,
        algorithm: 'HS256',
        issuer: 'o2-universe-auth-service',
        audience: 'o2-universe-clients',
      },
    );
  }
}
