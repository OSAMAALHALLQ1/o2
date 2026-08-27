import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { EconomyService } from './economy.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InitializeEconomyDto } from './dto/economy.dto';

@Controller('me/economy')
@UseGuards(JwtAuthGuard)
export class EconomyController {
  constructor(private readonly economyService: EconomyService) {}

  @Post('initialize')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async initializeEconomy(@Req() req: any, @Body() dto: InitializeEconomyDto) {
    return this.economyService.initializeWelcomeEconomy(req.user.userId, dto.clientTransactionId);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getEconomyOverview(@Req() req: any) {
    return this.economyService.getEconomyOverview(req.user.userId);
  }

  @Get('ledger')
  @HttpCode(HttpStatus.OK)
  async getLedgerHistory(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.economyService.getLedgerHistory(req.user.userId, pageNum, limitNum);
  }
}
