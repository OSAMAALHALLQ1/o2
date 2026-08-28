import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CosmeticSlot,
  EquippedCosmeticsOverviewDto,
  EquippedCosmeticDto,
  ItemType,
  ItemRarity,
} from '@o2/types';
import { EconomyErrorCodes, hashEconomyRequest } from '@o2/game-core';

@Injectable()
export class CosmeticsService {
  private readonly logger = new Logger(CosmeticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves all equipped cosmetics for a user mapped by slot.
   */
  async getEquippedCosmetics(userId: string): Promise<EquippedCosmeticsOverviewDto> {
    const profile = await this.prisma.playerProfile.findUnique({
      where: { userId },
      select: { selectedCharacterId: true },
    });
    const equipped = await this.prisma.equippedCosmetic.findMany({
      where: { userId },
      include: {
        item: {
          include: {
            cosmeticVariants: profile?.selectedCharacterId
              ? { where: { characterId: profile.selectedCharacterId }, take: 1 }
              : false,
          },
        },
      },
    });

    const equippedMap: Record<string, EquippedCosmeticDto> = {};

    for (const eq of equipped) {
      equippedMap[eq.slot] = {
        slot: eq.slot as CosmeticSlot,
        itemId: eq.itemId,
        item: {
          id: eq.item.id,
          slug: eq.item.slug,
          type: eq.item.type as ItemType,
          rarity: eq.item.rarity as ItemRarity,
          nameAr: eq.item.nameAr,
          nameEn: eq.item.nameEn,
          descriptionAr: eq.item.descriptionAr,
          descriptionEn: eq.item.descriptionEn,
          assetKey: eq.item.cosmeticVariants?.[0]?.assetKey ?? eq.item.assetKey,
          cosmeticSlot: eq.item.cosmeticSlot as CosmeticSlot | null,
          hungerDelta: eq.item.hungerDelta,
          cleanlinessDelta: eq.item.cleanlinessDelta,
          energyDelta: eq.item.energyDelta,
          moodDelta: eq.item.moodDelta,
          reactionKey: eq.item.reactionKey,
          isActive: eq.item.isActive,
          isStackable: eq.item.isStackable,
          sortOrder: eq.item.sortOrder,
        },
        equippedAt: eq.equippedAt.toISOString(),
      };
    }

    return { equipped: equippedMap };
  }

  /**
   * Equips an owned cosmetic item to its defined slot.
   * Atomically replaces previous cosmetic in that slot.
   */
  async equipCosmetic(userId: string, itemId: string, clientTransactionId: string) {
    const requestFingerprint = hashEconomyRequest(userId, 'EQUIP:v1', { itemId });
    const cached = await this.getCachedAction(userId, clientTransactionId, requestFingerprint);
    if (cached) return cached;

    const item = await this.prisma.itemDefinition.findUnique({
      where: { id: itemId },
    });

    if (!item || !item.isActive) {
      throw new NotFoundException({
        code: EconomyErrorCodes.ITEM_NOT_FOUND,
        message: 'العنصر غير موجود أو غير متاح.',
      });
    }

    if (item.type !== 'COSMETIC' || !item.cosmeticSlot) {
      throw new BadRequestException({
        code: EconomyErrorCodes.INVALID_COSMETIC_SLOT,
        message: 'هذا العنصر ليس زياً أو إكسسواراً قابلاً للتجهيز.',
      });
    }

    const profile = await this.prisma.playerProfile.findUnique({
      where: { userId },
      select: { selectedCharacterId: true },
    });
    const compatibleVariant = profile?.selectedCharacterId
      ? await this.prisma.cosmeticVariant.findUnique({
          where: { itemId_characterId: { itemId, characterId: profile.selectedCharacterId } },
        })
      : null;
    if (!compatibleVariant) {
      throw new BadRequestException({
        code: EconomyErrorCodes.COSMETIC_INCOMPATIBLE,
        message: 'هذا العنصر غير متوافق مع الرفيق المحدد.',
      });
    }

    // Verify ownership in inventory
    const inventory = await this.prisma.userInventory.findUnique({
      where: { userId_itemId: { userId, itemId } },
    });

    if (!inventory || inventory.quantity < 1) {
      throw new BadRequestException({
        code: EconomyErrorCodes.COSMETIC_NOT_OWNED,
        message: 'لا يمكنك تجهيز عنصر لا تملكه في خزانة مقتنياتك.',
      });
    }

    const slot = item.cosmeticSlot;

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
        const inTxCached = await tx.cosmeticActionRecord.findUnique({
          where: { userId_clientTransactionId: { userId, clientTransactionId } },
        });
        if (inTxCached) {
          this.assertActionFingerprint(inTxCached.requestFingerprint, requestFingerprint);
          return inTxCached.responsePayload as any;
        }

        const owned = await tx.userInventory.findUnique({
          where: { userId_itemId: { userId, itemId } },
        });
        if (!owned || owned.quantity < 1) {
          throw new BadRequestException({
            code: EconomyErrorCodes.COSMETIC_NOT_OWNED,
            message: 'لا يمكنك تجهيز عنصر لا تملكه في خزانة مقتنياتك.',
          });
        }

        const equipped = await tx.equippedCosmetic.upsert({
          where: { userId_slot: { userId, slot } },
          update: { itemId, equippedAt: new Date() },
          create: { userId, slot, itemId },
          include: { item: true },
        });
        const response = {
          status: 'EQUIPPED',
          slot: equipped.slot as CosmeticSlot,
          equippedCosmetic: {
            slot: equipped.slot as CosmeticSlot,
            itemId: equipped.itemId,
            item: equipped.item,
            equippedAt: equipped.equippedAt.toISOString(),
          },
        };
        await tx.cosmeticActionRecord.create({
          data: {
            userId,
            clientTransactionId,
            requestFingerprint,
            operation: 'EQUIP',
            itemId,
            slot,
            responsePayload: response,
          },
        });
        return response;
      });
    } catch (err: any) {
      if (err?.code === 'P2002' || err?.message?.includes('23505')) {
        const recovered = await this.getCachedAction(userId, clientTransactionId, requestFingerprint);
        if (recovered) return recovered;
      }
      throw err;
    }
  }

  /**
   * Unequips a cosmetic item from a given slot. Idempotent.
   */
  async unequipCosmetic(userId: string, slot: CosmeticSlot, clientTransactionId: string) {
    const requestFingerprint = hashEconomyRequest(userId, 'UNEQUIP:v1', { slot });
    const cached = await this.getCachedAction(userId, clientTransactionId, requestFingerprint);
    if (cached) return cached;

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
        const inTxCached = await tx.cosmeticActionRecord.findUnique({
          where: { userId_clientTransactionId: { userId, clientTransactionId } },
        });
        if (inTxCached) {
          this.assertActionFingerprint(inTxCached.requestFingerprint, requestFingerprint);
          return inTxCached.responsePayload as any;
        }

        const existing = await tx.equippedCosmetic.findUnique({
          where: { userId_slot: { userId, slot } },
        });
        if (existing) {
          await tx.equippedCosmetic.delete({ where: { userId_slot: { userId, slot } } });
        }
        const response = {
          status: 'UNEQUIPPED',
          slot,
          message: 'تم إلغاء تجهيز العنصر بنجاح.',
        };
        await tx.cosmeticActionRecord.create({
          data: {
            userId,
            clientTransactionId,
            requestFingerprint,
            operation: 'UNEQUIP',
            itemId: existing?.itemId ?? null,
            slot,
            responsePayload: response,
          },
        });
        return response;
      });
    } catch (err: any) {
      if (err?.code === 'P2002' || err?.message?.includes('23505')) {
        const recovered = await this.getCachedAction(userId, clientTransactionId, requestFingerprint);
        if (recovered) return recovered;
      }
      throw err;
    }
  }

  private async getCachedAction(userId: string, clientTransactionId: string, requestFingerprint: string) {
    const action = await this.prisma.cosmeticActionRecord.findUnique({
      where: { userId_clientTransactionId: { userId, clientTransactionId } },
    });
    if (!action) return null;
    this.assertActionFingerprint(action.requestFingerprint, requestFingerprint);
    return action.responsePayload as any;
  }

  private assertActionFingerprint(saved: string, requested: string) {
    if (saved !== requested) {
      throw new ConflictException({
        code: EconomyErrorCodes.IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST,
        message: 'Idempotency key reused with different request parameters.',
      });
    }
  }
}
