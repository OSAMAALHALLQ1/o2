import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RoomManagerService } from '../realtime/rooms/room-manager.service';
import { RealtimeServerService } from '../realtime/services/realtime-server.service';
import { LiveKitVoiceAdapter } from './adapters/livekit-voice.adapter';
import { MockVoiceAdapter } from './adapters/mock-voice.adapter';
import { VoiceRoomManager } from './voice-room.manager';
import { VoiceServiceCore } from './voice.manager';

export * from './voice.manager';
export * from './voice-room.manager';
export * from './voice-provider.interface';
export * from './adapters/mock-voice.adapter';
export * from './adapters/livekit-voice.adapter';

@Injectable()
export class VoiceService extends VoiceServiceCore {
  constructor(
    prisma: PrismaService,
    roomManager?: RoomManagerService,
    realtimeServer?: RealtimeServerService,
  ) {
    const livekit = new LiveKitVoiceAdapter();
    const adapter = livekit.isAvailable() ? livekit : new MockVoiceAdapter();
    const voiceRoomManager = new VoiceRoomManager();

    super(prisma, adapter, voiceRoomManager, roomManager, realtimeServer);
  }
}
