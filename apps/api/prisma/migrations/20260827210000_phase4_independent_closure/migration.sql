-- Phase 4 independent closure: close NULL uniqueness, audit immutability,
-- request binding, deterministic replay snapshots, and safe JSON number bounds.

BEGIN;

-- Build the stricter index first. If duplicate global accounts exist, the migration
-- fails without removing the protection supplied by the previous index.
CREATE UNIQUE INDEX "currency_accounts_scope_identity_phase4_key"
ON "currency_accounts"("userId", "currencyKind", "scopeType", "scopeId") NULLS NOT DISTINCT;
DROP INDEX "currency_accounts_userId_currencyKind_scopeType_scopeId_key";
ALTER INDEX "currency_accounts_scope_identity_phase4_key"
  RENAME TO "currency_accounts_userId_currencyKind_scopeType_scopeId_key";

ALTER TABLE "currency_accounts"
  ADD CONSTRAINT "chk_currency_account_balance_safe_integer"
  CHECK ("balance" <= 9007199254740991);

ALTER TABLE "currency_ledger_entries"
  ADD CONSTRAINT "chk_currency_ledger_amount_safe_integer"
  CHECK ("amount" <= 9007199254740991),
  ADD CONSTRAINT "chk_currency_ledger_balance_after_safe_integer"
  CHECK ("balanceAfter" <= 9007199254740991);

ALTER TABLE "shop_offers"
  ADD CONSTRAINT "chk_shop_offer_price_safe_integer"
  CHECK ("priceAmount" <= 9007199254740991),
  ADD CONSTRAINT "chk_shop_offer_scope_consistency"
  CHECK (
    ("currencyKind" IN ('COIN', 'GEM') AND "currencyScopeType" IS NULL AND "currencyScopeId" IS NULL) OR
    ("currencyKind" = 'EVENT_TOKEN' AND "currencyScopeType" IS NOT NULL AND "currencyScopeId" IS NOT NULL)
  );

ALTER TABLE "inventory_ledger_entries"
  ADD COLUMN "requestFingerprint" TEXT NOT NULL DEFAULT 'legacy-unbound';
UPDATE "inventory_ledger_entries"
SET "requestFingerprint" = 'legacy-inventory:' || "direction"::text || ':' || "itemId" || ':' ||
  "quantity"::text || ':' || "sourceType" || ':' || COALESCE("sourceId", '');
ALTER TABLE "inventory_ledger_entries"
  ALTER COLUMN "requestFingerprint" DROP DEFAULT;
ALTER TABLE "inventory_ledger_entries"
  ADD CONSTRAINT "inventory_ledger_entries_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "item_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shop_purchases"
  ADD COLUMN "balanceAfter" BIGINT,
  ADD COLUMN "quantityAfter" INTEGER,
  ADD CONSTRAINT "chk_shop_purchase_price_safe_integer"
  CHECK ("priceAmount" <= 9007199254740991),
  ADD CONSTRAINT "chk_shop_purchase_balance_after_safe_integer"
  CHECK ("balanceAfter" >= 0 AND "balanceAfter" <= 9007199254740991),
  ADD CONSTRAINT "chk_shop_purchase_quantity_after_non_negative"
  CHECK ("quantityAfter" >= 0),
  ADD CONSTRAINT "chk_shop_purchase_scope_consistency"
  CHECK (
    ("currencyKind" IN ('COIN', 'GEM') AND "currencyScopeType" IS NULL AND "currencyScopeId" IS NULL) OR
    ("currencyKind" = 'EVENT_TOKEN' AND "currencyScopeType" IS NOT NULL AND "currencyScopeId" IS NOT NULL)
  );
UPDATE "shop_purchases" p
SET "balanceAfter" = l."balanceAfter"
FROM "currency_ledger_entries" l
WHERE l."userId" = p."userId"
  AND l."idempotencyKey" = 'purchase:' || p."userId" || ':' || p."clientTransactionId";

