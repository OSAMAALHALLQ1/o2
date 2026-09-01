import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  ModerationMuteDto,
  ReportVoiceParticipantDto,
  RequestVoiceGrantDto,
  UpdateVoicePermissionsDto,
  VoiceAccessGrantDto,
  VoiceRoomContextType,
  VoiceRoomSummaryDto,
} from '@o2/types';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { VoiceService } from './voice.service';

@Controller('voice')
@UseGuards(JwtAuthGuard)
export class VoiceController {
  private readonly voiceService: VoiceService;

  constructor(voiceService: VoiceService) {
    this.voiceService = voiceService;
  }

  @Post('token')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  async requestVoiceGrant(
    @Req() req: any,
    @Body() dto: RequestVoiceGrantDto,
  ): Promise<VoiceAccessGrantDto> {
    return this.voiceService.requestVoiceGrant(req.user.id, dto);
  }

  @Get('room/:contextType/:contextId')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async getRoomSummary(
    @Req() req: any,
    @Param('contextType') contextType: VoiceRoomContextType,
    @Param('contextId') contextId: string,
  ): Promise<VoiceRoomSummaryDto> {
    return this.voiceService.getRoomSummary(req.user.id, contextType, contextId);
  }

  @Post('room/:contextType/:contextId/leave')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async leaveVoiceRoom(
    @Req() req: any,
    @Param('contextType') contextType: VoiceRoomContextType,
    @Param('contextId') contextId: string,
  ): Promise<{ left: boolean }> {
    return this.voiceService.leaveVoiceRoom(req.user.id, contextType, contextId);
  }

  @Post('room/:contextType/:contextId/self-mute')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async setSelfMute(
    @Req() req: any,
    @Param('contextType') contextType: VoiceRoomContextType,
    @Param('contextId') contextId: string,
    @Body('isMuted') isMuted: boolean,
  ) {
    return this.voiceService.setSelfMute(req.user.id, contextType, contextId, Boolean(isMuted));
  }

  @Post('room/:contextType/:contextId/permissions')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async updatePermissions(
    @Req() req: any,
    @Param('contextType') contextType: VoiceRoomContextType,
    @Param('contextId') contextId: string,
    @Body() dto: UpdateVoicePermissionsDto,
  ): Promise<VoiceRoomSummaryDto> {
    return this.voiceService.updatePermissions(
      req.user.id,
      contextType,
      contextId,
      dto.permissionState,
    );
  }

  @Post('room/:contextType/:contextId/mute-participant')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async setServerMute(
    @Req() req: any,
    @Param('contextType') contextType: VoiceRoomContextType,
    @Param('contextId') contextId: string,
    @Body() dto: ModerationMuteDto,
  ) {
    return this.voiceService.setServerMute(
      req.user.id,
      contextType,
      contextId,
      dto,
    );
  }

  @Post('report')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async reportParticipant(
    @Req() req: any,
    @Body() dto: ReportVoiceParticipantDto,
  ): Promise<{ reported: boolean; reportId: string }> {
    return this.voiceService.reportParticipant(req.user.id, dto);
  }
}
