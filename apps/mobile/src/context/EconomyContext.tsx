import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  ShopOfferDto,
  ShopPurchaseDto,
  UserInventoryItemDto,
  EquippedCosmeticDto,
  CosmeticSlot,
} from '@o2/types';
import {
  fetchEconomyOverviewApi,
  initializeEconomyApi,
  fetchShopOffersApi,
  purchaseShopOfferApi,
  fetchUserInventoryApi,
  useConsumableItemApi,
  fetchEquippedCosmeticsApi,
  equipCosmeticApi,
  unequipCosmeticApi,
} from '../api/economy';
import { useAuth } from './AuthContext';

interface EconomyContextType {
  coins: number;
  gems: number;
  eventTokens: { scopeType: string; scopeId: string; balance: number }[];
  inventory: UserInventoryItemDto[];
  equippedCosmetics: Record<string, EquippedCosmeticDto>;
  shopOffers: ShopOfferDto[];
  isLoading: boolean;
  isPurchasing: boolean;
  refreshEconomy: () => Promise<void>;
  initializeEconomy: () => Promise<void>;
  purchaseOffer: (offerId: string) => Promise<ShopPurchaseDto>;
  useConsumable: (itemId: string) => Promise<any>;
  equipCosmetic: (itemId: string) => Promise<any>;
  unequipCosmetic: (slot: CosmeticSlot) => Promise<any>;
}

const EconomyContext = createContext<EconomyContextType | undefined>(undefined);

export const EconomyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { authState, profile } = useAuth();
  const [coins, setCoins] = useState<number>(0);
  const [gems, setGems] = useState<number>(0);
  const [eventTokens, setEventTokens] = useState<{ scopeType: string; scopeId: string; balance: number }[]>([]);
  const [inventory, setInventory] = useState<UserInventoryItemDto[]>([]);
  const [equippedCosmetics, setEquippedCosmetics] = useState<Record<string, EquippedCosmeticDto>>({});
  const [shopOffers, setShopOffers] = useState<ShopOfferDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPurchasing, setIsPurchasing] = useState<boolean>(false);

  const refreshEconomy = useCallback(async () => {
    if (authState !== 'authenticated' || !profile?.isOnboarded) {
      setCoins(0);
      setGems(0);
      setEventTokens([]);
      setInventory([]);
      setEquippedCosmetics({});
      return;
    }

    try {
      setIsLoading(true);
      const [overview, inv, equipped, offers] = await Promise.all([
        fetchEconomyOverviewApi().catch(() => null),
        fetchUserInventoryApi().catch(() => []),
        fetchEquippedCosmeticsApi().catch(() => ({ equipped: {} })),
        fetchShopOffersApi().catch(() => []),
      ]);

      if (overview) {
        setCoins(overview.coins);
        setGems(overview.gems);
        setEventTokens(overview.eventTokens);
      }

      setInventory(inv || []);
      setEquippedCosmetics(equipped?.equipped || {});
      setShopOffers(offers || []);
    } catch (err) {
      console.warn('Failed to refresh economy state:', err);
    } finally {
      setIsLoading(false);
    }
  }, [authState, profile]);

  const initializeEconomy = useCallback(async () => {
    if (authState !== 'authenticated') return;

    try {
      setIsLoading(true);
      const clientTxId = `init_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const overview = await initializeEconomyApi(clientTxId);
      setCoins(overview.coins);
      setGems(overview.gems);
      setEventTokens(overview.eventTokens);
      await refreshEconomy();
    } catch (err) {
      console.warn('Failed to initialize economy:', err);
    } finally {
      setIsLoading(false);
    }
  }, [authState, refreshEconomy]);

  useEffect(() => {
    if (authState === 'authenticated' && profile?.isOnboarded) {
      refreshEconomy();
    }
  }, [authState, profile, refreshEconomy]);

  const purchaseOffer = useCallback(
    async (offerId: string): Promise<ShopPurchaseDto> => {
      const clientTransactionId = `pur_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      try {
        setIsPurchasing(true);
        const purchase = await purchaseShopOfferApi(offerId, clientTransactionId);
        setCoins(purchase.newBalance);
        await refreshEconomy();
        return purchase;
      } finally {
        setIsPurchasing(false);
      }
    },
    [refreshEconomy],
  );

  const useConsumable = useCallback(
    async (itemId: string): Promise<any> => {
      const clientTransactionId = `use_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const result = await useConsumableItemApi(itemId, clientTransactionId);
      await refreshEconomy();
      return result;
    },
    [refreshEconomy],
  );

  const equipCosmetic = useCallback(
    async (itemId: string): Promise<any> => {
      const clientTransactionId = `eq_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const result = await equipCosmeticApi(itemId, clientTransactionId);
      await refreshEconomy();
      return result;
    },
    [refreshEconomy],
  );

  const unequipCosmetic = useCallback(
    async (slot: CosmeticSlot): Promise<any> => {
      const clientTransactionId = `uneq_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const result = await unequipCosmeticApi(slot, clientTransactionId);
      await refreshEconomy();
      return result;
    },
    [refreshEconomy],
  );

  return (
    <EconomyContext.Provider
      value={{
        coins,
        gems,
        eventTokens,
        inventory,
        equippedCosmetics,
        shopOffers,
        isLoading,
        isPurchasing,
        refreshEconomy,
        initializeEconomy,
        purchaseOffer,
        useConsumable,
        equipCosmetic,
        unequipCosmetic,
      }}
    >
      {children}
    </EconomyContext.Provider>
  );
};

export const useEconomy = (): EconomyContextType => {
  const context = useContext(EconomyContext);
  if (!context) {
    throw new Error('useEconomy must be used within an EconomyProvider');
  }
  return context;
};
