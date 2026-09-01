import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateVoiceRoomId,
  parseVoiceRoomId,
  isValidVoiceConnectionTransition,
  assertValidVoiceConnectionTransition,
  InvalidVoiceStateTransitionError,
  isValidVoicePermissionTransition,
  canParticipantSpeak,
  shouldPlayAudio,
  normalizeVoiceQuality,
} from '../src/voice/voice.rules.ts';

describe('Phase 6F: Voice Pure Domain Rules & State Machines', () => {
  describe('1. Voice Room Identifiers', () => {
    it('generates predictable, prefixed voice room IDs', () => {
      assert.equal(generateVoiceRoomId('PARTY', 'party_123'), 'vroom_party_party_123');
      assert.equal(generateVoiceRoomId('GAME_ROOM', 'room_abc'), 'vroom_game_room_room_abc');
    });

    it('rejects empty context IDs', () => {
      assert.throws(() => generateVoiceRoomId('PARTY', '  '));
    });

    it('parses valid voice room IDs back to context and ID', () => {
      const parsedParty = parseVoiceRoomId('vroom_party_party_123');
      assert.deepEqual(parsedParty, { contextType: 'PARTY', contextId: 'party_123' });

      const parsedGame = parseVoiceRoomId('vroom_game_room_room_xyz_456');
      assert.deepEqual(parsedGame, { contextType: 'GAME_ROOM', contextId: 'room_xyz_456' });
    });

    it('returns null for malformed or unknown voice room IDs', () => {
      assert.equal(parseVoiceRoomId('invalid_id'), null);
      assert.equal(parseVoiceRoomId('vroom_unknown_123'), null);
    });
  });

  describe('2. Connection State Machine Transitions', () => {
    it('allows valid lifecycle transitions', () => {
      assert.ok(isValidVoiceConnectionTransition('DISCONNECTED', 'CONNECTING'));
      assert.ok(isValidVoiceConnectionTransition('CONNECTING', 'CONNECTED'));
      assert.ok(isValidVoiceConnectionTransition('CONNECTED', 'RECONNECTING'));
      assert.ok(isValidVoiceConnectionTransition('RECONNECTING', 'CONNECTED'));
      assert.ok(isValidVoiceConnectionTransition('CONNECTED', 'DISCONNECTED'));
      assert.ok(isValidVoiceConnectionTransition('CONNECTING', 'FAILED'));
      assert.ok(isValidVoiceConnectionTransition('FAILED', 'CONNECTING'));
    });

    it('rejects invalid lifecycle transitions', () => {
      assert.equal(isValidVoiceConnectionTransition('DISCONNECTED', 'CONNECTED'), false);
      assert.equal(isValidVoiceConnectionTransition('DISCONNECTED', 'RECONNECTING'), false);
      assert.throws(
        () => assertValidVoiceConnectionTransition('DISCONNECTED', 'CONNECTED'),
        InvalidVoiceStateTransitionError,
      );
    });
  });

  describe('3. Permission State Transitions', () => {
    it('allows transitions between all valid permission states', () => {
      assert.ok(isValidVoicePermissionTransition('VOICE_OPEN', 'VOICE_RESTRICTED'));
      assert.ok(isValidVoicePermissionTransition('VOICE_RESTRICTED', 'VOICE_MUTED'));
      assert.ok(isValidVoicePermissionTransition('VOICE_MUTED', 'VOICE_OPEN'));
    });
  });

  describe('4. Participant Speaking Permissions', () => {
    it('prevents self-muted participant from speaking regardless of room permission', () => {
      assert.equal(
        canParticipantSpeak({
          permissionState: 'VOICE_OPEN',
          isSelfMuted: true,
          isServerMuted: false,
        }),
        false,
      );
    });

    it('prevents server-muted participant from speaking regardless of self-mute or room permission', () => {
      assert.equal(
        canParticipantSpeak({
          permissionState: 'VOICE_OPEN',
          isSelfMuted: false,
          isServerMuted: true,
        }),
        false,
      );
    });

    it('prevents anyone from speaking in VOICE_MUTED state', () => {
      assert.equal(
        canParticipantSpeak({
          permissionState: 'VOICE_MUTED',
          isSelfMuted: false,
          isServerMuted: false,
          hasRestrictedSpeakingGrant: true,
        }),
        false,
      );
    });

    it('requires explicit restricted grant to speak in VOICE_RESTRICTED state', () => {
      assert.equal(
        canParticipantSpeak({
          permissionState: 'VOICE_RESTRICTED',
          isSelfMuted: false,
          isServerMuted: false,
          hasRestrictedSpeakingGrant: false,
        }),
        false,
      );

      assert.equal(
        canParticipantSpeak({
          permissionState: 'VOICE_RESTRICTED',
          isSelfMuted: false,
          isServerMuted: false,
          hasRestrictedSpeakingGrant: true,
        }),
        true,
      );
    });

    it('allows unmuted participant to speak in VOICE_OPEN state', () => {
      assert.equal(
        canParticipantSpeak({
          permissionState: 'VOICE_OPEN',
          isSelfMuted: false,
          isServerMuted: false,
        }),
        true,
      );
    });
  });

  describe('5. Local Mute Audio Suppression (Client-Only)', () => {
    it('suppresses audio locally when user is locally muted', () => {
      const localMutes = new Set(['user_bad_mic']);

      // Target is speaking, but client locally muted them -> false
      assert.equal(
        shouldPlayAudio({
          targetUserId: 'user_bad_mic',
          locallyMutedUserIds: localMutes,
          isTargetSpeaking: true,
        }),
        false,
      );

      // Other unmuted user is speaking -> true
      assert.equal(
        shouldPlayAudio({
          targetUserId: 'user_friendly',
          locallyMutedUserIds: localMutes,
          isTargetSpeaking: true,
        }),
        true,
      );
    });
  });

  describe('6. Connection Quality Normalization', () => {
    it('normalizes low packet loss and jitter to EXCELLENT', () => {
      assert.equal(normalizeVoiceQuality(1.0, 30), 'EXCELLENT');
    });

    it('normalizes moderate loss and jitter to GOOD', () => {
      assert.equal(normalizeVoiceQuality(5.0, 100), 'GOOD');
    });

    it('normalizes high loss or jitter to POOR', () => {
      assert.equal(normalizeVoiceQuality(15.0, 250), 'POOR');
    });

    it('normalizes invalid inputs to UNKNOWN', () => {
      assert.equal(normalizeVoiceQuality(-5), 'UNKNOWN');
      assert.equal(normalizeVoiceQuality(NaN), 'UNKNOWN');
    });
  });
});
