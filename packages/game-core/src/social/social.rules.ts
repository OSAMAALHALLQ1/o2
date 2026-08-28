import { randomBytes } from 'node:crypto';
import { PARTY_GAME_CAPACITIES, PARTY_MAX_CAPACITY, PartyGameMode } from '@o2/types';

export function canonicalUserPair(firstUserId: string, secondUserId: string) {
  if (firstUserId === secondUserId) throw new Error('SELF_RELATION_NOT_ALLOWED');
  return firstUserId < secondUserId
    ? { userLowId: firstUserId, userHighId: secondUserId }
    : { userLowId: secondUserId, userHighId: firstUserId };
}

export function getPartyCapacity(mode: PartyGameMode | null | undefined) {
  return mode ? PARTY_GAME_CAPACITIES[mode] : PARTY_MAX_CAPACITY;
}

export function generatePartyCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}
