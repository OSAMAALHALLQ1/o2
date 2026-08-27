import {
  Injectable,
  BadRequestException,
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
import { EconomyErrorCodes } from '@o2/game-core';

@Injectable()
export class CosmeticsService {
  private readonly logger = new Logger(CosmeticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves all equipped cosmetics for a user mapped by slot.
   */
  async getEquippedCosmetics(userId: string): Promise<EquippedCosmeticsOverviewDto> {
    const equipped = await this.prisma.equippedCosmetic.findMany({
      where: { userId },
      include: { item: true },
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
          assetKey: eq.item.assetKey,
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
  async equipCosmetic(userId: string, itemId: string, _clientTransactionId: string) {
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

    // Atomically replace/upsert equipped item for the slot
    const equipped = await this.prisma.equippedCosmetic.upsert({
      where: { userId_slot: { userId, slot } },
      update: {
        itemId,
        equippedAt: new Date(),
      },
      create: {
        userId,
        slot,
        itemId,
      },
      include: { item: true },
    });

    return {
      status: 'EQUIPPED',
      slot: equipped.slot as CosmeticSlot,
      equippedCosmetic: {
        slot: equipped.slot as CosmeticSlot,
        itemId: equipped.itemId,
        item: equipped.item,
        equippedAt: equipped.equippedAt.toISOString(),
      },
    };
  }

  /**
   * Unequips a cosmetic item from a given slot. Idempotent.
   */
  async unequipCosmetic(userId: string, slot: CosmeticSlot, _clientTransactionId: string) {
    const existing = await this.prisma.equippedCosmetic.findUnique({
      where: { userId_slot: { userId, slot } },
    });

    if (existing) {
      await this.prisma.equippedCosmetic.delete({
        where: { userId_slot: { userId, slot } },
      });
    }

    return {
      status: 'UNEQUIPPED',
      slot,
      message: 'تم إلغاء تجهيز العنصر بنجاح.',
    };
  }
}
