import type { ConnectionState } from '@o2/types';

export class InvalidStateTransitionError extends Error {
  readonly from: ConnectionState;
  readonly to: ConnectionState;

  constructor(from: ConnectionState, to: ConnectionState) {
    super(`Invalid connection state transition from ${from} to ${to}`);
    this.name = 'InvalidStateTransitionError';
    this.from = from;
    this.to = to;
  }
}

const VALID_TRANSITIONS: Record<ConnectionState, readonly ConnectionState[]> = {
  CONNECTING: ['AUTHENTICATING', 'DISCONNECTING', 'DISCONNECTED'],
  AUTHENTICATING: ['CONNECTED', 'DISCONNECTING', 'DISCONNECTED'],
  CONNECTED: ['DISCONNECTING', 'DISCONNECTED'],
  DISCONNECTING: ['DISCONNECTED'],
  DISCONNECTED: [], // terminal state
};

export function isValidTransition(from: ConnectionState, to: ConnectionState): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS[from].includes(to);
}

export function assertValidTransition(from: ConnectionState, to: ConnectionState): void {
  if (!isValidTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to);
  }
}
