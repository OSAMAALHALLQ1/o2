export type CurrencyKind = 'COIN' | 'GEM' | 'EVENT_TOKEN';
// Backwards-compatible alias
export type CurrencyType = CurrencyKind | 'O2_COIN' | 'O2_GEM';

export type CurrencyScopeType = 'EVENT' | 'SEASON';

export type LedgerDirection = 'CREDIT' | 'DEBIT';

export type CurrencyLedgerSource =
  | 'WELCOME_BONUS'
  | 'SHOP_PURCHASE'
  | 'MATCH_REWARD'
  | 'DAILY_MISSION'
  | 'ACHIEVEMENT'
  | 'COMPANION_FEED'
  | 'REAL_ORDER_VERIFIED'
  | 'QR_RECEIPT_REDEMPTION'
  | 'ADMIN_ADJUSTMENT'
  | 'EVENT_REWARD';

export type LedgerSource = CurrencyLedgerSource;

export type ItemType = 'CONSUMABLE' | 'COSMETIC';

export type ItemRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';

export type CosmeticSlot =
  | 'HEAD'
  | 'FACE'
  | 'BODY'
  | 'BACK'
  | 'AURA'
  | 'NAME_FRAME';

export type InventoryLedgerDirection = 'GRANT' | 'CONSUME' | 'REVOKE';

export interface CurrencyAccountDto {
  currencyKind: CurrencyKind;
  scopeType: CurrencyScopeType | null;
  scopeId: string | null;
  balance: number;
}

export interface EconomyOverviewDto {
  coins: number;
  gems: number;
  eventTokens: {
    scopeType: CurrencyScopeType;
    scopeId: string;
    balance: number;
  }[];
  accounts: CurrencyAccountDto[];
}

// Backwards-compatible alias
export interface WalletBalancesDto {
  coins: number;
  gems: number;
  eventTokens?: {
    eventId: string;
    balance: number;
  }[];
}

export interface CurrencyLedgerEntryDto {
  id: string;
  currencyKind: CurrencyKind;
  scopeType: CurrencyScopeType | null;
  scopeId: string | null;
  direction: LedgerDirection;
  amount: number;
  balanceAfter: number;
  sourceType: CurrencyLedgerSource;
  sourceId: string | null;
  idempotencyKey: string;
  createdAt: string;
}

export interface ItemDefinitionDto {
  id: string;
  slug: string;
  type: ItemType;
  rarity: ItemRarity;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  assetKey: string;
  cosmeticSlot: CosmeticSlot | null;
  hungerDelta: number | null;
  cleanlinessDelta: number | null;
  energyDelta: number | null;
  moodDelta: number | null;
  reactionKey: string | null;
  isActive: boolean;
  isStackable: boolean;
  sortOrder: number;
}

export interface UserInventoryItemDto {
  id: string;
  itemId: string;
  quantity: number;
  item: ItemDefinitionDto;
  isEquipped?: boolean;
}

export interface ShopOfferDto {
  id: string;
  slug: string;
  itemId: string;
  itemQuantity: number;
  currencyKind: CurrencyKind;
  currencyScopeType: CurrencyScopeType | null;
  currencyScopeId: string | null;
  priceAmount: number;
  isActive: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  item: ItemDefinitionDto;
}

export interface ShopPurchaseDto {
  id: string;
  offerId: string;
  itemId: string;
  itemQuantity: number;
  currencyKind: CurrencyKind;
  priceAmount: number;
  clientTransactionId: string;
  createdAt: string;
  inventoryItem: UserInventoryItemDto;
  newBalance: number;
}

export interface EquippedCosmeticDto {
  slot: CosmeticSlot;
  itemId: string;
  item: ItemDefinitionDto;
  equippedAt: string;
}

export interface EquippedCosmeticsOverviewDto {
  equipped: Record<string, EquippedCosmeticDto>;
}

// Request DTOs
export interface ShopPurchaseRequestDto {
  offerId: string;
  clientTransactionId: string;
}

export interface ConsumableUseRequestDto {
  itemId: string;
  clientTransactionId: string;
}

export interface CosmeticEquipRequestDto {
  itemId: string;
  clientTransactionId: string;
}

export interface CosmeticUnequipRequestDto {
  slot: CosmeticSlot;
  clientTransactionId: string;
}

// Legacy summary aliases
export interface CosmeticItemSummaryDto {
  id: string;
  slug: string;
  nameKey: string;
  slot: CosmeticSlot;
  rarity: ItemRarity;
  coinPrice?: number;
  gemPrice?: number;
  previewUri: string;
  isOwned?: boolean;
  isEquipped?: boolean;
}

export interface VirtualFoodSummaryDto {
  id: string;
  slug: string;
  nameKey: string;
  hungerRestore: number;
  moodBoost: number;
  coinCost: number;
  isGoldenVariant: boolean;
  assetUri: string;
  ownedQuantity?: number;
}
