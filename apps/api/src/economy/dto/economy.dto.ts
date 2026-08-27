import { IsString, IsNotEmpty } from 'class-validator';
import { CosmeticSlot } from '@o2/types';

export class InitializeEconomyDto {
  @IsString()
  @IsNotEmpty()
  clientTransactionId!: string;
}

export class ShopPurchaseDto {
  @IsString()
  @IsNotEmpty()
  offerId!: string;

  @IsString()
  @IsNotEmpty()
  clientTransactionId!: string;
}

export class UseConsumableDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @IsString()
  @IsNotEmpty()
  clientTransactionId!: string;
}

export class EquipCosmeticDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @IsString()
  @IsNotEmpty()
  clientTransactionId!: string;
}

export class UnequipCosmeticDto {
  @IsString()
  @IsNotEmpty()
  slot!: CosmeticSlot;

  @IsString()
  @IsNotEmpty()
  clientTransactionId!: string;
}
