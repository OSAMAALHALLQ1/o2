import {
  type PartyMemberDto,
  type PartyRealtimeEventPayload,
  type PartyRealtimeEventType,
  type PartyRealtimeSnapshot,
  PartySystemEvents,
} from '@o2/types';
import type { RealtimeServer } from '../transport/realtime-server.interface';

/**
 * Pure PartyRealtimeManager
 * Tracks active party subscriptions and broadcasts authoritative state updates
 * to authorized members across all their active connections.
 * Pure TypeScript (no decorators) for strip-types runner compatibility.
 */
export class PartyRealtimeManager {
  private readonly partySubscriptions = new Map<string, Set<string>>(); // partyId -> Set<userId>
  private readonly userSubscriptions = new Map<string, Set<string>>();  // userId -> Set<partyId>
  private readonly realtimeServer: RealtimeServer;

  constructor(realtimeServer: RealtimeServer) {
    this.realtimeServer = realtimeServer;
  }

  getSubscriberCount(partyId: string): number {
    return this.partySubscriptions.get(partyId)?.size ?? 0;
  }

  isSubscribed(userId: string, partyId: string): boolean {
    return this.partySubscriptions.get(partyId)?.has(userId) ?? false;
  }

  subscribe(userId: string, partyId: string): void {
    if (!userId || !partyId) return;

    let partySet = this.partySubscriptions.get(partyId);
    if (!partySet) {
      partySet = new Set<string>();
      this.partySubscriptions.set(partyId, partySet);
    }
    partySet.add(userId);

    let userSet = this.userSubscriptions.get(userId);
    if (!userSet) {
      userSet = new Set<string>();
      this.userSubscriptions.set(userId, userSet);
    }
    userSet.add(partyId);
  }

  unsubscribe(userId: string, partyId: string): void {
    const partySet = this.partySubscriptions.get(partyId);
    if (partySet) {
      partySet.delete(userId);
      if (partySet.size === 0) {
        this.partySubscriptions.delete(partyId);
      }
    }

    const userSet = this.userSubscriptions.get(userId);
    if (userSet) {
      userSet.delete(partyId);
      if (userSet.size === 0) {
        this.userSubscriptions.delete(userId);
      }
    }
  }

  clearUserSubscriptions(userId: string): void {
    const userSet = this.userSubscriptions.get(userId);
    if (!userSet) return;

    for (const partyId of userSet) {
      const partySet = this.partySubscriptions.get(partyId);
      if (partySet) {
        partySet.delete(userId);
        if (partySet.size === 0) {
          this.partySubscriptions.delete(partyId);
        }
      }
    }
    this.userSubscriptions.delete(userId);
  }

  publishPartyEvent(
    partyId: string,
    type: PartyRealtimeEventType,
    snapshot: PartyRealtimeSnapshot,
    details?: Record<string, unknown>,
    explicitRecipients?: string[],
  ): void {
    const payload: PartyRealtimeEventPayload = {
      partyId,
      version: snapshot.version,
      type,
      snapshot,
      details,
      occurredAt: Date.now(),
    };

    // Determine authorized recipient user IDs
    const memberUserIds = new Set(snapshot.members.map((m: PartyMemberDto) => m.userId));

    const targetRecipients = new Set<string>();
    if (explicitRecipients && explicitRecipients.length > 0) {
      for (const uid of explicitRecipients) {
        targetRecipients.add(uid);
      }
    } else {
      for (const uid of memberUserIds) {
        targetRecipients.add(uid);
      }
    }

    // Deliver to all active connections of each authorized recipient user
    for (const userId of targetRecipients) {
      this.realtimeServer.sendToUser(userId, PartySystemEvents.EVENT, payload);
    }
  }
}
