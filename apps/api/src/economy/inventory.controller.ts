import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UseConsumableDto } from './dto/economy.dto';

@Controller('me/inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getUserInventory(@Req() req: any) {
    return this.inventoryService.getUserInventory(req.user.userId);
  }

  @Post('use')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async useConsumable(@Req() req: any, @Body() dto: UseConsumableDto) {
    return this.inventoryService.consumeItem(req.user.userId, dto.itemId, dto.clientTransactionId);
  }
}
