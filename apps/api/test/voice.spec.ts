import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  type VoiceAccessGrantDto,
  VoiceErrorCodes,
  VoiceSystemEvents,
} from '@o2/types';
import { RoomManager } from '../src/modules/realtime/rooms/room-manager.ts';
import { MockVoiceAdapter } from '../src/modules/voice/adapters/mock-voice.adapter.ts';
import { LiveKitVoiceAdapter } from '../src/modules/voice/adapters/livekit-voice.adapter.ts';
import { VoiceRoomManager } from '../src/modules/voice/voice-room.manager.ts';
import { VoiceServiceCore } from '../src/modules/voice/voice.manager.ts';

// ============================================================================
// MOCKS FOR PRISMA AND REALTIME SERVER
// ============================================================================

class MockPrismaService {
  users = new Map<string, { id: string; moderationStatus: string; profile: any }>();
  parties = new Map<string, { id: string; leaderUserId: string; status: string }>();
  partyMembers = new Map<string, { id: string; partyId: string; userId: string }>();

  user = {
    findUnique: async ({ where }: any) => {
      const u = this.users.get(where.id);
      return u ? { ...u } : null;
    },
  };

  partyMember = {
    findUnique: async ({ where }: any) => {
      const pm = this.partyMembers.get(where.userId);
      if (!pm) return null;
      const party = this.parties.get(pm.partyId);
      return {
        ...pm,
        party: party ? { ...party } : null,
      };
    },
  };
}

class MockRealtimeServer {
  readonly sentMessages: Array<{ userId: string; event: string; payload: any }> = [];

  sendToUser(userId: string, event: string, payload: any): void {
    this.sentMessages.push({ userId, event, payload });
  }

  registerConnection(): void {}
  removeConnection(): void {}
  getConnection(): any { return undefined; }
  getConnectionsByUserId(): any[] { return []; }
  getAllConnections(): any[] { return []; }
  broadcast(): void {}
  broadcastToRoom(): void {}
  on(): () => void { return () => {}; }
}

// ============================================================================
// TEST SUITE: PHASE 6F VOICE SERVICE FOUNDATION
// ============================================================================

