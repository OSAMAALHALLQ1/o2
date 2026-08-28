import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EconomyService } from './economy.service';
import { InventoryService } from './inventory.service';
import { ShopService } from './shop.service';
import { CosmeticsService } from './cosmetics.service';
import { EconomyController } from './economy.controller';
import { ShopController } from './shop.controller';
import { InventoryController } from './inventory.controller';
import { CosmeticsController } from './cosmetics.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [
    EconomyController,
    ShopController,
    InventoryController,
    CosmeticsController,
  ],
  providers: [
    EconomyService,
    InventoryService,
    ShopService,
    CosmeticsService,
  ],
  exports: [
    EconomyService,
    InventoryService,
    ShopService,
    CosmeticsService,
  ],
})
export class EconomyModule {}