UPDATE "shop_purchases" p
SET "quantityAfter" = l."quantityAfter"
FROM "inventory_ledger_entries" l
WHERE l."userId" = p."userId"
  AND l."idempotencyKey" = 'purchase_inv:' || p."userId" || ':' || p."clientTransactionId";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "shop_purchases"
    WHERE "balanceAfter" IS NULL OR "quantityAfter" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot backfill deterministic ShopPurchase snapshots from Phase 4 ledgers.';
  END IF;
END;
$$;

UPDATE "shop_purchases"
SET "requestFingerprint" = 'legacy-purchase:' || "offerId";

ALTER TABLE "shop_purchases"
  ALTER COLUMN "balanceAfter" SET NOT NULL,
  ALTER COLUMN "quantityAfter" SET NOT NULL;

CREATE TABLE "cosmetic_action_records" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientTransactionId" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "itemId" TEXT,
  "slot" "CosmeticSlot" NOT NULL,
  "responsePayload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cosmetic_action_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cosmetic_variants" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "assetKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cosmetic_variants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cosmetic_variants_itemId_characterId_key"
ON "cosmetic_variants"("itemId", "characterId");
CREATE INDEX "cosmetic_variants_characterId_idx" ON "cosmetic_variants"("characterId");
ALTER TABLE "cosmetic_variants"
  ADD CONSTRAINT "cosmetic_variants_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "item_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cosmetic_variants"
  ADD CONSTRAINT "cosmetic_variants_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
INSERT INTO "cosmetic_variants" ("id", "itemId", "characterId", "assetKey", "createdAt", "updatedAt")
SELECT 'variant_' || md5(i."id" || ':' || c."id"), i."id", c."id", i."assetKey", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "item_definitions" i
CROSS JOIN "characters" c
WHERE i."type" = 'COSMETIC'
ON CONFLICT ("itemId", "characterId") DO NOTHING;
CREATE UNIQUE INDEX "cosmetic_action_records_userId_clientTransactionId_key"
ON "cosmetic_action_records"("userId", "clientTransactionId");
CREATE INDEX "cosmetic_action_records_userId_idx" ON "cosmetic_action_records"("userId");
ALTER TABLE "cosmetic_action_records"
  ADD CONSTRAINT "cosmetic_action_records_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cosmetic_action_records"
  ADD CONSTRAINT "cosmetic_action_records_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "item_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_phase4_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is immutable. UPDATE, DELETE, and TRUNCATE operations are prohibited.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_inventory_ledger_update_delete
BEFORE UPDATE OR DELETE ON "inventory_ledger_entries"
FOR EACH ROW EXECUTE FUNCTION prevent_phase4_audit_modification();

CREATE TRIGGER trg_prevent_shop_purchase_update_delete
BEFORE UPDATE OR DELETE ON "shop_purchases"
FOR EACH ROW EXECUTE FUNCTION prevent_phase4_audit_modification();

CREATE TRIGGER trg_prevent_cosmetic_action_update_delete
BEFORE UPDATE OR DELETE ON "cosmetic_action_records"
FOR EACH ROW EXECUTE FUNCTION prevent_phase4_audit_modification();

CREATE TRIGGER trg_prevent_currency_ledger_truncate
BEFORE TRUNCATE ON "currency_ledger_entries"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_phase4_audit_modification();

CREATE TRIGGER trg_prevent_inventory_ledger_truncate
BEFORE TRUNCATE ON "inventory_ledger_entries"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_phase4_audit_modification();

CREATE TRIGGER trg_prevent_shop_purchase_truncate
BEFORE TRUNCATE ON "shop_purchases"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_phase4_audit_modification();

CREATE TRIGGER trg_prevent_cosmetic_action_truncate
BEFORE TRUNCATE ON "cosmetic_action_records"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_phase4_audit_modification();

COMMIT;
