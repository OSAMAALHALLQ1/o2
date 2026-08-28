import {
  Injectable,
  BadRequestException,
  ConflictException,
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
  hashEconomyRequest,
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
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero.');
    }

    const normalizedSourceId = sourceId || null;
    const requestFingerprint = hashEconomyRequest(userId, 'GRANT_ITEM:v1', {
      itemId,
      quantity,
      sourceType,
      sourceId: normalizedSourceId,
    });

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Step 1: Idempotency pre-check
        const existingEntry = await tx.inventoryLedgerEntry.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey } },
        });

        if (existingEntry) {
          this.assertInventoryReplayMatches(
            existingEntry,
            itemId,
            'GRANT',
            quantity,
            sourceType,
            normalizedSourceId,
            requestFingerprint,
          );
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

        await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;

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
        await tx.$queryRaw`SELECT "id" FROM "user_inventories" WHERE "id" = ${inventory.id} FOR UPDATE`;

        const lockedInv = await tx.userInventory.findUniqueOrThrow({
          where: { id: inventory.id },
          include: { item: true },
        });

        // If non-stackable cosmetic and already owned, keep at 1
        const newQty = lockedInv.quantity + quantity;
        if (!lockedInv.item.isStackable && (lockedInv.quantity > 0 || quantity !== 1)) {
          throw new ConflictException({
            code: EconomyErrorCodes.ITEM_ALREADY_OWNED,
            message: 'A non-stackable item cannot be granted more than once.',
          });
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
            sourceId: normalizedSourceId,
            idempotencyKey,
            requestFingerprint,
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
          this.assertInventoryReplayMatches(
            saved,
            itemId,
            'GRANT',
            quantity,
            sourceType,
            normalizedSourceId,
            requestFingerprint,
          );
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
    const requestFingerprint = hashEconomyRequest(userId, 'CONSUME:v1', { itemId });
    const now = Date.now();

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Step 1: Idempotency pre-check
        const existingEntry = await tx.inventoryLedgerEntry.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey } },
        });

        if (existingEntry) {
          this.assertInventoryReplayMatches(
            existingEntry,
            itemId,
            'CONSUME',
            1,
            'CONSUMABLE_USE',
            item.slug,
            requestFingerprint,
          );
          const cachedResponse = (existingEntry.metadata as any)?.responsePayload;
          if (cachedResponse) return cachedResponse;
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

        await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;

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

        await tx.$queryRaw`SELECT "id" FROM "user_inventories" WHERE "id" = ${inv.id} FOR UPDATE`;

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

        await tx.$queryRaw`SELECT "id" FROM "companion_care_states" WHERE "userId" = ${userId} FOR UPDATE`;

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

        // Step 6: Update companion care state
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

        const response = {
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

        // Step 7: Write the immutable inventory ledger with a deterministic replay snapshot.
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
            requestFingerprint,
            metadata: { reactionKey: result.reactionKey, clientTransactionId, responsePayload: response },
          },
        });

        return response;
      });
    } catch (err: any) {
      if (err?.code === 'P2002' || err?.message?.includes('23505')) {
        const saved = await this.prisma.inventoryLedgerEntry.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey } },
        });
        if (!saved) {
          throw err;
        }
        this.assertInventoryReplayMatches(
          saved,
          itemId,
          'CONSUME',
          1,
          'CONSUMABLE_USE',
          item.slug,
          requestFingerprint,
        );
        const recoveredResponse = (saved.metadata as any)?.responsePayload;
        if (recoveredResponse) return recoveredResponse;
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
    const rows = await this.prisma.$queryRaw<Array<{
      itemId: string;
      inventoryQty: number | null;
      calculatedFromLedger: bigint | number | null;
    }>>`
      WITH inventory AS (
        SELECT "itemId", "quantity" FROM "user_inventories" WHERE "userId" = ${userId}
      ), ledger AS (
        SELECT "itemId",
          SUM(CASE WHEN "direction" = 'GRANT' THEN "quantity" ELSE -"quantity" END)::bigint AS quantity
        FROM "inventory_ledger_entries"
        WHERE "userId" = ${userId}
        GROUP BY "itemId"
      )
      SELECT COALESCE(i."itemId", l."itemId") AS "itemId",
        i."quantity" AS "inventoryQty", l.quantity AS "calculatedFromLedger"
      FROM inventory i
      FULL OUTER JOIN ledger l ON i."itemId" = l."itemId"
      WHERE i."itemId" IS NULL
         OR l."itemId" IS NULL
         OR i."quantity" <> l.quantity
    `;

    const differences = rows.map((row) => ({
      itemId: row.itemId,
      inventoryQty: row.inventoryQty,
      calculatedFromLedger: row.calculatedFromLedger?.toString() ?? '0',
    }));

    return {
      isReconciled: differences.length === 0,
      differences,
    };
  }

  private assertInventoryReplayMatches(
    entry: any,
    itemId: string,
    direction: 'GRANT' | 'CONSUME',
    quantity: number,
    sourceType: string,
    sourceId: string | null,
    requestFingerprint: string,
  ) {
    const legacyFingerprint =
      `legacy-inventory:${direction}:${itemId}:${quantity}:${sourceType}:${sourceId ?? ''}`;
    if (
      entry.itemId !== itemId ||
      entry.direction !== direction ||
      entry.quantity !== quantity ||
      entry.sourceType !== sourceType ||
      entry.sourceId !== sourceId ||
      (entry.requestFingerprint !== requestFingerprint && entry.requestFingerprint !== legacyFingerprint)
    ) {
      throw new ConflictException({
        code: EconomyErrorCodes.IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST,
        message: 'Idempotency key reused with different request parameters.',
      });
    }
  }
}
