import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { RealtimeErrorCodes, type RealtimeErrorCode } from '@o2/types';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { AuthenticatedSocketIdentity } from '../transport/realtime-connection.interface';

export class RealtimeAuthError extends Error {
  readonly code: RealtimeErrorCode;

  constructor(code: RealtimeErrorCode, message: string) {
    super(message);
    this.name = 'RealtimeAuthError';
    this.code = code;
  }
}

export class RealtimeAuth {
  private readonly jwtService: JwtService;
  private readonly configService: ConfigService;
  private readonly prisma: PrismaService;

  constructor(
    jwtService: JwtService,
    configService: ConfigService,
    prisma: PrismaService,
  ) {
    this.jwtService = jwtService;
    this.configService = configService;
    this.prisma = prisma;
  }

  async authenticateHandshake(token?: string | null): Promise<AuthenticatedSocketIdentity> {
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      throw new RealtimeAuthError(
        RealtimeErrorCodes.UNAUTHORIZED,
        'رمز الوصول مفقود أو غير صالح',
      );
    }

    const cleanToken = token.startsWith('Bearer ') ? token.substring(7) : token;
    const secret =
      this.configService.get<string>('JWT_ACCESS_SECRET') ||
      'dev-jwt-access-secret-min-32-chars-long';

    let payload: any;
    try {
      payload = this.jwtService.verify(cleanToken, { secret });
    } catch {
      throw new RealtimeAuthError(
        RealtimeErrorCodes.UNAUTHORIZED,
        'رمز الوصول غير صالح أو منتهي الصلاحية',
      );
    }

    if (!payload?.sub || !payload?.sessionId) {
      throw new RealtimeAuthError(
        RealtimeErrorCodes.UNAUTHORIZED,
        'بنية رمز الوصول غير صالحة',
      );
    }

    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sessionId },
      include: { user: true },
    });

    if (!session) {
      throw new RealtimeAuthError(
        RealtimeErrorCodes.SESSION_REVOKED,
        'جلسة الدخول غير موجودة',
      );
    }

    if (session.revokedAt) {
      throw new RealtimeAuthError(
        RealtimeErrorCodes.SESSION_REVOKED,
        'تم تسجيل الخروج من هذه الجلسة',
      );
    }

    if (session.expiresAt < new Date()) {
      throw new RealtimeAuthError(
        RealtimeErrorCodes.SESSION_EXPIRED,
        'انتهت صلاحية جلسة الدخول',
      );
    }

    if (
      session.user.moderationStatus === 'BANNED' ||
      session.user.moderationStatus === 'SUSPENDED'
    ) {
      throw new RealtimeAuthError(
        RealtimeErrorCodes.ACCOUNT_RESTRICTED,
        'تم حظر هذا الحساب من قبل إدارة O2 Universe',
      );
    }

    return {
      connectionId: randomUUID(),
      userId: session.userId,
      sessionId: session.id,
      role: session.user.role,
    };
  }
}
