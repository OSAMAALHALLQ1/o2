export type CurrencyType = 'O2_COIN' | 'O2_GEM' | 'EVENT_TOKEN';

export type ItemRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';

export type CosmeticSlot =
  | 'OUTFIT'
  | 'HAT'
  | 'GLASSES'
  | 'BACK_ACCESSORY'
  | 'EMOTE'
  | 'PROFILE_FRAME'
  | 'CARD_BACK'
  | 'TABLE_SKIN';

export type LedgerSource =
  | 'MATCH_REWARD'
  | 'DAILY_MISSION'
  | 'ACHIEVEMENT'
  | 'SHOP_PURCHASE'
  | 'COMPANION_FEED'
  | 'REAL_ORDER_VERIFIED'
  | 'QR_RECEIPT_REDEMPTION'
  | 'ADMIN_ADJUSTMENT'
  | 'EVENT_REWARD';

export interface WalletBalancesDto {
  coins: number;
  gems: number;
  eventTokens?: {
    eventId: string;
    balance: number;
  }[];
}

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
