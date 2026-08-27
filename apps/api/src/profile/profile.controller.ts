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
import { ProfileService } from './profile.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SetUsernameDto, CheckUsernameDto } from './dto/username.dto';
import { SelectCompanionDto } from './dto/companion.dto';

@Controller()
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Req() req: any) {
    return this.profileService.getMe(req.user.userId, req.user.sessionId);
  }

  @Post('me/username/check')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async checkUsername(@Body() dto: CheckUsernameDto) {
    return this.profileService.checkUsernameAvailability(dto.username);
  }

  @Post('me/username')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async setUsername(@Req() req: any, @Body() dto: SetUsernameDto) {
    return this.profileService.setUsername(req.user.userId, dto);
  }

  @Get('companions/starters')
  @HttpCode(HttpStatus.OK)
  async getStarters() {
    return this.profileService.getStarterCompanions();
  }

  @Post('me/companion/select')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async selectCompanion(@Req() req: any, @Body() dto: SelectCompanionDto) {
    return this.profileService.selectPermanentStarterCompanion(req.user.userId, dto);
  }
}
