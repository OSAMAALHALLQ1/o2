-- CreateEnum
CREATE TYPE "CurrencyKind" AS ENUM ('COIN', 'GEM', 'EVENT_TOKEN');

-- CreateEnum
CREATE TYPE "CurrencyScopeType" AS ENUM ('EVENT', 'SEASON');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "CurrencyLedgerSource" AS ENUM ('WELCOME_BONUS', 'SHOP_PURCHASE', 'MATCH_REWARD', 'DAILY_MISSION', 'ACHIEVEMENT', 'COMPANION_FEED', 'REAL_ORDER_VERIFIED', 'QR_RECEIPT_REDEMPTION', 'ADMIN_ADJUSTMENT', 'EVENT_REWARD');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('CONSUMABLE', 'COSMETIC');

-- CreateEnum
CREATE TYPE "ItemRarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC');

-- CreateEnum
CREATE TYPE "CosmeticSlot" AS ENUM ('HEAD', 'FACE', 'BODY', 'BACK', 'AURA', 'NAME_FRAME');

-- CreateEnum
CREATE TYPE "InventoryLedgerDirection" AS ENUM ('GRANT', 'CONSUME', 'REVOKE');

-- CreateTable
CREATE TABLE "currency_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currencyKind" "CurrencyKind" NOT NULL,
    "scopeType" "CurrencyScopeType",
    "scopeId" TEXT,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "currency_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_currency_account_balance_non_negative" CHECK ("balance" >= 0),
    CONSTRAINT "chk_currency_account_scope_consistency" CHECK (
        ("currencyKind" IN ('COIN', 'GEM') AND "scopeType" IS NULL AND "scopeId" IS NULL) OR
        ("currencyKind" = 'EVENT_TOKEN' AND "scopeType" IS NOT NULL AND "scopeId" IS NOT NULL)
    )
);

-- CreateTable
CREATE TABLE "currency_ledger_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
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

    CONSTRAINT "currency_ledger_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_currency_ledger_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "chk_currency_ledger_balance_after_non_negative" CHECK ("balanceAfter" >= 0),
    CONSTRAINT "chk_currency_ledger_scope_consistency" CHECK (
        ("currencyKind" IN ('COIN', 'GEM') AND "scopeType" IS NULL AND "scopeId" IS NULL) OR
        ("currencyKind" = 'EVENT_TOKEN' AND "scopeType" IS NOT NULL AND "scopeId" IS NOT NULL)
    )
);

-- CreateTable
CREATE TABLE "item_definitions" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_inventories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_inventories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_user_inventory_quantity_non_negative" CHECK ("quantity" >= 0)
);

-- CreateTable
CREATE TABLE "inventory_ledger_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "direction" "InventoryLedgerDirection" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_ledger_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_inv_ledger_qty_positive" CHECK ("quantity" > 0),
    CONSTRAINT "chk_inv_ledger_qty_after_non_negative" CHECK ("quantityAfter" >= 0)
);

-- CreateTable
CREATE TABLE "shop_offers" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_offers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_shop_offer_price_positive" CHECK ("priceAmount" > 0),
    CONSTRAINT "chk_shop_offer_quantity_positive" CHECK ("itemQuantity" > 0)
);

-- CreateTable
CREATE TABLE "shop_purchases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemQuantity" INTEGER NOT NULL,
    "currencyKind" "CurrencyKind" NOT NULL,
    "currencyScopeType" "CurrencyScopeType",
    "currencyScopeId" TEXT,
    "priceAmount" BIGINT NOT NULL,
    "clientTransactionId" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipped_cosmetics" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slot" "CosmeticSlot" NOT NULL,
    "itemId" TEXT NOT NULL,
    "equippedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipped_cosmetics_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "currency_accounts_userId_idx" ON "currency_accounts"("userId");
CREATE UNIQUE INDEX "currency_accounts_userId_currencyKind_scopeType_scopeId_key" ON "currency_accounts"("userId", "currencyKind", "scopeType", "scopeId");

CREATE INDEX "currency_ledger_entries_userId_idx" ON "currency_ledger_entries"("userId");
CREATE INDEX "currency_ledger_entries_currencyKind_scopeType_scopeId_idx" ON "currency_ledger_entries"("currencyKind", "scopeType", "scopeId");
CREATE UNIQUE INDEX "currency_ledger_entries_userId_idempotencyKey_key" ON "currency_ledger_entries"("userId", "idempotencyKey");

CREATE UNIQUE INDEX "item_definitions_slug_key" ON "item_definitions"("slug");

CREATE INDEX "user_inventories_userId_idx" ON "user_inventories"("userId");
CREATE UNIQUE INDEX "user_inventories_userId_itemId_key" ON "user_inventories"("userId", "itemId");

CREATE INDEX "inventory_ledger_entries_userId_idx" ON "inventory_ledger_entries"("userId");
CREATE UNIQUE INDEX "inventory_ledger_entries_userId_idempotencyKey_key" ON "inventory_ledger_entries"("userId", "idempotencyKey");

CREATE UNIQUE INDEX "shop_offers_slug_key" ON "shop_offers"("slug");

CREATE INDEX "shop_purchases_userId_idx" ON "shop_purchases"("userId");
CREATE UNIQUE INDEX "shop_purchases_userId_clientTransactionId_key" ON "shop_purchases"("userId", "clientTransactionId");

CREATE INDEX "equipped_cosmetics_userId_idx" ON "equipped_cosmetics"("userId");
CREATE UNIQUE INDEX "equipped_cosmetics_userId_slot_key" ON "equipped_cosmetics"("userId", "slot");

-- ForeignKeys
ALTER TABLE "currency_accounts" ADD CONSTRAINT "currency_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "currency_ledger_entries" ADD CONSTRAINT "currency_ledger_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_inventories" ADD CONSTRAINT "user_inventories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_inventories" ADD CONSTRAINT "user_inventories_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "inventory_ledger_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shop_offers" ADD CONSTRAINT "shop_offers_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shop_purchases" ADD CONSTRAINT "shop_purchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shop_purchases" ADD CONSTRAINT "shop_purchases_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "shop_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shop_purchases" ADD CONSTRAINT "shop_purchases_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "equipped_cosmetics" ADD CONSTRAINT "equipped_cosmetics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "equipped_cosmetics" ADD CONSTRAINT "equipped_cosmetics_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-Only Immutability Trigger for Currency Ledger
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
