import {
  EconomyOverviewDto,
  ShopOfferDto,
  ShopPurchaseDto,
  UserInventoryItemDto,
  EquippedCosmeticsOverviewDto,
  CosmeticSlot,
} from '@o2/types';
import { AuthTokenStorage } from '../storage/auth-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

async function authenticatedFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const accessToken = await AuthTokenStorage.getAccessToken();
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'حدث خطأ في معالجة الطلب');
  }

  return data as T;
}

export async function fetchEconomyOverviewApi(): Promise<EconomyOverviewDto> {
  return authenticatedFetch<EconomyOverviewDto>('/me/economy');
}

export async function initializeEconomyApi(clientTransactionId: string): Promise<EconomyOverviewDto> {
  return authenticatedFetch<EconomyOverviewDto>('/me/economy/initialize', {
    method: 'POST',
    body: JSON.stringify({ clientTransactionId }),
  });
}

export async function fetchShopOffersApi(): Promise<ShopOfferDto[]> {
  return authenticatedFetch<ShopOfferDto[]>('/shop/offers');
}

export async function purchaseShopOfferApi(
  offerId: string,
  clientTransactionId: string,
): Promise<ShopPurchaseDto> {
  return authenticatedFetch<ShopPurchaseDto>('/shop/purchases', {
    method: 'POST',
    body: JSON.stringify({ offerId, clientTransactionId }),
  });
}

export async function fetchUserInventoryApi(): Promise<UserInventoryItemDto[]> {
  return authenticatedFetch<UserInventoryItemDto[]>('/me/inventory');
}

export async function useConsumableItemApi(itemId: string, clientTransactionId: string): Promise<any> {
  return authenticatedFetch<any>('/me/inventory/use', {
    method: 'POST',
    body: JSON.stringify({ itemId, clientTransactionId }),
  });
}

export async function fetchEquippedCosmeticsApi(): Promise<EquippedCosmeticsOverviewDto> {
  return authenticatedFetch<EquippedCosmeticsOverviewDto>('/me/cosmetics');
}

export async function equipCosmeticApi(itemId: string, clientTransactionId: string): Promise<any> {
  return authenticatedFetch<any>('/me/cosmetics/equip', {
    method: 'POST',
    body: JSON.stringify({ itemId, clientTransactionId }),
  });
}

export async function unequipCosmeticApi(slot: CosmeticSlot, clientTransactionId: string): Promise<any> {
  return authenticatedFetch<any>('/me/cosmetics/unequip', {
    method: 'POST',
    body: JSON.stringify({ slot, clientTransactionId }),
  });
}
