import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StarterCompanionDto, UsernameCheckResult } from '@o2/types';
import { SetUsernameDto } from './dto/username.dto';
import { SelectCompanionDto } from './dto/companion.dto';

const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'system',
  'support',
  'moderator',
  'mod',
  'o2',
  'o2universe',
  'official',
  'root',
  'guest',
  'security',
]);

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string, activeSessionId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: {
          include: { selectedCharacter: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    return {
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
            selectedCharacter: user.profile.selectedCharacter,
            isOnboarded: user.profile.isOnboarded,
            createdAt: user.profile.createdAt.toISOString(),
            updatedAt: user.profile.updatedAt.toISOString(),
          }
        : null,
      activeSessionId,
    };
  }

  async checkUsernameAvailability(username: string): Promise<UsernameCheckResult> {
    const trimmed = username.trim();
    const normalized = trimmed.toLowerCase();

    if (trimmed.length < 3) {
      return { username: trimmed, available: false, reason: 'يجب أن لا يقل اسم المستخدم عن 3 أحرف' };
    }
    if (trimmed.length > 20) {
      return { username: trimmed, available: false, reason: 'يجب أن لا يزيد اسم المستخدم عن 20 حرفاً' };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return { username: trimmed, available: false, reason: 'يجب أن يحتوي اسم المستخدم على أحرف وأرقام وشرطة سفلية فقط' };
    }
    if (RESERVED_USERNAMES.has(normalized)) {
      return { username: trimmed, available: false, reason: 'اسم المستخدم هذا محجوز من قبل النظام' };
    }

    const existing = await this.prisma.playerProfile.findUnique({
      where: { normalizedUsername: normalized },
    });

    if (existing) {
      return { username: trimmed, available: false, reason: 'اسم المستخدم محجوز بالفعل' };
    }

    return { username: trimmed, available: true };
  }

  async setUsername(userId: string, dto: SetUsernameDto) {
    const check = await this.checkUsernameAvailability(dto.username);
    if (!check.available) {
      throw new ConflictException(check.reason || 'اسم المستخدم غير متاح');
    }

    const trimmed = dto.username.trim();
    const normalized = trimmed.toLowerCase();

    const profile = await this.prisma.playerProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('الملف الشخصي غير موجود');
    }

    const isOnboarded = Boolean(profile.selectedCharacterId);

    const updated = await this.prisma.playerProfile.update({
      where: { userId },
      data: {
        username: trimmed,
        normalizedUsername: normalized,
        displayName: profile.displayName || trimmed,
        isOnboarded,
      },
    });

    this.logger.log(`User [${userId}] set username: ${trimmed}`);
    return updated;
  }

  async getStarterCompanions(): Promise<StarterCompanionDto[]> {
    const characters = await this.prisma.character.findMany({
      where: {
        isStarter: true,
        isActive: true,
      },
      orderBy: {
        sortOrder: 'asc',
      },
    });

    return characters.map((c) => ({
      id: c.id,
      slug: c.slug,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      descriptionAr: c.descriptionAr,
      archetype: c.archetype,
      placeholderAsset: c.placeholderAsset,
      isStarter: c.isStarter,
      sortOrder: c.sortOrder,
    }));
  }

  async selectPermanentStarterCompanion(userId: string, dto: SelectCompanionDto) {
    const character = await this.prisma.character.findUnique({
      where: { id: dto.characterId },
    });

    if (!character || !character.isActive || !character.isStarter) {
      throw new BadRequestException('الرفيق المختار غير صالح أو غير متاح كرفيق بداية');
    }

    const profile = await this.prisma.playerProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('الملف الشخصي غير موجود');
    }

    // PERMANENT SELECTION ENFORCEMENT:
    // Once a starter companion is chosen, the player cannot switch it without explicit future game mechanics
    if (profile.selectedCharacterId) {
      this.logger.warn(`User [${userId}] attempted to re-select starter companion while already owning [${profile.selectedCharacterId}]`);
      throw new ConflictException('تم اختيار رفيق البداية الدائم مسبقاً ولا يمكن تغييره');
    }

    const isOnboarded = Boolean(profile.username);

    const updatedProfile = await this.prisma.playerProfile.update({
      where: { userId },
      data: {
        selectedCharacterId: character.id,
        isOnboarded,
      },
    });

    this.logger.log(`User [${userId}] permanently selected starter companion [${character.slug}]`);

    return {
      success: true,
      selectedCharacter: {
        id: character.id,
        slug: character.slug,
        nameAr: character.nameAr,
        nameEn: character.nameEn,
        descriptionAr: character.descriptionAr,
        archetype: character.archetype,
        placeholderAsset: character.placeholderAsset,
        isStarter: character.isStarter,
        sortOrder: character.sortOrder,
      },
      profile: {
        userId: updatedProfile.userId,
        username: updatedProfile.username,
        selectedCharacterId: updatedProfile.selectedCharacterId,
        isOnboarded: updatedProfile.isOnboarded,
      },
    };
  }
}