describe('Phase 6F: Voice Service Foundation', () => {
  let prisma: MockPrismaService;
  let realtimeServer: MockRealtimeServer;
  let roomManager: RoomManager;
  let voiceRoomManager: VoiceRoomManager;
  let mockAdapter: MockVoiceAdapter;
  let service: VoiceServiceCore;

  beforeEach(async () => {
    prisma = new MockPrismaService();
    realtimeServer = new MockRealtimeServer();
    roomManager = new RoomManager(realtimeServer as any);
    voiceRoomManager = new VoiceRoomManager();
    mockAdapter = new MockVoiceAdapter('test_voice_secret_key');
    service = new VoiceServiceCore(
      prisma as any,
      mockAdapter,
      voiceRoomManager,
      roomManager,
      realtimeServer as any,
    );

    // Seed test users
    for (let i = 1; i <= 10; i++) {
      const id = `user_${i}`;
      prisma.users.set(id, {
        id,
        moderationStatus: 'ACTIVE',
        profile: { username: `player_${i}`, displayName: `Player ${i}` },
      });
    }

    // Seed test party (user_1 leader, user_2 member)
    const partyId = 'party_123';
    prisma.parties.set(partyId, {
      id: partyId,
      leaderUserId: 'user_1',
      status: 'ACTIVE',
    });
    prisma.partyMembers.set('user_1', { id: 'pm_1', partyId, userId: 'user_1' });
    prisma.partyMembers.set('user_2', { id: 'pm_2', partyId, userId: 'user_2' });

    // Seed test game room in RoomManager (user_3 host, user_4 participant)
    await roomManager.createMatchRoom('TARNEEB', [
      { userId: 'user_3', username: 'player_3' },
      { userId: 'user_4', username: 'player_4' },
    ]);
  });

  describe('1. Context Authorization & Voice Grant Minting', () => {
    it('1. authorizes party voice join for an active party member', async () => {
      const grant = await service.requestVoiceGrant('user_1', {
        contextType: 'PARTY',
        contextId: 'party_123',
      });

      assert.ok(grant.token);
      assert.equal(grant.provider, 'mock');
      assert.equal(grant.contextType, 'PARTY');
      assert.equal(grant.contextId, 'party_123');
      assert.equal(grant.userId, 'user_1');
      assert.equal(grant.permissionState, 'VOICE_OPEN');
      assert.ok(grant.expiresAt > Date.now());
    });

    it('2. authorizes game-context voice join for a valid game room participant', async () => {
      // Find room id where user_3 is placed
      const room = roomManager.getUserRoom('user_3');
      assert.ok(room);

      const grant = await service.requestVoiceGrant('user_3', {
        contextType: 'GAME_ROOM',
        contextId: room.roomId,
      });

      assert.ok(grant.token);
      assert.equal(grant.contextType, 'GAME_ROOM');
      assert.equal(grant.contextId, room.roomId);
      assert.equal(grant.userId, 'user_3');
    });

    it('3. rejects unauthorized user attempting to join another party voice room', async () => {
      // user_5 is not a member of party_123
      await assert.rejects(
        () => service.requestVoiceGrant('user_5', {
          contextType: 'PARTY',
          contextId: 'party_123',
        }),
        (err: any) => err.response?.code === VoiceErrorCodes.VOICE_UNAUTHORIZED,
      );
    });

    it('4. rejects arbitrary room injection where user is not a participant', async () => {
      await assert.rejects(
        () => service.requestVoiceGrant('user_1', {
          contextType: 'GAME_ROOM',
          contextId: 'room_fake_arbitrary_id',
        }),
        (err: any) => err.response?.code === VoiceErrorCodes.VOICE_UNAUTHORIZED,
      );
    });

    it('5. rejects banned or suspended users from minting voice access grant', async () => {
      prisma.users.get('user_2')!.moderationStatus = 'BANNED';

      await assert.rejects(
        () => service.requestVoiceGrant('user_2', {
          contextType: 'PARTY',
          contextId: 'party_123',
        }),
        (err: any) => err.response?.code === VoiceErrorCodes.VOICE_UNAUTHORIZED,
      );
    });
  });

  describe('2. Ephemeral Room State, Participants & Lifecycle', () => {
    it('6. tracks joined participants in provider-independent ephemeral room', async () => {
      await service.requestVoiceGrant('user_1', { contextType: 'PARTY', contextId: 'party_123' });
      await service.requestVoiceGrant('user_2', { contextType: 'PARTY', contextId: 'party_123' });

      const summary = await service.getRoomSummary('user_1', 'PARTY', 'party_123');
      assert.equal(summary.participantCount, 2);
      assert.equal(summary.participants.length, 2);
      assert.deepEqual(
        summary.participants.map((p) => p.userId).sort(),
        ['user_1', 'user_2'].sort(),
      );
    });

    it('7. handles participant leave and disposes empty voice room', async () => {
      await service.requestVoiceGrant('user_1', { contextType: 'PARTY', contextId: 'party_123' });
      assert.equal(voiceRoomManager.getActiveRoomCount(), 1);

      await service.leaveVoiceRoom('user_1', 'PARTY', 'party_123');
      assert.equal(voiceRoomManager.getActiveRoomCount(), 0);
    });

    it('8. protects against exceeding maximum voice room capacity', async () => {
      const partyId = 'party_large';
      prisma.parties.set(partyId, { id: partyId, leaderUserId: 'user_1', status: 'ACTIVE' });

      // Create room and fill to max (16)
      const room = voiceRoomManager.getOrCreateRoom('PARTY', partyId);
      for (let i = 1; i <= 16; i++) {
        room.addParticipant({ userId: `p_${i}`, username: `player_${i}` });
      }

      assert.throws(
        () => room.addParticipant({ userId: 'p_overflow', username: 'overflow' }),
        (err: any) => err.response?.code === VoiceErrorCodes.VOICE_ROOM_FULL,
      );
    });
  });

  describe('3. Participant Controls: Self Mute, Local Mute, and Server Mute', () => {
    beforeEach(async () => {
      await service.requestVoiceGrant('user_1', { contextType: 'PARTY', contextId: 'party_123' });
      await service.requestVoiceGrant('user_2', { contextType: 'PARTY', contextId: 'party_123' });
    });

    it('9. supports self mute and toggles speaking permission state', async () => {
      const p = await service.setSelfMute('user_2', 'PARTY', 'party_123', true);
      assert.equal(p.isSelfMuted, true);
      assert.equal(p.isSpeaking, false);

      const unmuted = await service.setSelfMute('user_2', 'PARTY', 'party_123', false);
      assert.equal(unmuted.isSelfMuted, false);
    });

    it('10. supports server/moderation mute by authorized party leader', async () => {
      // Leader user_1 mutes member user_2
      const p = await service.setServerMute('user_1', 'PARTY', 'party_123', {
        targetUserId: 'user_2',
        muted: true,
        reason: 'Loud background noise',
      });

      assert.equal(p.isServerMuted, true);
      assert.equal(p.isSpeaking, false);
    });

    it('11. rejects server mute attempts by non-leader members', async () => {
      // Member user_2 attempts to server-mute leader user_1
      await assert.rejects(
        () => service.setServerMute('user_2', 'PARTY', 'party_123', {
          targetUserId: 'user_1',
          muted: true,
        }),
        (err: any) => err.response?.code === VoiceErrorCodes.VOICE_PERMISSION_DENIED,
      );
    });
  });

  describe('4. Room Permission States: OPEN, RESTRICTED, MUTED', () => {
    beforeEach(async () => {
      await service.requestVoiceGrant('user_1', { contextType: 'PARTY', contextId: 'party_123' });
      await service.requestVoiceGrant('user_2', { contextType: 'PARTY', contextId: 'party_123' });
    });

    it('12. allows party leader to update room permissions', async () => {
      const summary = await service.updatePermissions(
        'user_1',
        'PARTY',
        'party_123',
        'VOICE_MUTED',
      );

      assert.equal(summary.permissionState, 'VOICE_MUTED');
      // In VOICE_MUTED, all participants' isSpeaking must be false
      for (const p of summary.participants) {
        assert.equal(p.isSpeaking, false);
      }
    });

    it('13. rejects room permission updates by non-leader members', async () => {
      await assert.rejects(
        () => service.updatePermissions('user_2', 'PARTY', 'party_123', 'VOICE_RESTRICTED'),
        (err: any) => err.response?.code === VoiceErrorCodes.VOICE_PERMISSION_DENIED,
      );
    });
  });

  describe('5. Speaking Indicators, Quality & Realtime Events', () => {
    it('14. propagates speaking state change and dispatches realtime event', async () => {
      await service.requestVoiceGrant('user_1', { contextType: 'PARTY', contextId: 'party_123' });
      await service.setSpeakingState('user_1', 'PARTY', 'party_123', true);

      const speakingEvents = realtimeServer.sentMessages.filter(
        (m) => m.event === VoiceSystemEvents.SPEAKING_CHANGED,
      );
      assert.ok(speakingEvents.length > 0);
      assert.equal(speakingEvents[speakingEvents.length - 1].payload.isSpeaking, true);
    });

    it('15. updates connection quality metrics and dispatches quality event', async () => {
      await service.requestVoiceGrant('user_1', { contextType: 'PARTY', contextId: 'party_123' });
      await service.setConnectionQuality('user_1', 'PARTY', 'party_123', 'GOOD');

      const qualityEvents = realtimeServer.sentMessages.filter(
        (m) => m.event === VoiceSystemEvents.QUALITY_CHANGED,
      );
      assert.ok(qualityEvents.length > 0);
      assert.equal(qualityEvents[qualityEvents.length - 1].payload.quality, 'GOOD');
    });
  });

  describe('6. Safety Hooks (Report & Block)', () => {
    it('16. registers a participant safety report cleanly', async () => {
      await service.requestVoiceGrant('user_1', { contextType: 'PARTY', contextId: 'party_123' });
      await service.requestVoiceGrant('user_2', { contextType: 'PARTY', contextId: 'party_123' });

      const result = await service.reportParticipant('user_1', {
        contextType: 'PARTY',
        contextId: 'party_123',
        reportedUserId: 'user_2',
        reason: 'Harassment or abusive language',
        details: 'Offensive language used in party voice chat',
      });

      assert.equal(result.reported, true);
      assert.ok(result.reportId.startsWith('vrep_'));

      const reports = service.getReports();
      assert.equal(reports.length, 1);
      assert.equal(reports[0].reportedUserId, 'user_2');
      assert.equal(reports[0].reporterId, 'user_1');
    });

    it('17. provides safety block integration hook', async () => {
      const blockRes = await service.blockParticipant('user_1', 'user_2');
      assert.equal(blockRes.blocked, true);
    });
  });

  describe('7. Provider Gating & Boundary Protections', () => {
    it('18. LiveKit adapter reports unavailable when unconfigured without crashing', () => {
      const unconfiguredLiveKit = new LiveKitVoiceAdapter(undefined, undefined, undefined);
      assert.equal(unconfiguredLiveKit.isAvailable(), false);
    });

    it('19. rejects token generation when unconfigured provider is invoked', async () => {
      const unconfiguredLiveKit = new LiveKitVoiceAdapter(undefined, undefined, undefined);
      const gatedService = new VoiceServiceCore(
        prisma as any,
        unconfiguredLiveKit,
        voiceRoomManager,
        roomManager,
      );

      await assert.rejects(
        () => gatedService.requestVoiceGrant('user_1', { contextType: 'PARTY', contextId: 'party_123' }),
        (err: any) => err.response?.code === VoiceErrorCodes.VOICE_PROVIDER_UNAVAILABLE,
      );
    });

    it('20. mock adapter generates valid cryptographic HMAC token structure', async () => {
      const grant = await mockAdapter.generateAccessGrant({
        voiceRoomId: 'vroom_party_party_123',
        contextType: 'PARTY',
        contextId: 'party_123',
        userId: 'user_1',
        username: 'player_1',
        permissionState: 'VOICE_OPEN',
      });

      assert.ok(grant.token.startsWith('mock_voice_token_'));
      assert.ok(grant.token.includes('.'));
    });
  });
});
