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
import { CosmeticsService } from './cosmetics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EquipCosmeticDto, UnequipCosmeticDto } from './dto/economy.dto';

@Controller('me/cosmetics')
@UseGuards(JwtAuthGuard)
export class CosmeticsController {
  constructor(private readonly cosmeticsService: CosmeticsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getEquippedCosmetics(@Req() req: any) {
    return this.cosmeticsService.getEquippedCosmetics(req.user.userId);
  }

  @Post('equip')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async equipCosmetic(@Req() req: any, @Body() dto: EquipCosmeticDto) {
    return this.cosmeticsService.equipCosmetic(req.user.userId, dto.itemId, dto.clientTransactionId);
  }

  @Post('unequip')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async unequipCosmetic(@Req() req: any, @Body() dto: UnequipCosmeticDto) {
    return this.cosmeticsService.unequipCosmetic(req.user.userId, dto.slot, dto.clientTransactionId);
  }
}
