import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JoinByCodeDto, PartyAccessDto, PartyInviteDto, ReadyDto, SelectGameDto, UserTargetDto } from './dto/social.dto';
import { SOCIAL_LIMITS } from './social.constants';
import { PartyService } from './party.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class PartyController {
  constructor(private readonly parties: PartyService) {}

  @Post('parties')
  create(@Req() req: any) { return this.parties.createParty(req.user.userId); }

  @Get('me/party')
  current(@Req() req: any) { return this.parties.getMyParty(req.user.userId); }

  @Post('parties/:id/invites')
  @Throttle({ default: { limit: SOCIAL_LIMITS.PARTY_INVITES_PER_MINUTE, ttl: 60_000 } })
  invite(@Req() req: any, @Param('id') id: string, @Body() dto: PartyInviteDto) { return this.parties.invite(req.user.userId, id, dto.userId); }

  @Get('me/party-invites')
  invites(@Req() req: any) { return this.parties.listInvites(req.user.userId); }

  @Post('party-invites/:id/accept')
  accept(@Req() req: any, @Param('id') id: string) { return this.parties.acceptInvite(req.user.userId, id); }

  @Post('party-invites/:id/reject')
  reject(@Req() req: any, @Param('id') id: string) { return this.parties.rejectInvite(req.user.userId, id); }

  @Post('parties/join-by-code')
  @Throttle({ default: { limit: SOCIAL_LIMITS.PARTY_CODE_ATTEMPTS_PER_MINUTE, ttl: 60_000 } })
  joinByCode(@Req() req: any, @Body() dto: JoinByCodeDto) { return this.parties.joinByCode(req.user.userId, dto.code); }

  @Post('parties/:id/leave')
  leave(@Req() req: any, @Param('id') id: string) { return this.parties.leave(req.user.userId, id); }

  @Post('parties/:id/kick')
  kick(@Req() req: any, @Param('id') id: string, @Body() dto: UserTargetDto) { return this.parties.kick(req.user.userId, id, dto.userId); }

  @Post('parties/:id/ready')
  ready(@Req() req: any, @Param('id') id: string, @Body() dto: ReadyDto) { return this.parties.setReady(req.user.userId, id, dto.readyState); }

  @Post('parties/:id/game')
  game(@Req() req: any, @Param('id') id: string, @Body() dto: SelectGameDto) { return this.parties.selectGame(req.user.userId, id, dto.desiredGameMode); }

  @Patch('parties/:id/code-access')
  access(@Req() req: any, @Param('id') id: string, @Body() dto: PartyAccessDto) { return this.parties.setCodeAccess(req.user.userId, id, dto.allowJoinByCode); }
}
