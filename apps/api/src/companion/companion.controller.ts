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
import { CompanionService } from './companion.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanionActionDto } from './dto/companion-action.dto';

@Controller('me/companion')
@UseGuards(JwtAuthGuard)
export class CompanionController {
  constructor(private readonly companionService: CompanionService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getCompanionCareState(@Req() req: any) {
    return this.companionService.getCompanionCareState(req.user.userId);
  }

  @Post('actions')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async performCareAction(@Req() req: any, @Body() dto: CompanionActionDto) {
    return this.companionService.performCareAction(req.user.userId, dto);
  }

  // Convenience Endpoints
  @Post('actions/feed')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async feedCompanion(@Req() req: any, @Body() body: { clientActionId: string }) {
    return this.companionService.performCareAction(req.user.userId, {
      action: 'FEED',
      clientActionId: body.clientActionId,
    });
  }

  @Post('actions/clean')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async cleanCompanion(@Req() req: any, @Body() body: { clientActionId: string }) {
    return this.companionService.performCareAction(req.user.userId, {
      action: 'CLEAN',
      clientActionId: body.clientActionId,
    });
  }

  @Post('actions/play')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async playCompanion(@Req() req: any, @Body() body: { clientActionId: string }) {
    return this.companionService.performCareAction(req.user.userId, {
      action: 'PLAY',
      clientActionId: body.clientActionId,
    });
  }

  @Post('actions/pet')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async petCompanion(@Req() req: any, @Body() body: { clientActionId: string }) {
    return this.companionService.performCareAction(req.user.userId, {
      action: 'PET',
      clientActionId: body.clientActionId,
    });
  }

  @Post('actions/sleep')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async sleepCompanion(@Req() req: any, @Body() body: { clientActionId: string }) {
    return this.companionService.performCareAction(req.user.userId, {
      action: 'SLEEP',
      clientActionId: body.clientActionId,
    });
  }

  @Post('actions/wake')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async wakeCompanion(@Req() req: any, @Body() body: { clientActionId: string }) {
    return this.companionService.performCareAction(req.user.userId, {
      action: 'WAKE',
      clientActionId: body.clientActionId,
    });
  }
}
