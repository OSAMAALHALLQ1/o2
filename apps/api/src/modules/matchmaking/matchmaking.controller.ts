import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { RoomGameMode } from '@o2/types';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { MatchmakingService } from './matchmaking.service';
import { MATCHMAKING_THROTTLES } from './matchmaking.constants';

export class JoinQueueDto {
  gameMode!: RoomGameMode;
}

export class CancelQueueDto {
  ticketId?: string;
}

@Controller('matchmaking')
@UseGuards(JwtAuthGuard)
export class MatchmakingController {
  private readonly matchmakingService: MatchmakingService;

  constructor(matchmakingService: MatchmakingService) {
    this.matchmakingService = matchmakingService;
  }

  @Post('join')
  @Throttle({
    default: {
      limit: MATCHMAKING_THROTTLES.JOIN_LIMIT,
      ttl: MATCHMAKING_THROTTLES.JOIN_TTL_MS,
    },
  })
  async joinQueue(@Req() req: any, @Body() body: JoinQueueDto) {
    return this.matchmakingService.joinQueue(req.user.userId, body.gameMode);
  }

  @Post('cancel')
  @Throttle({
    default: {
      limit: MATCHMAKING_THROTTLES.CANCEL_LIMIT,
      ttl: MATCHMAKING_THROTTLES.CANCEL_TTL_MS,
    },
  })
  async cancelQueue(@Req() req: any, @Body() body: CancelQueueDto) {
    return this.matchmakingService.cancelQueue(req.user.userId, body.ticketId);
  }

  @Get('status')
  @Throttle({
    default: {
      limit: MATCHMAKING_THROTTLES.STATUS_LIMIT,
      ttl: MATCHMAKING_THROTTLES.STATUS_TTL_MS,
    },
  })
  async getStatus(@Req() req: any) {
    return this.matchmakingService.getQueueStatus(req.user.userId);
  }
}
