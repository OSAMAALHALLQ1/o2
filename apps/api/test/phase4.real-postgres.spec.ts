import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const databaseUrl = process.env.PHASE4_REAL_DATABASE_URL;

describe('Phase 4 real PostgreSQL 17 service concurrency', { skip: !databaseUrl }, () => {
  let prisma: any;
  let economy: any;
  let inventory: any;
  let shop: any;

  before(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    const { PrismaService } = require('../dist/prisma/prisma.service.js');
    const { EconomyService } = require('../dist/economy/economy.service.js');
    const { InventoryService } = require('../dist/economy/inventory.service.js');
    const { ShopService } = require('../dist/economy/shop.service.js');
    prisma = new PrismaService();
    await prisma.$connect();
    economy = new EconomyService(prisma);
    inventory = new InventoryService(prisma);
    shop = new ShopService(prisma);
  });

  after(async () => {
    await prisma.$disconnect();
  });

  async function createUser() {
    return prisma.user.create({ data: {} });
  }

  async function createOffer(priceAmount: bigint, stackable = true) {
    const item = await prisma.itemDefinition.create({
      data: {
        slug: `audit-item-${randomUUID()}`,
        type: stackable ? 'CONSUMABLE' : 'COSMETIC',
        rarity: 'COMMON',
        nameAr: 'عنصر تدقيق',
        nameEn: 'Audit item',
        descriptionAr: 'عنصر لاختبار التزامن',
        descriptionEn: 'Concurrency audit item',
        assetKey: 'audit_item',
        cosmeticSlot: stackable ? null : 'HEAD',
        hungerDelta: stackable ? 10 : null,
        isStackable: stackable,
      },
    });
    const offer = await prisma.shopOffer.create({
      data: {
        slug: `audit-offer-${randomUUID()}`,
        itemId: item.id,
        itemQuantity: 1,
        currencyKind: 'COIN',
        priceAmount,
      },
    });
    return { item, offer };
  }

  async function setCoinBalanceTo100(userId: string) {
    await economy.initializeWelcomeEconomy(userId, randomUUID());
    await economy.debitCurrency(userId, 'COIN', 400, 'ADMIN_ADJUSTMENT', `audit-baseline:${randomUUID()}`, {
      requestFingerprint: `audit-baseline:${userId}`,
    });
  }

  function economyCode(reason: unknown) {
    const response = (reason as any)?.getResponse?.();
    return typeof response === 'object' ? response.code : undefined;
  }

  it('initializes one Coin account, one Gem account, and one welcome credit under a true race', async () => {
    const user = await createUser();
    const results = await Promise.all([
      economy.initializeWelcomeEconomy(user.id, randomUUID()),
      economy.initializeWelcomeEconomy(user.id, randomUUID()),
    ]);

    assert.equal(results[0].coins, 500);
    assert.equal(results[1].coins, 500);
    const accounts = await prisma.currencyAccount.findMany({ where: { userId: user.id } });
    assert.equal(accounts.length, 2);
    assert.equal(accounts.filter((row) => row.currencyKind === 'COIN').length, 1);
    assert.equal(accounts.filter((row) => row.currencyKind === 'GEM').length, 1);
    assert.equal(accounts.find((row) => row.currencyKind === 'COIN')?.balance, 500n);
    assert.equal(accounts.find((row) => row.currencyKind === 'GEM')?.balance, 0n);
    assert.equal(await prisma.currencyLedgerEntry.count({
      where: { userId: user.id, sourceType: 'WELCOME_BONUS' },
    }), 1);
    assert.equal((await economy.reconcileUserLedger(user.id)).isReconciled, true);
  });

  it('prevents a real different-ID double spend and leaves exact final rows', async () => {
    const user = await createUser();
    const { item, offer } = await createOffer(80n);
    await setCoinBalanceTo100(user.id);

    const settled = await Promise.allSettled([
      shop.purchaseOffer(user.id, offer.id, randomUUID()),
      shop.purchaseOffer(user.id, offer.id, randomUUID()),
    ]);
    assert.equal(settled.filter((row) => row.status === 'fulfilled').length, 1);
    const failure = settled.find((row) => row.status === 'rejected') as PromiseRejectedResult;
    assert.equal(economyCode(failure.reason), 'INSUFFICIENT_FUNDS');
    assert.equal((await prisma.currencyAccount.findFirstOrThrow({
      where: { userId: user.id, currencyKind: 'COIN' },
    })).balance, 20n);
    assert.equal(await prisma.shopPurchase.count({ where: { userId: user.id } }), 1);
    assert.equal(await prisma.currencyLedgerEntry.count({
      where: { userId: user.id, sourceType: 'SHOP_PURCHASE' },
    }), 1);
    assert.equal(await prisma.inventoryLedgerEntry.count({
      where: { userId: user.id, itemId: item.id, sourceType: 'SHOP_PURCHASE' },
    }), 1);
    assert.equal((await prisma.userInventory.findUniqueOrThrow({
      where: { userId_itemId: { userId: user.id, itemId: item.id } },
    })).quantity, 1);
    assert.equal((await economy.reconcileUserLedger(user.id)).isReconciled, true);
    assert.equal((await inventory.reconcileUserInventory(user.id)).isReconciled, true);
  });

  it('returns deterministic equivalent results for a true same-ID purchase race', async () => {
    const user = await createUser();
    const { item, offer } = await createOffer(80n);
    await setCoinBalanceTo100(user.id);
    const transactionId = randomUUID();

    const [first, second] = await Promise.all([
      shop.purchaseOffer(user.id, offer.id, transactionId),
      shop.purchaseOffer(user.id, offer.id, transactionId),
    ]);
    assert.deepEqual(first, second);
    assert.equal(first.newBalance, 20);
    assert.equal(first.inventoryItem.quantity, 1);
    assert.equal(await prisma.shopPurchase.count({ where: { userId: user.id, clientTransactionId: transactionId } }), 1);
    assert.equal(await prisma.currencyLedgerEntry.count({ where: { userId: user.id, sourceType: 'SHOP_PURCHASE' } }), 1);
    assert.equal(await prisma.inventoryLedgerEntry.count({ where: { userId: user.id, itemId: item.id } }), 1);
  });

  it('rejects a same-ID race when the meaningful purchase request differs', async () => {
    const user = await createUser();
    const firstOffer = await createOffer(10n);
    const secondOffer = await createOffer(10n);
    await setCoinBalanceTo100(user.id);
    const transactionId = randomUUID();

    const settled = await Promise.allSettled([
      shop.purchaseOffer(user.id, firstOffer.offer.id, transactionId),
      shop.purchaseOffer(user.id, secondOffer.offer.id, transactionId),
    ]);
    assert.equal(settled.filter((row) => row.status === 'fulfilled').length, 1);
    const failure = settled.find((row) => row.status === 'rejected') as PromiseRejectedResult;
    assert.equal(economyCode(failure.reason), 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST');
    assert.equal(await prisma.shopPurchase.count({ where: { userId: user.id, clientTransactionId: transactionId } }), 1);
  });

  it('rejects currency idempotency reuse when source semantics differ', async () => {
    const user = await createUser();
    const idempotencyKey = randomUUID();
    await economy.creditCurrency(user.id, 'COIN', 10, 'ADMIN_ADJUSTMENT', idempotencyKey, {
      sourceId: 'manual-a',
    });

    await assert.rejects(
      economy.creditCurrency(user.id, 'COIN', 10, 'MATCH_REWARD', idempotencyKey, {
        sourceId: 'match-b',
      }),
      (error: unknown) => economyCode(error) === 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST',
    );
  });

  it('serializes consumable use, audits it, and reconciles inventory', async () => {
    const user = await createUser();
    const { item } = await createOffer(10n);
    await inventory.grantItem(user.id, item.id, 1, 'AUDIT_SETUP', randomUUID());

    const settled = await Promise.allSettled([
      inventory.consumeItem(user.id, item.id, randomUUID()),
      inventory.consumeItem(user.id, item.id, randomUUID()),
    ]);
    assert.equal(settled.filter((row) => row.status === 'fulfilled').length, 1);
    assert.equal((await prisma.userInventory.findUniqueOrThrow({
      where: { userId_itemId: { userId: user.id, itemId: item.id } },
    })).quantity, 0);
    assert.equal(await prisma.inventoryLedgerEntry.count({
      where: { userId: user.id, itemId: item.id, direction: 'CONSUME' },
    }), 1);
    assert.equal((await inventory.reconcileUserInventory(user.id)).isReconciled, true);
  });

  it('rejects multi-quantity grants for non-stackable items', async () => {
    const user = await createUser();
    const { item } = await createOffer(10n, false);

    await assert.rejects(
      inventory.grantItem(user.id, item.id, 2, 'AUDIT_SETUP', randomUUID()),
      (error: unknown) => economyCode(error) === 'ITEM_ALREADY_OWNED',
    );
    assert.equal(await prisma.userInventory.count({ where: { userId: user.id, itemId: item.id } }), 0);
    assert.equal(await prisma.inventoryLedgerEntry.count({ where: { userId: user.id, itemId: item.id } }), 0);
  });

  it('reports a projection-only zero inventory row as unreconciled', async () => {
    const user = await createUser();
    const { item } = await createOffer(10n);
    await prisma.userInventory.create({ data: { userId: user.id, itemId: item.id, quantity: 0 } });

    const result = await inventory.reconcileUserInventory(user.id);
    assert.equal(result.isReconciled, false);
    assert.equal(result.differences[0]?.itemId, item.id);
  });

  it('enforces append-only audit tables and blocks cascading audit deletion', async () => {
    const user = await createUser();
    const { offer } = await createOffer(10n);
    await setCoinBalanceTo100(user.id);
    const purchase = await shop.purchaseOffer(user.id, offer.id, randomUUID());
    const invLedger = await prisma.inventoryLedgerEntry.findFirstOrThrow({ where: { userId: user.id } });

    await assert.rejects(prisma.inventoryLedgerEntry.update({
      where: { id: invLedger.id }, data: { sourceType: 'TAMPERED' },
    }));
    await assert.rejects(prisma.shopPurchase.delete({ where: { id: purchase.id } }));
    await assert.rejects(prisma.$executeRawUnsafe('TRUNCATE TABLE "inventory_ledger_entries"'));
    await assert.rejects(prisma.user.delete({ where: { id: user.id } }));
  });

  it('serializes controller responses safely and rejects aggregate overflow', async () => {
    const user = await createUser();
    await economy.initializeWelcomeEconomy(user.id, randomUUID());
    await economy.creditCurrency(
      user.id,
      'COIN',
      BigInt(Number.MAX_SAFE_INTEGER) - 500n,
      'ADMIN_ADJUSTMENT',
      randomUUID(),
    );
    const { EconomyController } = require('../dist/economy/economy.controller.js');
    const controller = new EconomyController(economy);
    const response = await controller.getEconomyOverview({ user: { userId: user.id } });
    assert.equal(response.coins, Number.MAX_SAFE_INTEGER);
    assert.doesNotThrow(() => JSON.stringify(response));
    await assert.rejects(
      economy.creditCurrency(user.id, 'COIN', 1, 'ADMIN_ADJUSTMENT', randomUUID()),
      (error: unknown) => economyCode(error) === 'INVALID_AMOUNT',
    );
  });
});
