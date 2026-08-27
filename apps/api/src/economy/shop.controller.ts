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
import { ShopService } from './shop.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ShopPurchaseDto } from './dto/economy.dto';

@Controller('shop')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Get('offers')
  @HttpCode(HttpStatus.OK)
  async getActiveOffers() {
    return this.shopService.getActiveOffers();
  }

  @Post('purchases')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async purchaseOffer(@Req() req: any, @Body() dto: ShopPurchaseDto) {
    return this.shopService.purchaseOffer(req.user.userId, dto.offerId, dto.clientTransactionId);
  }
}
