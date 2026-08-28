import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PaginationDto, SearchPlayersDto, UpdatePrivacyDto, UserTargetDto } from './dto/social.dto';
import { SOCIAL_LIMITS } from './social.constants';
import { SocialService } from './social.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get('players/search')
  @Throttle({ default: { limit: SOCIAL_LIMITS.SEARCH_PER_MINUTE, ttl: 60_000 } })
  search(@Req() req: any, @Query() query: SearchPlayersDto) { return this.social.searchPlayers(req.user.userId, query.query); }

  @Get('me/friends')
  friends(@Req() req: any, @Query() query: PaginationDto) { return this.social.listFriends(req.user.userId, query.page, query.limit); }

  @Get('me/friend-requests/incoming')
  incoming(@Req() req: any, @Query() query: PaginationDto) { return this.social.listRequests(req.user.userId, 'incoming', query.page, query.limit); }

  @Get('me/friend-requests/outgoing')
  outgoing(@Req() req: any, @Query() query: PaginationDto) { return this.social.listRequests(req.user.userId, 'outgoing', query.page, query.limit); }

  @Post('friends/requests')
  @Throttle({ default: { limit: SOCIAL_LIMITS.FRIEND_REQUESTS_PER_MINUTE, ttl: 60_000 } })
  request(@Req() req: any, @Body() dto: UserTargetDto) { return this.social.sendFriendRequest(req.user.userId, dto.userId); }

  @Post('friends/requests/:id/accept')
  accept(@Req() req: any, @Param('id') id: string) { return this.social.acceptFriendRequest(req.user.userId, id); }

  @Post('friends/requests/:id/reject')
  reject(@Req() req: any, @Param('id') id: string) { return this.social.rejectFriendRequest(req.user.userId, id); }

  @Delete('friends/requests/:id')
  cancel(@Req() req: any, @Param('id') id: string) { return this.social.cancelFriendRequest(req.user.userId, id); }

  @Delete('friends/:userId')
  remove(@Req() req: any, @Param('userId') userId: string) { return this.social.removeFriend(req.user.userId, userId); }

  @Post('blocks/:userId')
  @Throttle({ default: { limit: SOCIAL_LIMITS.BLOCK_ACTIONS_PER_MINUTE, ttl: 60_000 } })
  block(@Req() req: any, @Param('userId') userId: string) { return this.social.blockUser(req.user.userId, userId); }

  @Delete('blocks/:userId')
  @Throttle({ default: { limit: SOCIAL_LIMITS.BLOCK_ACTIONS_PER_MINUTE, ttl: 60_000 } })
  unblock(@Req() req: any, @Param('userId') userId: string) { return this.social.unblockUser(req.user.userId, userId); }

  @Get('me/blocks')
  blocks(@Req() req: any) { return this.social.listBlocks(req.user.userId); }

  @Get('me/social-privacy')
  privacy(@Req() req: any) { return this.social.getPrivacy(req.user.userId); }

  @Patch('me/social-privacy')
  updatePrivacy(@Req() req: any, @Body() dto: UpdatePrivacyDto) {
    return this.social.updatePrivacy(req.user.userId, dto.friendRequestPolicy, dto.allowPartyInvites);
  }
}
