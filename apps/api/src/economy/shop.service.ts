import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ShopOfferDto,
  ShopPurchaseDto,
  CurrencyKind,
  CurrencyScopeType,
  ItemType,
  ItemRarity,
  CosmeticSlot,
} from '@o2/types';
import {
  hashEconomyRequest,
  EconomyErrorCodes,
} from '@o2/game-core';

@Injectable()
export class ShopService {
  private readonly logger = new Logger(ShopService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves active shop offers within valid active time window.
   */
  async getActiveOffers(): Promise<ShopOfferDto[]> {
    const now = new Date();
    const offers = await this.prisma.shopOffer.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      include: {
        item: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    return offers.map((o) => ({
      id: o.id,
      slug: o.slug,
      itemId: o.itemId,
      itemQuantity: o.itemQuantity,
      currencyKind: o.currencyKind as CurrencyKind,
      currencyScopeType: o.currencyScopeType as CurrencyScopeType | null,
      currencyScopeId: o.currencyScopeId,
      priceAmount: Number(o.priceAmount),
      isActive: o.isActive,
      sortOrder: o.sortOrder,
      startsAt: o.startsAt?.toISOString() ?? null,
      endsAt: o.endsAt?.toISOString() ?? null,
      item: {
        id: o.item.id,
        slug: o.item.slug,
        type: o.item.type as ItemType,
        rarity: o.item.rarity as ItemRarity,
        nameAr: o.item.nameAr,
        nameEn: o.item.nameEn,
        descriptionAr: o.item.descriptionAr,
        descriptionEn: o.item.descriptionEn,
        assetKey: o.item.assetKey,
        cosmeticSlot: o.item.cosmeticSlot as CosmeticSlot | null,
        hungerDelta: o.item.hungerDelta,
        cleanlinessDelta: o.item.cleanlinessDelta,
        energyDelta: o.item.energyDelta,
        moodDelta: o.item.moodDelta,
        reactionKey: o.item.reactionKey,
        isActive: o.item.isActive,
        isStackable: o.item.isStackable,
        sortOrder: o.item.sortOrder,
      },
    }));
  }

  /**
   * Purchases a shop offer atomically in a single PostgreSQL transaction with strict row locking.
   */
  async purchaseOffer(userId: string, offerId: string, clientTransactionId: string): Promise<ShopPurchaseDto> {
    const requestFingerprint = hashEconomyRequest(userId, 'SHOP_PURCHASE', { offerId, clientTransactionId });

    // Step 1: Check existing purchase record for idempotency
    const existingPurchase = await this.prisma.shopPurchase.findUnique({
      where: { userId_clientTransactionId: { userId, clientTransactionId } },
      include: { item: true },
    });

    if (existingPurchase) {
      if (existingPurchase.requestFingerprint !== requestFingerprint || existingPurchase.offerId !== offerId) {
        throw new ConflictException({
          code: EconomyErrorCodes.IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST,
          message: 'Idempotency key reused with different request parameters.',
        });
      }

      const inv = await this.prisma.userInventory.findUnique({
        where: { userId_itemId: { userId, itemId: existingPurchase.itemId } },
        include: { item: true },
      });

      const account = await this.prisma.currencyAccount.findUnique({
        where: {
          userId_currencyKind_scopeType_scopeId: {
            userId,
            currencyKind: existingPurchase.currencyKind,
            scopeType: existingPurchase.currencyScopeType,
            scopeId: existingPurchase.currencyScopeId,
          },
        },
      });

      return {
        id: existingPurchase.id,
        offerId: existingPurchase.offerId,
        itemId: existingPurchase.itemId,
        itemQuantity: existingPurchase.itemQuantity,
        currencyKind: existingPurchase.currencyKind as CurrencyKind,
        priceAmount: Number(existingPurchase.priceAmount),
        clientTransactionId: existingPurchase.clientTransactionId,
        createdAt: existingPurchase.createdAt.toISOString(),
        inventoryItem: {
          id: inv?.id ?? '',
          itemId: existingPurchase.itemId,
          quantity: inv?.quantity ?? 1,
          item: existingPurchase.item as any,
        },
        newBalance: Number(account?.balance ?? 0),
      };
    }

    // Step 2: Load and validate offer
    const offer = await this.prisma.shopOffer.findUnique({
      where: { id: offerId },
      include: { item: true },
    });

    if (!offer || !offer.isActive) {
      throw new NotFoundException({
        code: EconomyErrorCodes.OFFER_NOT_FOUND,
        message: 'العرض غير موجود أو غير متاح حالياً.',
      });
    }

    const now = new Date();
    if (offer.startsAt && offer.startsAt > now) {
      throw new BadRequestException({
        code: EconomyErrorCodes.OFFER_NOT_FOUND,
        message: 'العرض لم يبدأ بعد.',
      });
    }
    if (offer.endsAt && offer.endsAt < now) {
      throw new BadRequestException({
        code: EconomyErrorCodes.OFFER_EXPIRED,
        message: 'انتهت صلاحية هذا العرض.',
      });
    }

    if (!offer.item || !offer.item.isActive) {
      throw new BadRequestException({
        code: EconomyErrorCodes.ITEM_INACTIVE,
        message: 'العنصر المرتبط بهذا العرض غير متاح.',
      });
    }

    // Step 3: Atomic Purchase Transaction with Deterministic Locking Order
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Double check idempotency in transaction
        const inTxExisting = await tx.shopPurchase.findUnique({
          where: { userId_clientTransactionId: { userId, clientTransactionId } },
          include: { item: true },
        });
        if (inTxExisting) {
          const inv = await tx.userInventory.findUnique({
            where: { userId_itemId: { userId, itemId: inTxExisting.itemId } },
            include: { item: true },
          });
          const account = await tx.currencyAccount.findUnique({
            where: {
              userId_currencyKind_scopeType_scopeId: {
                userId,
                currencyKind: inTxExisting.currencyKind,
                scopeType: inTxExisting.currencyScopeType,
                scopeId: inTxExisting.currencyScopeId,
              },
            },
          });
          return {
            id: inTxExisting.id,
            offerId: inTxExisting.offerId,
            itemId: inTxExisting.itemId,
            itemQuantity: inTxExisting.itemQuantity,
            currencyKind: inTxExisting.currencyKind as CurrencyKind,
            priceAmount: Number(inTxExisting.priceAmount),
            clientTransactionId: inTxExisting.clientTransactionId,
            createdAt: inTxExisting.createdAt.toISOString(),
            inventoryItem: {
              id: inv?.id ?? '',
              itemId: inTxExisting.itemId,
              quantity: inv?.quantity ?? 1,
              item: inTxExisting.item as any,
            },
            newBalance: Number(account?.balance ?? 0),
          };
        }

        // Lock order 1: Currency Account
        const account = await tx.currencyAccount.findUnique({
          where: {
            userId_currencyKind_scopeType_scopeId: {
              userId,
              currencyKind: offer.currencyKind,
              scopeType: offer.currencyScopeType,
              scopeId: offer.currencyScopeId,
            },
          },
        });

        if (!account) {
          throw new BadRequestException({
            code: EconomyErrorCodes.INSUFFICIENT_FUNDS,
            message: 'رصيد الحساب غير كافٍ لإتمام عملية الشراء.',
          });
        }

        await tx.$queryRawUnsafe(
          `SELECT "id" FROM "currency_accounts" WHERE "id" = $1 FOR UPDATE`,
          account.id,
        );

        const lockedAccount = await tx.currencyAccount.findUniqueOrThrow({
          where: { id: account.id },
        });

        if (lockedAccount.balance < offer.priceAmount) {
          throw new BadRequestException({
            code: EconomyErrorCodes.INSUFFICIENT_FUNDS,
            message: 'رصيد الحساب غير كافٍ لإتمام عملية الشراء.',
          });
        }

        const newBalance = lockedAccount.balance - offer.priceAmount;

        // Debit currency account
        await tx.currencyAccount.update({
          where: { id: account.id },
          data: { balance: newBalance },
        });

        // Insert currency ledger entry
        const currencyLedgerKey = `purchase:${userId}:${clientTransactionId}`;
        await tx.currencyLedgerEntry.create({
          data: {
            userId,
            currencyKind: offer.currencyKind,
            scopeType: offer.currencyScopeType,
            scopeId: offer.currencyScopeId,
            direction: 'DEBIT',
            amount: offer.priceAmount,
            balanceAfter: newBalance,
            sourceType: 'SHOP_PURCHASE',
            sourceId: offer.id,
            idempotencyKey: currencyLedgerKey,
            requestFingerprint,
            metadata: { offerSlug: offer.slug, itemId: offer.itemId, itemQuantity: offer.itemQuantity },
          },
        });

        // Lock order 2: User Inventory
        let inventory = await tx.userInventory.findUnique({
          where: { userId_itemId: { userId, itemId: offer.itemId } },
        });

        if (!inventory) {
          inventory = await tx.userInventory.create({
            data: {
              userId,
              itemId: offer.itemId,
              quantity: 0,
            },
          });
        }

        await tx.$queryRawUnsafe(
          `SELECT "id" FROM "user_inventories" WHERE "id" = $1 FOR UPDATE`,
          inventory.id,
        );

        const lockedInv = await tx.userInventory.findUniqueOrThrow({
          where: { id: inventory.id },
          include: { item: true },
        });

        let newQty = lockedInv.quantity + offer.itemQuantity;
        if (!lockedInv.item.isStackable && newQty > 1) {
          newQty = 1;
        }

        const updatedInv = await tx.userInventory.update({
          where: { id: inventory.id },
          data: { quantity: newQty },
          include: { item: true },
        });

        // Insert inventory ledger entry
        const invLedgerKey = `purchase_inv:${userId}:${clientTransactionId}`;
        await tx.inventoryLedgerEntry.create({
          data: {
            userId,
            itemId: offer.itemId,
            direction: 'GRANT',
            quantity: offer.itemQuantity,
            quantityAfter: newQty,
            sourceType: 'SHOP_PURCHASE',
            sourceId: offer.id,
            idempotencyKey: invLedgerKey,
            metadata: { clientTransactionId },
          },
        });

        // Lock order 3: Shop Purchase audit record
        const purchase = await tx.shopPurchase.create({
          data: {
            userId,
            offerId: offer.id,
            itemId: offer.itemId,
            itemQuantity: offer.itemQuantity,
            currencyKind: offer.currencyKind,
            currencyScopeType: offer.currencyScopeType,
            currencyScopeId: offer.currencyScopeId,
            priceAmount: offer.priceAmount,
            clientTransactionId,
            requestFingerprint,
          },
          include: { item: true },
        });

        return {
          id: purchase.id,
          offerId: purchase.offerId,
          itemId: purchase.itemId,
          itemQuantity: purchase.itemQuantity,
          currencyKind: purchase.currencyKind as CurrencyKind,
          priceAmount: Number(purchase.priceAmount),
          clientTransactionId: purchase.clientTransactionId,
          createdAt: purchase.createdAt.toISOString(),
          inventoryItem: {
            id: updatedInv.id,
            itemId: updatedInv.itemId,
            quantity: updatedInv.quantity,
            item: updatedInv.item as any,
          },
          newBalance: Number(newBalance),
        };
      });
    } catch (err: any) {
      if (err?.code === 'P2002' || err?.message?.includes('23505')) {
        const saved = await this.prisma.shopPurchase.findUnique({
          where: { userId_clientTransactionId: { userId, clientTransactionId } },
          include: { item: true },
        });
        if (saved) {
          const inv = await this.prisma.userInventory.findUnique({
            where: { userId_itemId: { userId, itemId: saved.itemId } },
            include: { item: true },
          });
          const account = await this.prisma.currencyAccount.findUnique({
            where: {
              userId_currencyKind_scopeType_scopeId: {
                userId,
                currencyKind: saved.currencyKind,
                scopeType: saved.currencyScopeType,
                scopeId: saved.currencyScopeId,
              },
            },
          });
          return {
            id: saved.id,
            offerId: saved.offerId,
            itemId: saved.itemId,
            itemQuantity: saved.itemQuantity,
            currencyKind: saved.currencyKind as CurrencyKind,
            priceAmount: Number(saved.priceAmount),
            clientTransactionId: saved.clientTransactionId,
            createdAt: saved.createdAt.toISOString(),
            inventoryItem: {
              id: inv?.id ?? '',
              itemId: saved.itemId,
              quantity: inv?.quantity ?? 1,
              item: saved.item as any,
            },
            newBalance: Number(account?.balance ?? 0),
          };
        }
      }
      throw err;
    }
  }
}
