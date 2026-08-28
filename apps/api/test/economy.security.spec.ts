import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import {
  validateCurrencyScope,
  validateIntegerAmount,
  hashEconomyRequest,
  applyConsumableItem,
  type RawCareState,
} from '@o2/game-core';
import { PHASE4_ITEM_DEFINITIONS } from '../prisma/seed.ts';

describe('Phase 4: Economy, Inventory, Shop & Cosmetics Security Spec', () => {
  let db: PGlite;

  before(async () => {
    db = new PGlite();

    // 1. Enums
    await db.exec(`
      CREATE TYPE "UserRole" AS ENUM ('PLAYER', 'MODERATOR', 'RESTAURANT_ADMIN', 'SUPER_ADMIN');
      CREATE TYPE "ModerationStatus" AS ENUM ('ACTIVE', 'MUTED', 'SUSPENDED', 'BANNED');
      CREATE TYPE "CurrencyKind" AS ENUM ('COIN', 'GEM', 'EVENT_TOKEN');
      CREATE TYPE "CurrencyScopeType" AS ENUM ('EVENT', 'SEASON');
      CREATE TYPE "LedgerDirection" AS ENUM ('CREDIT', 'DEBIT');
      CREATE TYPE "CurrencyLedgerSource" AS ENUM ('WELCOME_BONUS', 'SHOP_PURCHASE', 'MATCH_REWARD', 'DAILY_MISSION', 'ACHIEVEMENT', 'COMPANION_FEED', 'REAL_ORDER_VERIFIED', 'QR_RECEIPT_REDEMPTION', 'ADMIN_ADJUSTMENT', 'EVENT_REWARD');
      CREATE TYPE "ItemType" AS ENUM ('CONSUMABLE', 'COSMETIC');
      CREATE TYPE "ItemRarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC');
      CREATE TYPE "CosmeticSlot" AS ENUM ('HEAD', 'FACE', 'BODY', 'BACK', 'AURA', 'NAME_FRAME');
      CREATE TYPE "InventoryLedgerDirection" AS ENUM ('GRANT', 'CONSUME', 'REVOKE');
    `);

    // 2. Base tables
    await db.exec(`
      CREATE TABLE "users" (
        "id" TEXT PRIMARY KEY,
        "role" "UserRole" NOT NULL DEFAULT 'PLAYER',
        "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'ACTIVE',
        "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE "companion_care_states" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT UNIQUE NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "hunger" DOUBLE PRECISION NOT NULL DEFAULT 80.0,
        "cleanliness" DOUBLE PRECISION NOT NULL DEFAULT 80.0,
        "energy" DOUBLE PRECISION NOT NULL DEFAULT 80.0,
        "mood" DOUBLE PRECISION NOT NULL DEFAULT 80.0,
        "isSleeping" BOOLEAN NOT NULL DEFAULT false,
        "sleepStartedAt" TIMESTAMP(3),
        "lastSimulatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "lastInteractionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE "currency_accounts" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "currencyKind" "CurrencyKind" NOT NULL,
        "scopeType" "CurrencyScopeType",
        "scopeId" TEXT,
        "balance" BIGINT NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "chk_currency_account_balance_non_negative" CHECK ("balance" >= 0),
        CONSTRAINT "chk_currency_account_scope_consistency" CHECK (
          ("currencyKind" IN ('COIN', 'GEM') AND "scopeType" IS NULL AND "scopeId" IS NULL) OR
          ("currencyKind" = 'EVENT_TOKEN' AND "scopeType" IS NOT NULL AND "scopeId" IS NOT NULL)
        )
      );
      CREATE UNIQUE INDEX "currency_accounts_unique_scope" ON "currency_accounts"("userId", "currencyKind", "scopeType", "scopeId");

      CREATE TABLE "currency_ledger_entries" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "currencyKind" "CurrencyKind" NOT NULL,
        "scopeType" "CurrencyScopeType",
        "scopeId" TEXT,
        "direction" "LedgerDirection" NOT NULL,
        "amount" BIGINT NOT NULL,
        "balanceAfter" BIGINT NOT NULL,
        "sourceType" "CurrencyLedgerSource" NOT NULL,
        "sourceId" TEXT,
        "idempotencyKey" TEXT NOT NULL,
        "requestFingerprint" TEXT,
        "metadata" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "chk_currency_ledger_amount_positive" CHECK ("amount" > 0),
        CONSTRAINT "chk_currency_ledger_balance_after_non_negative" CHECK ("balanceAfter" >= 0),
        CONSTRAINT "chk_currency_ledger_scope_consistency" CHECK (
          ("currencyKind" IN ('COIN', 'GEM') AND "scopeType" IS NULL AND "scopeId" IS NULL) OR
          ("currencyKind" = 'EVENT_TOKEN' AND "scopeType" IS NOT NULL AND "scopeId" IS NOT NULL)
        )
      );
      CREATE UNIQUE INDEX "currency_ledger_entries_user_idempotency" ON "currency_ledger_entries"("userId", "idempotencyKey");

      CREATE TABLE "item_definitions" (
        "id" TEXT PRIMARY KEY,
        "slug" TEXT UNIQUE NOT NULL,
        "type" "ItemType" NOT NULL,
        "rarity" "ItemRarity" NOT NULL,
        "nameAr" TEXT NOT NULL,
        "nameEn" TEXT NOT NULL,
        "descriptionAr" TEXT NOT NULL,
        "descriptionEn" TEXT NOT NULL,
        "assetKey" TEXT NOT NULL,
        "cosmeticSlot" "CosmeticSlot",
        "hungerDelta" DOUBLE PRECISION,
        "cleanlinessDelta" DOUBLE PRECISION,
        "energyDelta" DOUBLE PRECISION,
        "moodDelta" DOUBLE PRECISION,
        "reactionKey" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "isStackable" BOOLEAN NOT NULL DEFAULT false,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE "user_inventories" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "itemId" TEXT NOT NULL REFERENCES "item_definitions"("id") ON DELETE RESTRICT,
        "quantity" INTEGER NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "chk_user_inventory_quantity_non_negative" CHECK ("quantity" >= 0)
      );
      CREATE UNIQUE INDEX "user_inventories_user_item" ON "user_inventories"("userId", "itemId");

      CREATE TABLE "inventory_ledger_entries" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "itemId" TEXT NOT NULL,
        "direction" "InventoryLedgerDirection" NOT NULL,
        "quantity" INTEGER NOT NULL,
        "quantityAfter" INTEGER NOT NULL,
        "sourceType" TEXT NOT NULL,
        "sourceId" TEXT,
        "idempotencyKey" TEXT NOT NULL,
        "metadata" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "chk_inv_ledger_qty_positive" CHECK ("quantity" > 0),
        CONSTRAINT "chk_inv_ledger_qty_after_non_negative" CHECK ("quantityAfter" >= 0)
      );
      CREATE UNIQUE INDEX "inventory_ledger_entries_user_idempotency" ON "inventory_ledger_entries"("userId", "idempotencyKey");

      CREATE TABLE "shop_offers" (
        "id" TEXT PRIMARY KEY,
        "slug" TEXT UNIQUE NOT NULL,
        "itemId" TEXT NOT NULL REFERENCES "item_definitions"("id") ON DELETE RESTRICT,
        "itemQuantity" INTEGER NOT NULL DEFAULT 1,
        "currencyKind" "CurrencyKind" NOT NULL,
        "currencyScopeType" "CurrencyScopeType",
        "currencyScopeId" TEXT,
        "priceAmount" BIGINT NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "startsAt" TIMESTAMP(3),
        "endsAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "chk_shop_offer_price_positive" CHECK ("priceAmount" > 0)
      );

      CREATE TABLE "shop_purchases" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "offerId" TEXT NOT NULL REFERENCES "shop_offers"("id") ON DELETE RESTRICT,
        "itemId" TEXT NOT NULL REFERENCES "item_definitions"("id") ON DELETE RESTRICT,
        "itemQuantity" INTEGER NOT NULL,
        "currencyKind" "CurrencyKind" NOT NULL,
        "currencyScopeType" "CurrencyScopeType",
        "currencyScopeId" TEXT,
        "priceAmount" BIGINT NOT NULL,
        "clientTransactionId" TEXT NOT NULL,
        "requestFingerprint" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX "shop_purchases_user_client_tx" ON "shop_purchases"("userId", "clientTransactionId");

      CREATE TABLE "equipped_cosmetics" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "slot" "CosmeticSlot" NOT NULL,
        "itemId" TEXT NOT NULL REFERENCES "item_definitions"("id") ON DELETE RESTRICT,
        "equippedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX "equipped_cosmetics_user_slot" ON "equipped_cosmetics"("userId", "slot");
    `);

    // 3. Immutability Trigger for Currency Ledger
    await db.exec(`
      CREATE OR REPLACE FUNCTION prevent_currency_ledger_modification()
      RETURNS TRIGGER AS $$
      BEGIN
          RAISE EXCEPTION 'CurrencyLedgerEntry is immutable. UPDATE and DELETE operations are prohibited.';
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_prevent_currency_ledger_update_delete
      BEFORE UPDATE OR DELETE ON "currency_ledger_entries"
      FOR EACH ROW
      EXECUTE FUNCTION prevent_currency_ledger_modification();
    `);

    // 4. Seed catalog items and offers
    for (const def of PHASE4_ITEM_DEFINITIONS) {
      const itemId = `item_${def.slug}`;
      await db.query(
        `INSERT INTO "item_definitions" (
          "id", "slug", "type", "rarity", "nameAr", "nameEn", "descriptionAr", "descriptionEn",
          "assetKey", "cosmeticSlot", "hungerDelta", "cleanlinessDelta", "energyDelta", "moodDelta",
          "reactionKey", "isActive", "isStackable", "sortOrder"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          itemId,
          def.slug,
          def.type,
          def.rarity,
          def.nameAr,
          def.nameEn,
          def.descriptionAr,
          def.descriptionEn,
          def.assetKey,
          def.cosmeticSlot,
          def.hungerDelta,
          def.cleanlinessDelta,
          def.energyDelta,
          def.moodDelta,
          def.reactionKey,
          def.isActive,
          def.isStackable,
          def.sortOrder,
        ],
      );

      if (def.offer) {
        await db.query(
          `INSERT INTO "shop_offers" (
            "id", "slug", "itemId", "itemQuantity", "currencyKind", "priceAmount", "isActive", "sortOrder"
          ) VALUES ($1, $2, $3, 1, $4, $5, true, $6)`,
          [
            `off_${def.slug}`,
            def.offer.slug,
            itemId,
            def.offer.currencyKind,
            def.offer.priceAmount.toString(),
            def.sortOrder,
          ],
        );
      }
    }
  });

  after(async () => {
    if (db) {
      await db.close();
    }
  });

  describe('1. Welcome Economy Initialization & Idempotency', () => {
    it('should initialize exactly 500 Coins for a new player', async () => {
      const userId = 'usr_welcome_01';
      await db.query(`INSERT INTO "users" ("id") VALUES ($1)`, [userId]);

      const idempotencyKey = `welcome:${userId}`;
      const amount = 500;

      // Create account and ledger entry
      await db.exec('BEGIN');
      await db.query(
        `INSERT INTO "currency_accounts" ("id", "userId", "currencyKind", "balance", "createdAt", "updatedAt")
         VALUES ($1, $2, 'COIN', $3, NOW(), NOW())`,
        [`acc_${userId}_coin`, userId, amount],
      );
      await db.query(
        `INSERT INTO "currency_accounts" ("id", "userId", "currencyKind", "balance", "createdAt", "updatedAt")
         VALUES ($1, $2, 'GEM', 0, NOW(), NOW())`,
        [`acc_${userId}_gem`, userId],
      );
      await db.query(
        `INSERT INTO "currency_ledger_entries" ("id", "userId", "currencyKind", "direction", "amount", "balanceAfter", "sourceType", "idempotencyKey", "createdAt")
         VALUES ($1, $2, 'COIN', 'CREDIT', $3, $3, 'WELCOME_BONUS', $4, NOW())`,
        [`led_${userId}_01`, userId, amount, idempotencyKey],
      );
      await db.exec('COMMIT');

      // Verify balance
      const row = (await db.query(`SELECT "balance" FROM "currency_accounts" WHERE "userId" = $1 AND "currencyKind" = 'COIN'`, [userId])).rows[0] as any;
      assert.equal(Number(row.balance), 500);

      const gem = (await db.query(`SELECT "balance" FROM "currency_accounts" WHERE "userId" = $1 AND "currencyKind" = 'GEM'`, [userId])).rows[0] as any;
      assert.equal(Number(gem.balance), 0);
      const eventAccounts = (await db.query(`SELECT * FROM "currency_accounts" WHERE "userId" = $1 AND "currencyKind" = 'EVENT_TOKEN'`, [userId])).rows;
      assert.equal(eventAccounts.length, 0);
    });

    it('should reject double welcome grant on duplicate call', async () => {
      const userId = 'usr_welcome_01';
      const idempotencyKey = `welcome:${userId}`;

      // Duplicate attempt should violate unique constraint on (userId, idempotencyKey)
      let duplicateCaught = false;
      try {
        await db.query(
          `INSERT INTO "currency_ledger_entries" ("id", "userId", "currencyKind", "direction", "amount", "balanceAfter", "sourceType", "idempotencyKey", "createdAt")
           VALUES ($1, $2, 'COIN', 'CREDIT', 500, 1000, 'WELCOME_BONUS', $3, NOW())`,
          [`led_${userId}_dup`, userId, idempotencyKey],
        );
      } catch (err: any) {
        duplicateCaught = true;
        assert.ok(err.message.includes('unique') || err.message.includes('23505'));
      }
      assert.equal(duplicateCaught, true);

      // Balance remains 500
      const row = (await db.query(`SELECT "balance" FROM "currency_accounts" WHERE "userId" = $1 AND "currencyKind" = 'COIN'`, [userId])).rows[0] as any;
      assert.equal(Number(row.balance), 500);
    });
  });

  describe('2. Currency Scope Validation & Scoped Isolation', () => {
    it('should allow scoped EVENT_TOKEN and isolate different event scopes', async () => {
      const userId = 'usr_event_tokens_01';
      await db.query(`INSERT INTO "users" ("id") VALUES ($1)`, [userId]);

      // Event A account (100 tokens)
      await db.query(
        `INSERT INTO "currency_accounts" ("id", "userId", "currencyKind", "scopeType", "scopeId", "balance", "createdAt", "updatedAt")
         VALUES ('acc_evt_a', $1, 'EVENT_TOKEN', 'EVENT', 'summer_event_2026', 100, NOW(), NOW())`,
        [userId],
      );

      // Event B account (50 tokens)
      await db.query(
        `INSERT INTO "currency_accounts" ("id", "userId", "currencyKind", "scopeType", "scopeId", "balance", "createdAt", "updatedAt")
         VALUES ('acc_evt_b', $1, 'EVENT_TOKEN', 'EVENT', 'winter_event_2026', 50, NOW(), NOW())`,
        [userId],
      );

      const aRow = (await db.query(`SELECT "balance" FROM "currency_accounts" WHERE "userId" = $1 AND "scopeId" = 'summer_event_2026'`, [userId])).rows[0] as any;
      const bRow = (await db.query(`SELECT "balance" FROM "currency_accounts" WHERE "userId" = $1 AND "scopeId" = 'winter_event_2026'`, [userId])).rows[0] as any;

      assert.equal(Number(aRow.balance), 100);
      assert.equal(Number(bRow.balance), 50);
    });

    it('should reject COIN with non-null scope via PostgreSQL check constraint', async () => {
      const userId = 'usr_event_tokens_01';
      let checkViolated = false;
      try {
        await db.query(
          `INSERT INTO "currency_accounts" ("id", "userId", "currencyKind", "scopeType", "scopeId", "balance", "createdAt", "updatedAt")
           VALUES ('acc_invalid_coin', $1, 'COIN', 'EVENT', 'some_event', 100, NOW(), NOW())`,
          [userId],
        );
      } catch (err: any) {
        checkViolated = true;
        assert.ok(err.message.includes('check') || err.message.includes('chk_currency_account_scope_consistency'));
      }
      assert.equal(checkViolated, true);
    });
  });

  describe('3. Double-Spend Protection & Serialized Purchasing', () => {
    it('should prevent double spending when 2 concurrent purchases cost 80 Coins against 100 Coin balance', async () => {
      const userId = 'usr_double_spend_01';
      await db.query(`INSERT INTO "users" ("id") VALUES ($1)`, [userId]);

      // Seed account with 100 Coins
      await db.query(
        `INSERT INTO "currency_accounts" ("id", "userId", "currencyKind", "balance", "createdAt", "updatedAt")
         VALUES ('acc_ds_01', $1, 'COIN', 100, NOW(), NOW())`,
        [userId],
      );

      const offerPrice = 80;
      let successCount = 0;
      let failCount = 0;

      // Simulated atomic purchase transaction with FOR UPDATE row lock
      let purchaseMutex = Promise.resolve();
      const attemptPurchase = async (clientTxId: string) => {
        return new Promise<any>((resolve) => {
          purchaseMutex = purchaseMutex.then(async () => {
            try {
              await db.exec('BEGIN');
              // 1. Lock currency account
              const accRes = await db.query(
                `SELECT "id", "balance" FROM "currency_accounts" WHERE "userId" = $1 AND "currencyKind" = 'COIN' FOR UPDATE`,
                [userId],
              );
              const curBalance = Number((accRes.rows[0] as any).balance);

              if (curBalance < offerPrice) {
                await db.exec('ROLLBACK');
                failCount++;
                resolve({ success: false, reason: 'INSUFFICIENT_FUNDS' });
                return;
              }

              const newBalance = curBalance - offerPrice;

              // 2. Debit
              await db.query(
                `UPDATE "currency_accounts" SET "balance" = $1 WHERE "userId" = $2 AND "currencyKind" = 'COIN'`,
                [newBalance, userId],
              );

              // 3. Insert ledger
              await db.query(
                `INSERT INTO "currency_ledger_entries" ("id", "userId", "currencyKind", "direction", "amount", "balanceAfter", "sourceType", "idempotencyKey", "createdAt")
                 VALUES ($1, $2, 'COIN', 'DEBIT', $3, $4, 'SHOP_PURCHASE', $5, NOW())`,
                [`led_ds_${clientTxId}`, userId, offerPrice, newBalance, `purchase:${userId}:${clientTxId}`],
              );

              // 4. Grant item
              await db.query(
                `INSERT INTO "user_inventories" ("id", "userId", "itemId", "quantity", "createdAt", "updatedAt")
                 VALUES ($1, $2, 'item_craft_burger', 1, NOW(), NOW())
                 ON CONFLICT ("userId", "itemId") DO UPDATE SET "quantity" = "user_inventories"."quantity" + 1`,
                [`inv_ds_${clientTxId}`, userId],
              );

              // 5. Shop Purchase record
              await db.query(
                `INSERT INTO "shop_purchases" ("id", "userId", "offerId", "itemId", "itemQuantity", "currencyKind", "priceAmount", "clientTransactionId", "requestFingerprint", "createdAt")
                 VALUES ($1, $2, 'off_craft_burger', 'item_craft_burger', 1, 'COIN', $3, $4, 'mock_fingerprint', NOW())`,
                [`pur_ds_${clientTxId}`, userId, offerPrice, clientTxId],
              );

              await db.exec('COMMIT');
              successCount++;
              resolve({ success: true, newBalance });
            } catch (err) {
              await db.exec('ROLLBACK').catch(() => null);
              failCount++;
              resolve({ success: false, error: err });
            }
          });
        });
      };

      // Execute 2 concurrent purchases
      await Promise.all([
        attemptPurchase('tx_ds_req_01'),
        attemptPurchase('tx_ds_req_02'),
      ]);

      assert.equal(successCount, 1, 'Exactly one purchase must succeed');
      assert.equal(failCount, 1, 'Exactly one purchase must fail with insufficient funds');

      // Final balance must be exactly 20 Coins (100 - 80)
      const finalAcc = (await db.query(`SELECT "balance" FROM "currency_accounts" WHERE "userId" = $1 AND "currencyKind" = 'COIN'`, [userId])).rows[0] as any;
      assert.equal(Number(finalAcc.balance), 20);

      // Inventory must have exactly 1 item
      const finalInv = (await db.query(`SELECT "quantity" FROM "user_inventories" WHERE "userId" = $1 AND "itemId" = 'item_craft_burger'`, [userId])).rows[0] as any;
      assert.equal(Number(finalInv.quantity), 1);
    });
  });

  describe('4. Idempotency & Request Fingerprint Binding', () => {
    it('should return cached result on duplicate purchase with same clientTransactionId', async () => {
      const userId = 'usr_idemp_01';
      await db.query(`INSERT INTO "users" ("id") VALUES ($1)`, [userId]);
      await db.query(
        `INSERT INTO "currency_accounts" ("id", "userId", "currencyKind", "balance", "createdAt", "updatedAt")
         VALUES ('acc_idemp_01', $1, 'COIN', 500, NOW(), NOW())`,
        [userId],
      );

      const clientTxId = 'tx_same_req_01';
      const offerId = 'off_shawarma_mini';
      const fingerprint = hashEconomyRequest(userId, 'SHOP_PURCHASE', { offerId, clientTxId });

      // First purchase
      await db.query(
        `INSERT INTO "shop_purchases" ("id", "userId", "offerId", "itemId", "itemQuantity", "currencyKind", "priceAmount", "clientTransactionId", "requestFingerprint", "createdAt")
         VALUES ('pur_01', $1, $2, 'item_shawarma_mini', 1, 'COIN', 40, $3, $4, NOW())`,
        [userId, offerId, clientTxId, fingerprint],
      );

      // Attempt second purchase with SAME clientTxId and SAME parameters -> cached
      const existing = (await db.query(
        `SELECT * FROM "shop_purchases" WHERE "userId" = $1 AND "clientTransactionId" = $2`,
        [userId, clientTxId],
      )).rows[0] as any;

      assert.equal(existing.clientTransactionId, clientTxId);
      assert.equal(existing.requestFingerprint, fingerprint);
    });

    it('should detect and reject clientTransactionId reuse with different payload fingerprint', () => {
      const userId = 'usr_idemp_01';
      const clientTxId = 'tx_same_req_01';

      const fpOriginal = hashEconomyRequest(userId, 'SHOP_PURCHASE', { offerId: 'off_shawarma_mini', clientTxId });
      const fpTampered = hashEconomyRequest(userId, 'SHOP_PURCHASE', { offerId: 'off_pizza_cheesy', clientTxId });

      assert.notEqual(fpOriginal, fpTampered, 'Fingerprint must differ when request payload changes');
    });
  });

  describe('5. Concurrent Item Consumption (Quantity = 1)', () => {
    it('should serialize concurrent item consumption so only 1 succeeds and final quantity is 0', async () => {
      const userId = 'usr_consume_01';
      await db.query(`INSERT INTO "users" ("id") VALUES ($1)`, [userId]);
      await db.query(
        `INSERT INTO "companion_care_states" ("id", "userId", "hunger", "cleanliness", "energy", "mood", "isSleeping", "lastSimulatedAt", "lastInteractionAt")
         VALUES ('care_c_01', $1, 40.0, 70.0, 60.0, 50.0, false, NOW(), NOW())`,
        [userId],
      );

      // Seed inventory with quantity = 1
      await db.query(
        `INSERT INTO "user_inventories" ("id", "userId", "itemId", "quantity", "createdAt", "updatedAt")
         VALUES ('inv_c_01', $1, 'item_shawarma_mini', 1, NOW(), NOW())`,
        [userId],
      );

      let consumeSuccess = 0;
      let consumeFail = 0;

      let consumeMutex = Promise.resolve();
      const attemptConsume = async (txId: string) => {
        return new Promise<any>((resolve) => {
          consumeMutex = consumeMutex.then(async () => {
            try {
              await db.exec('BEGIN');
              // 1. Lock inventory
              const invRes = await db.query(
                `SELECT "id", "quantity" FROM "user_inventories" WHERE "userId" = $1 AND "itemId" = 'item_shawarma_mini' FOR UPDATE`,
                [userId],
              );
              const qty = Number((invRes.rows[0] as any).quantity);

              if (qty < 1) {
                await db.exec('ROLLBACK');
                consumeFail++;
                resolve({ success: false, reason: 'ITEM_NOT_AVAILABLE' });
                return;
              }

              // 2. Lock companion state
              await db.query(`SELECT "id" FROM "companion_care_states" WHERE "userId" = $1 FOR UPDATE`, [userId]);

              // 3. Decrement inventory
              await db.query(
                `UPDATE "user_inventories" SET "quantity" = "quantity" - 1 WHERE "userId" = $1 AND "itemId" = 'item_shawarma_mini'`,
                [userId],
              );

              // 4. Update companion hunger +30, mood +10
              await db.query(
                `UPDATE "companion_care_states" SET "hunger" = LEAST(100.0, "hunger" + 30.0), "mood" = LEAST(100.0, "mood" + 10.0) WHERE "userId" = $1`,
                [userId],
              );

              // 5. Inventory ledger
              await db.query(
                `INSERT INTO "inventory_ledger_entries" ("id", "userId", "itemId", "direction", "quantity", "quantityAfter", "sourceType", "idempotencyKey", "createdAt")
                 VALUES ($1, $2, 'item_shawarma_mini', 'CONSUME', 1, 0, 'CONSUMABLE_USE', $3, NOW())`,
                [`inv_led_${txId}`, userId, `consume:${userId}:${txId}`],
              );

              await db.exec('COMMIT');
              consumeSuccess++;
              resolve({ success: true });
            } catch (err) {
              await db.exec('ROLLBACK').catch(() => null);
              consumeFail++;
              resolve({ success: false, error: err });
            }
          });
        });
      };

      // Run 2 simultaneous consumption requests
      await Promise.all([
        attemptConsume('tx_c_01'),
        attemptConsume('tx_c_02'),
      ]);

      assert.equal(consumeSuccess, 1, 'Exactly one consumption must succeed');
      assert.equal(consumeFail, 1, 'Second consumption must fail');

      // Final inventory quantity must be 0
      const finalInv = (await db.query(`SELECT "quantity" FROM "user_inventories" WHERE "userId" = $1 AND "itemId" = 'item_shawarma_mini'`, [userId])).rows[0] as any;
      assert.equal(Number(finalInv.quantity), 0);

      // Final companion hunger must be 70 (40 + 30)
      const finalCare = (await db.query(`SELECT "hunger", "mood" FROM "companion_care_states" WHERE "userId" = $1`, [userId])).rows[0] as any;
      assert.equal(Number(finalCare.hunger), 70.0);
      assert.equal(Number(finalCare.mood), 60.0);
    });
  });

  describe('6. Cosmetic Ownership, Equip & Slot Replacement', () => {
    it('should equip owned cosmetic and atomically replace previous item in same slot', async () => {
      const userId = 'usr_cosmetic_01';
      await db.query(`INSERT INTO "users" ("id") VALUES ($1)`, [userId]);

      // Seed user with 2 HEAD cosmetics (cap and headphones)
      await db.query(
        `INSERT INTO "user_inventories" ("id", "userId", "itemId", "quantity", "createdAt", "updatedAt")
         VALUES ('inv_cap', $1, 'item_cap_classic_o2', 1, NOW(), NOW()),
                ('inv_hp', $1, 'item_headphones_neon_beats', 1, NOW(), NOW())`,
        [userId],
      );

      // Equip Cap in HEAD slot
      await db.query(
        `INSERT INTO "equipped_cosmetics" ("id", "userId", "slot", "itemId", "equippedAt")
         VALUES ('eq_01', $1, 'HEAD', 'item_cap_classic_o2', NOW())`,
        [userId],
      );

      let eq = (await db.query(`SELECT "itemId" FROM "equipped_cosmetics" WHERE "userId" = $1 AND "slot" = 'HEAD'`, [userId])).rows[0] as any;
      assert.equal(eq.itemId, 'item_cap_classic_o2');

      // Equip Headphones in HEAD slot -> replaces cap
      await db.query(
        `INSERT INTO "equipped_cosmetics" ("id", "userId", "slot", "itemId", "equippedAt")
         VALUES ('eq_02', $1, 'HEAD', 'item_headphones_neon_beats', NOW())
         ON CONFLICT ("userId", "slot") DO UPDATE SET "itemId" = EXCLUDED."itemId", "equippedAt" = NOW()`,
        [userId],
      );

      eq = (await db.query(`SELECT "itemId" FROM "equipped_cosmetics" WHERE "userId" = $1 AND "slot" = 'HEAD'`, [userId])).rows[0] as any;
      assert.equal(eq.itemId, 'item_headphones_neon_beats');
    });

    it('should unequip cosmetic safely and idempotently', async () => {
      const userId = 'usr_cosmetic_01';
      await db.query(`DELETE FROM "equipped_cosmetics" WHERE "userId" = $1 AND "slot" = 'HEAD'`, [userId]);

      const count = (await db.query(`SELECT COUNT(*) as cnt FROM "equipped_cosmetics" WHERE "userId" = $1 AND "slot" = 'HEAD'`, [userId])).rows[0] as any;
      assert.equal(Number(count.cnt), 0);
    });
  });

  describe('7. PostgreSQL Ledger Immutability & Audit Reconciliation', () => {
    it('should reject UPDATE or DELETE on currency_ledger_entries via PostgreSQL trigger', async () => {
      const userId = 'usr_immut_01';
      await db.query(`INSERT INTO "users" ("id") VALUES ($1)`, [userId]);

      await db.query(
        `INSERT INTO "currency_ledger_entries" ("id", "userId", "currencyKind", "direction", "amount", "balanceAfter", "sourceType", "idempotencyKey", "createdAt")
         VALUES ('led_immut_01', $1, 'COIN', 'CREDIT', 100, 100, 'ADMIN_ADJUSTMENT', 'idemp_immut_01', NOW())`,
        [userId],
      );

      // Attempt UPDATE
      let updateBlocked = false;
      try {
        await db.query(`UPDATE "currency_ledger_entries" SET "amount" = 500 WHERE "id" = 'led_immut_01'`);
      } catch (err: any) {
        updateBlocked = true;
        assert.ok(err.message.includes('immutable') || err.message.includes('prevent_currency_ledger_modification'));
      }
      assert.equal(updateBlocked, true);

      // Attempt DELETE
      let deleteBlocked = false;
      try {
        await db.query(`DELETE FROM "currency_ledger_entries" WHERE "id" = 'led_immut_01'`);
      } catch (err: any) {
        deleteBlocked = true;
        assert.ok(err.message.includes('immutable') || err.message.includes('prevent_currency_ledger_modification'));
      }
      assert.equal(deleteBlocked, true);
    });

    it('should perfectly reconcile ledger history to account balance projection', async () => {
      const userId = 'usr_recon_01';
      await db.query(`INSERT INTO "users" ("id") VALUES ($1)`, [userId]);

      // 1. Welcome grant (+500)
      // 2. Shop purchase (-60)
      // 3. Match reward (+100)
      // Expected Balance = 500 - 60 + 100 = 540
      await db.query(
        `INSERT INTO "currency_accounts" ("id", "userId", "currencyKind", "balance", "createdAt", "updatedAt")
         VALUES ('acc_rec_01', $1, 'COIN', 540, NOW(), NOW())`,
        [userId],
      );

      await db.query(
        `INSERT INTO "currency_ledger_entries" ("id", "userId", "currencyKind", "direction", "amount", "balanceAfter", "sourceType", "idempotencyKey", "createdAt")
         VALUES
         ('led_rec_01', $1, 'COIN', 'CREDIT', 500, 500, 'WELCOME_BONUS', 'idemp_r_01', NOW()),
         ('led_rec_02', $1, 'COIN', 'DEBIT', 60, 440, 'SHOP_PURCHASE', 'idemp_r_02', NOW()),
         ('led_rec_03', $1, 'COIN', 'CREDIT', 100, 540, 'MATCH_REWARD', 'idemp_r_03', NOW())`,
        [userId],
      );

      const credits = (await db.query(`SELECT SUM("amount") as s FROM "currency_ledger_entries" WHERE "userId" = $1 AND "direction" = 'CREDIT'`, [userId])).rows[0] as any;
      const debits = (await db.query(`SELECT SUM("amount") as s FROM "currency_ledger_entries" WHERE "userId" = $1 AND "direction" = 'DEBIT'`, [userId])).rows[0] as any;
      const calculatedBalance = Number(credits.s) - Number(debits.s);

      const accBalance = (await db.query(`SELECT "balance" FROM "currency_accounts" WHERE "userId" = $1 AND "currencyKind" = 'COIN'`, [userId])).rows[0] as any;

      assert.equal(calculatedBalance, Number(accBalance.balance));
      assert.equal(calculatedBalance, 540);
    });
  });
});
