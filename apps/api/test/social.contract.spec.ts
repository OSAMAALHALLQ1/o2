import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SOCIAL_LIMITS } from '../src/modules/social/social.constants.ts';

const read = (relativePath: string) => readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

describe('Phase 5 social API and persistence contracts', () => {
  it('centralizes the approved abuse limits and bounded discovery values', () => {
    assert.deepEqual(SOCIAL_LIMITS, {
      SEARCH_PER_MINUTE: 30,
      FRIEND_REQUESTS_PER_MINUTE: 10,
      PARTY_INVITES_PER_MINUTE: 20,
      PARTY_CODE_ATTEMPTS_PER_MINUTE: 20,
      BLOCK_ACTIONS_PER_MINUTE: 20,
      PAGE_SIZE_MAX: 50,
      SEARCH_RESULTS_MAX: 10,
      SEARCH_MIN_LENGTH: 3,
    });
  });

  it('binds throttles to search, friend request, invite, code, and block routes', () => {
    const social = read('../src/modules/social/social.controller.ts');
    const party = read('../src/modules/social/party.controller.ts');
    for (const limit of ['SEARCH_PER_MINUTE', 'FRIEND_REQUESTS_PER_MINUTE', 'BLOCK_ACTIONS_PER_MINUTE']) {
      assert.match(social, new RegExp(`@Throttle\\(\\{ default: \\{ limit: SOCIAL_LIMITS\\.${limit}`));
    }
    for (const limit of ['PARTY_INVITES_PER_MINUTE', 'PARTY_CODE_ATTEMPTS_PER_MINUTE']) {
      assert.match(party, new RegExp(`@Throttle\\(\\{ default: \\{ limit: SOCIAL_LIMITS\\.${limit}`));
    }
  });

  it('derives acting identity from the authenticated request on every controller mutation', () => {
    const controllers = `${read('../src/modules/social/social.controller.ts')}\n${read('../src/modules/social/party.controller.ts')}`;
    const mutationLines = controllers.split(/\r?\n/).filter((line) => /return this\.(social|parties)\./.test(line));
    assert.ok(mutationLines.length >= 15);
    for (const line of mutationLines) assert.match(line, /req\.user\.userId/);
    assert.doesNotMatch(read('../src/modules/social/dto/social.dto.ts'), /actingUserId|leaderUserId/);
  });

  it('keeps critical graph and party invariants in the PostgreSQL migration', () => {
    const migration = read('../prisma/migrations/20260828120000_phase5_social_friends_party/migration.sql');
    for (const invariant of [
      'chk_friendship_canonical_pair',
      'friendships_userLowId_userHighId_key',
      'friend_requests_one_pending_pair_key',
      'chk_user_block_not_self',
      'party_members_userId_key',
      'parties_leader_must_be_member_fkey',
      'DEFERRABLE INITIALLY DEFERRED',
      'chk_party_code_format',
    ]) assert.match(migration, new RegExp(invariant));
  });

  it('does not introduce Phase 6 transports or voice dependencies', () => {
    const apiPackage = read('../package.json');
    assert.doesNotMatch(apiPackage, /socket\.io|websocket|livekit/i);
    assert.doesNotMatch(`${read('../src/modules/social/social.service.ts')}\n${read('../src/modules/social/party.service.ts')}`, /WebSocket|Socket\.IO|LiveKit|matchmaking queue/i);
  });
});
