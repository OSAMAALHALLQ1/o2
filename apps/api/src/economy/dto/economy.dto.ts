import { IsString, IsNotEmpty, IsIn, MaxLength } from 'class-validator';
import { CosmeticSlot } from '@o2/types';

export class InitializeEconomyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  clientTransactionId!: string;
}

export class ShopPurchaseDto {
  @IsString()
  @IsNotEmpty()
  offerId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  clientTransactionId!: string;
}

export class UseConsumableDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  clientTransactionId!: string;
}

export class EquipCosmeticDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  clientTransactionId!: string;
}

export class UnequipCosmeticDto {
  @IsIn(['HEAD', 'FACE', 'BODY', 'BACK', 'AURA', 'NAME_FRAME'])
  slot!: CosmeticSlot;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  clientTransactionId!: string;
}
