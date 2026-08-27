import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  role: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('رمز الوصول مفقود أو غير صالح');
    }

    const token = authHeader.substring(7);
    const secret = this.configService.get<string>('JWT_ACCESS_SECRET') || 'dev-jwt-access-secret-min-32-chars-long';

    let payload: any;
    try {
      payload = this.jwtService.verify(token, { secret });
    } catch {
      throw new UnauthorizedException('رمز الوصول غير صالح أو منتهي الصلاحية');
    }

    if (!payload.sub || !payload.sessionId) {
      throw new UnauthorizedException('بنية رمز الوصول غير صالحة');
    }

    // Verify session validity and user moderation status in database
    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sessionId },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('تم تسجيل الخروج من هذه الجلسة أو انتهت صلاحيتها');
    }

    if (session.user.moderationStatus === 'BANNED' || session.user.moderationStatus === 'SUSPENDED') {
      throw new UnauthorizedException('تم حظر هذا الحساب من قبل إدارة O2 Universe');
    }

    request.user = {
      userId: session.userId,
      sessionId: session.id,
      role: session.user.role,
    };

    return true;
  }
}
