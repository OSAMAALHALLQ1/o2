import {
  type MatchmakingTicketStatus,
  type RoomGameMode,
  ROOM_CAPACITIES,
  ROOM_GAME_MODES,
} from '@o2/types';

// ============================================================================
// 1. MATCHMAKING STATE MACHINE
// ============================================================================

export class InvalidMatchmakingStateTransitionError extends Error {
  readonly from: MatchmakingTicketStatus;
  readonly to: MatchmakingTicketStatus;

  constructor(from: MatchmakingTicketStatus, to: MatchmakingTicketStatus) {
    super(`Invalid matchmaking state transition from ${from} to ${to}`);
    this.name = 'InvalidMatchmakingStateTransitionError';
    this.from = from;
    this.to = to;
  }
}

const VALID_MATCHMAKING_TRANSITIONS: Record<
  MatchmakingTicketStatus,
  readonly MatchmakingTicketStatus[]
> = {
  QUEUED: ['MATCHING', 'CANCELLED', 'EXPIRED', 'FAILED'],
  MATCHING: ['MATCHED', 'QUEUED', 'FAILED'],
  MATCHED: [], // terminal
  CANCELLED: [], // terminal
  EXPIRED: [], // terminal
  FAILED: [], // terminal
};

export function isValidMatchmakingTransition(
  from: MatchmakingTicketStatus,
  to: MatchmakingTicketStatus,
): boolean {
  if (from === to) return true;
  return VALID_MATCHMAKING_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertValidMatchmakingTransition(
  from: MatchmakingTicketStatus,
  to: MatchmakingTicketStatus,
): void {
  if (!isValidMatchmakingTransition(from, to)) {
    throw new InvalidMatchmakingStateTransitionError(from, to);
  }
}

// ============================================================================
// 2. CAPACITY & PARTY SIZE RULES
// ============================================================================

export function isValidGameMode(gameMode: string): gameMode is RoomGameMode {
  return Boolean(ROOM_GAME_MODES[gameMode as RoomGameMode]);
}

export function getMatchmakingCapacity(gameMode: RoomGameMode): number {
  const capacity = ROOM_CAPACITIES[gameMode];
  if (!capacity) {
    throw new Error(`Unsupported game mode capacity: ${gameMode}`);
  }
  return capacity;
}

export function isPartySizeCompatible(
  gameMode: RoomGameMode,
  partySize: number,
): boolean {
  if (partySize <= 0) return false;
  const capacity = getMatchmakingCapacity(gameMode);
  return partySize <= capacity;
}

// ============================================================================
// 3. DETERMINISTIC FIFO TICKET GROUPING
// ============================================================================

export interface MatchmakingGroupCandidate {
  id: string;
  memberCount: number;
  createdAt: number | Date;
}

/**
 * Finds a combination of tickets that sum to exactly targetCapacity,
 * prioritizing earliest arriving tickets (strict FIFO order).
 *
 * Tickets must be pre-sorted by createdAt ASC.
 * A party ticket is NEVER split (its memberCount is atomic).
 */
export function findExactCapacityGroup<T extends MatchmakingGroupCandidate>(
  tickets: readonly T[],
  targetCapacity: number,
): T[] | null {
  if (!tickets.length || targetCapacity <= 0) return null;

  // We seek a subset whose sum === targetCapacity.
  // To preserve FIFO fairness, we evaluate subsets in lexicographical index order.
  const n = tickets.length;

  function search(index: number, remaining: number, chosen: T[]): T[] | null {
    if (remaining === 0) {
      return [...chosen];
    }
    if (index >= n || remaining < 0) {
      return null;
    }

    const current = tickets[index];

    // Branch 1: Include current ticket (if it fits)
    if (current.memberCount <= remaining) {
      chosen.push(current);
      const result = search(index + 1, remaining - current.memberCount, chosen);
      if (result) return result;
      chosen.pop(); // backtrack
    }

    // Branch 2: Exclude current ticket and try later tickets
    return search(index + 1, remaining, chosen);
  }

  return search(0, targetCapacity, []);
}
