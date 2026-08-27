import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  UserInventoryItemDto,
  ItemType,
  ItemRarity,
  CosmeticSlot,
} from '@o2/types';
import {
  applyConsumableItem,
  EconomyErrorCodes,
} from '@o2/game-core';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Internal trusted item grant function.
   * Atomically upserts user inventory and creates an append-only inventory ledger record.
   */
  async grantItem(
    userId: string,
    itemId: string,
    quantity: number,
    sourceType: string,
    idempotencyKey: string,
    sourceId?: string,
    metadata?: Record<string, unknown>,
  ) {
    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Step 1: Idempotency pre-check
        const existingEntry = await tx.inventoryLedgerEntry.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey } },
        });

        if (existingEntry) {
          const inv = await tx.userInventory.findUnique({
            where: { userId_itemId: { userId, itemId } },
            include: { item: true },
          });
          return {
            status: 'CACHED' as const,
            entry: existingEntry,
            inventory: inv,
          };
        }

        // Step 2: Lock or create inventory row
        let inventory = await tx.userInventory.findUnique({
          where: { userId_itemId: { userId, itemId } },
        });

        if (!inventory) {
          inventory = await tx.userInventory.create({
            data: {
              userId,
              itemId,
              quantity: 0,
            },
          });
        }

        // Lock row
        await tx.$queryRawUnsafe(
          `SELECT "id" FROM "user_inventories" WHERE "id" = $1 FOR UPDATE`,
          inventory.id,
        );

        const lockedInv = await tx.userInventory.findUniqueOrThrow({
          where: { id: inventory.id },
          include: { item: true },
        });

        // If non-stackable cosmetic and already owned, keep at 1
        let newQty = lockedInv.quantity + quantity;
        if (!lockedInv.item.isStackable && newQty > 1) {
          newQty = 1;
        }

        // Step 3: Insert inventory ledger entry
        const entry = await tx.inventoryLedgerEntry.create({
          data: {
            userId,
            itemId,
            direction: 'GRANT',
            quantity,
            quantityAfter: newQty,
            sourceType,
            sourceId: sourceId || null,
            idempotencyKey,
            metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
          },
        });

        // Step 4: Update inventory projection
        const updatedInv = await tx.userInventory.update({
          where: { id: inventory.id },
          data: { quantity: newQty },
          include: { item: true },
        });

        return {
          status: 'APPLIED' as const,
          entry,
          inventory: updatedInv,
        };
      });
    } catch (err: any) {
      if (err?.code === 'P2002' || err?.message?.includes('23505')) {
        const saved = await this.prisma.inventoryLedgerEntry.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey } },
        });
        if (saved) {
          const inv = await this.prisma.userInventory.findUnique({
            where: { userId_itemId: { userId, itemId } },
            include: { item: true },
          });
          return {
            status: 'RECOVERED' as const,
            entry: saved,
            inventory: inv,
          };
        }
      }
      throw err;
    }
  }

  /**
   * Consume an item from user inventory and apply its authoritative effects to the living companion.
   */
  async consumeItem(userId: string, itemId: string, clientTransactionId: string) {
    const item = await this.prisma.itemDefinition.findUnique({
      where: { id: itemId },
    });

    if (!item || !item.isActive) {
      throw new NotFoundException({
        code: EconomyErrorCodes.ITEM_NOT_FOUND,
        message: 'العنصر غير موجود أو غير متاح.',
      });
    }

    if (item.type !== 'CONSUMABLE') {
      throw new BadRequestException({
        code: EconomyErrorCodes.ITEM_NOT_CONSUMABLE,
        message: 'هذا العنصر ليس قابلاً للاستهلاك.',
      });
    }

    const idempotencyKey = `consume:${userId}:${clientTransactionId}`;
    const now = Date.now();

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Step 1: Idempotency pre-check
        const existingEntry = await tx.inventoryLedgerEntry.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey } },
        });

        if (existingEntry) {
          const companionState = await tx.companionCareState.findUnique({ where: { userId } });
          const inv = await tx.userInventory.findUnique({
            where: { userId_itemId: { userId, itemId } },
            include: { item: true },
          });
          return {
            status: 'CACHED',
            consumedItem: inv,
            companionState,
          };
        }

        // Step 2: Lock user inventory row
        const inv = await tx.userInventory.findUnique({
          where: { userId_itemId: { userId, itemId } },
        });

        if (!inv || inv.quantity < 1) {
          throw new BadRequestException({
            code: EconomyErrorCodes.ITEM_NOT_AVAILABLE,
            message: 'لا تملك كمية كافية من هذا العنصر.',
          });
        }

        await tx.$queryRawUnsafe(
          `SELECT "id" FROM "user_inventories" WHERE "id" = $1 FOR UPDATE`,
          inv.id,
        );

        const lockedInv = await tx.userInventory.findUniqueOrThrow({
          where: { id: inv.id },
        });

        if (lockedInv.quantity < 1) {
          throw new BadRequestException({
            code: EconomyErrorCodes.ITEM_NOT_AVAILABLE,
            message: 'لا تملك كمية كافية من هذا العنصر.',
          });
        }

        // Step 3: Ensure companion care state exists and lock row
        const existingCare = await tx.companionCareState.findUnique({
          where: { userId },
        });

        if (!existingCare) {
          await tx.companionCareState.create({
            data: {
              userId,
              hunger: 80.0,
              cleanliness: 80.0,
              energy: 80.0,
              mood: 80.0,
              isSleeping: false,
            },
          });
        }

        await tx.$queryRawUnsafe(
          `SELECT "id" FROM "companion_care_states" WHERE "userId" = $1 FOR UPDATE`,
          userId,
        );

        const lockedCare = await tx.companionCareState.findUniqueOrThrow({
          where: { userId },
        });

        // Step 4: Apply consumable effects via Game Core simulation engine
        const rawCare = {
          hunger: Number(lockedCare.hunger),
          cleanliness: Number(lockedCare.cleanliness),
          energy: Number(lockedCare.energy),
          mood: Number(lockedCare.mood),
          isSleeping: lockedCare.isSleeping,
          sleepStartedAt: lockedCare.sleepStartedAt,
          lastSimulatedAt: lockedCare.lastSimulatedAt,
          lastInteractionAt: lockedCare.lastInteractionAt,
        };

        const result = applyConsumableItem(
          rawCare,
          {
            hungerDelta: item.hungerDelta,
            cleanlinessDelta: item.cleanlinessDelta,
            energyDelta: item.energyDelta,
            moodDelta: item.moodDelta,
            reactionKey: item.reactionKey,
          },
          now,
        );

        // Step 5: Decrement inventory
        const newQty = lockedInv.quantity - 1;
        const updatedInv = await tx.userInventory.update({
          where: { id: lockedInv.id },
          data: { quantity: newQty },
          include: { item: true },
        });

        // Step 6: Write inventory ledger entry
        await tx.inventoryLedgerEntry.create({
          data: {
            userId,
            itemId,
            direction: 'CONSUME',
            quantity: 1,
            quantityAfter: newQty,
            sourceType: 'CONSUMABLE_USE',
            sourceId: item.slug,
            idempotencyKey,
            metadata: { reactionKey: result.reactionKey, clientTransactionId },
          },
        });

        // Step 7: Update companion care state
        const updatedCare = await tx.companionCareState.update({
          where: { userId },
          data: {
            hunger: result.updatedState.hunger,
            cleanliness: result.updatedState.cleanliness,
            energy: result.updatedState.energy,
            mood: result.updatedState.mood,
            lastSimulatedAt: new Date(now),
            lastInteractionAt: new Date(now),
          },
        });

        return {
          status: 'APPLIED',
          consumedItem: updatedInv,
          companionState: {
            ...result.effectiveState,
            id: updatedCare.id,
            userId,
            reaction: 'FED',
          },
          reactionKey: result.reactionKey,
        };
      });
    } catch (err: any) {
      if (err?.code === 'P2002' || err?.message?.includes('23505')) {
        const inv = await this.prisma.userInventory.findUnique({
          where: { userId_itemId: { userId, itemId } },
          include: { item: true },
        });
        const companionState = await this.prisma.companionCareState.findUnique({ where: { userId } });
        return {
          status: 'RECOVERED',
          consumedItem: inv,
          companionState,
        };
      }
      throw err;
    }
  }

  /**
   * Returns user inventory with full item definitions and equipped status.
   */
  async getUserInventory(userId: string): Promise<UserInventoryItemDto[]> {
    const inventories = await this.prisma.userInventory.findMany({
      where: {
        userId,
        quantity: { gt: 0 },
      },
      include: {
        item: true,
      },
      orderBy: { item: { sortOrder: 'asc' } },
    });

    const equipped = await this.prisma.equippedCosmetic.findMany({
      where: { userId },
      select: { itemId: true },
    });
    const equippedSet = new Set(equipped.map((e) => e.itemId));

    return inventories.map((inv) => ({
      id: inv.id,
      itemId: inv.itemId,
      quantity: inv.quantity,
      isEquipped: equippedSet.has(inv.itemId),
      item: {
        id: inv.item.id,
        slug: inv.item.slug,
        type: inv.item.type as ItemType,
        rarity: inv.item.rarity as ItemRarity,
        nameAr: inv.item.nameAr,
        nameEn: inv.item.nameEn,
        descriptionAr: inv.item.descriptionAr,
        descriptionEn: inv.item.descriptionEn,
        assetKey: inv.item.assetKey,
        cosmeticSlot: inv.item.cosmeticSlot as CosmeticSlot | null,
        hungerDelta: inv.item.hungerDelta,
        cleanlinessDelta: inv.item.cleanlinessDelta,
        energyDelta: inv.item.energyDelta,
        moodDelta: inv.item.moodDelta,
        reactionKey: inv.item.reactionKey,
        isActive: inv.item.isActive,
        isStackable: inv.item.isStackable,
        sortOrder: inv.item.sortOrder,
      },
    }));
  }

  /**
   * Reconciliation audit for user inventory.
   */
  async reconcileUserInventory(userId: string) {
    const inventories = await this.prisma.userInventory.findMany({
      where: { userId },
    });
    const differences: any[] = [];

    for (const inv of inventories) {
      const grants = await this.prisma.inventoryLedgerEntry.aggregate({
        where: { userId, itemId: inv.itemId, direction: 'GRANT' },
        _sum: { quantity: true },
      });
      const consumes = await this.prisma.inventoryLedgerEntry.aggregate({
        where: { userId, itemId: inv.itemId, direction: 'CONSUME' },
        _sum: { quantity: true },
      });
      const revokes = await this.prisma.inventoryLedgerEntry.aggregate({
        where: { userId, itemId: inv.itemId, direction: 'REVOKE' },
        _sum: { quantity: true },
      });

      const totalGrants = grants._sum.quantity ?? 0;
      const totalConsumes = consumes._sum.quantity ?? 0;
      const totalRevokes = revokes._sum.quantity ?? 0;
      const calculatedQty = totalGrants - totalConsumes - totalRevokes;

      // Note: for non-stackable items, quantity is capped at 1
      if (calculatedQty !== inv.quantity && calculatedQty < 0) {
        differences.push({
          itemId: inv.itemId,
          inventoryQty: inv.quantity,
          calculatedFromLedger: calculatedQty,
        });
      }
    }

    return {
      isReconciled: differences.length === 0,
      differences,
    };
  }
}
