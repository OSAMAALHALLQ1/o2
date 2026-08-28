import {
  EconomyOverviewDto,
  ShopOfferDto,
  ShopPurchaseDto,
  UserInventoryItemDto,
  EquippedCosmeticsOverviewDto,
  CosmeticSlot,
} from '@o2/types';
import { api } from './client';

export async function fetchEconomyOverviewApi(): Promise<EconomyOverviewDto> {
  return api.get<EconomyOverviewDto>('/me/economy');
}

export async function initializeEconomyApi(clientTransactionId: string): Promise<EconomyOverviewDto> {
  return api.post<EconomyOverviewDto>('/me/economy/initialize', { clientTransactionId });
}

export async function fetchShopOffersApi(): Promise<ShopOfferDto[]> {
  return api.get<ShopOfferDto[]>('/shop/offers', { skipAuth: true });
}

export async function purchaseShopOfferApi(
  offerId: string,
  clientTransactionId: string,
): Promise<ShopPurchaseDto> {
  return api.post<ShopPurchaseDto>('/shop/purchases', { offerId, clientTransactionId });
}

export async function fetchUserInventoryApi(): Promise<UserInventoryItemDto[]> {
  return api.get<UserInventoryItemDto[]>('/me/inventory');
}

export async function useConsumableItemApi(itemId: string, clientTransactionId: string): Promise<any> {
  return api.post<any>('/me/inventory/use', { itemId, clientTransactionId });
}

export async function fetchEquippedCosmeticsApi(): Promise<EquippedCosmeticsOverviewDto> {
  return api.get<EquippedCosmeticsOverviewDto>('/me/cosmetics');
}

export async function equipCosmeticApi(itemId: string, clientTransactionId: string): Promise<any> {
  return api.post<any>('/me/cosmetics/equip', { itemId, clientTransactionId });
}

export async function unequipCosmeticApi(slot: CosmeticSlot, clientTransactionId: string): Promise<any> {
  return api.post<any>('/me/cosmetics/unequip', { slot, clientTransactionId });
}
