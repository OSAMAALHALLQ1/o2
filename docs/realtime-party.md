# O2 Universe — Phase 6C: Realtime Party Synchronization

## 1. Architectural Overview & Invariants

Phase 6C implements realtime party synchronization across the O2 Universe platform. When a Party's state changes on one client, all authorized party members connected via realtime receive the updated state instantly without manual polling.

### 1.1 Source of Truth vs Transport
- **HTTP / PostgreSQL (Authoritative Source of Truth)**: All social state transitions, membership updates, leader reassignments, and ready toggles are durably committed in PostgreSQL through authenticated REST endpoints.
- **Realtime WebSockets (Synchronization Transport)**: WebSockets serve exclusively as an event-driven synchronization notification mechanism. Realtime never acts as an independent business store.

### 1.2 The Commit-Then-Publish Invariant
Every party mutation strictly adheres to the execution pipeline:
```
Client HTTP Request
      │
      ▼
PostgreSQL Transaction Begins
      │
      ▼
Validation & Row Locks Applied
      │
      ▼
Party.version Incremented & Changes Committed Durably
      │
      ▼
Realtime Event Published to Authorized Members
```
- Realtime notifications are **never** dispatched from within an uncommitted database transaction.
- If a transaction rolls back or encounters an error, **no** realtime event is ever emitted.

---

## 2. Party vs Room Separation

| Dimension | Party (Phase 5 & 6C) | Room (Phase 6B) |
| :--- | :--- | :--- |
| **Purpose** | Social group / squad coordination | Realtime match / game container |
| **Storage** | Durable PostgreSQL (`parties`, `party_members`) | Ephemeral in-memory only |
| **Lifecycle** | Persists across matches and play sessions | Created when match starts; closed when match ends |
| **Authority** | Mutated via REST HTTP transactions | Mutated via sequential WebSocket actions |
| **Bridge** | Party may queue or create a Room together | Room knows nothing about friend graphs or party codes |

---

## 3. Typed Party Realtime Events

All realtime party events share centralized contracts in `@o2/types`:

### 3.1 Event Types (`PartyRealtimeEventType`)
- `PARTY_MEMBER_JOINED`: Triggered when a new user joins the party (via code or invite acceptance).
- `PARTY_MEMBER_LEFT`: Triggered when an existing member voluntarily leaves.
- `PARTY_MEMBER_KICKED`: Triggered when the party leader removes a member.
- `PARTY_LEADER_CHANGED`: Triggered when party leadership is transferred.
- `PARTY_READY_CHANGED`: Triggered when a member toggles their ready state (`READY` / `NOT_READY`).
- `PARTY_GAME_CHANGED`: Triggered when the leader alters the desired game mode.
- `PARTY_INVITE_UPDATED`: Triggered when an invite is created, accepted, or rejected.
- `PARTY_STATE_UPDATED`: Triggered on code-access toggles or general snapshot sync.

### 3.2 Minimized Safe Snapshot (`PartyRealtimeSnapshot`)
To prevent private data leaks, snapshots include only public, non-sensitive fields:
```typescript
interface PartyRealtimeSnapshot {
  partyId: string;
  version: number;
  roomCode: string;
  leaderId: string;
  desiredGameMode: PartyGameMode | null;
  capacity: number;
  allowJoinByCode: boolean;
  members: PartyMemberDto[];
  updatedAt: number;
}
```
*Never exposed*: Emails, password hashes, IP addresses, session tokens, or moderation notes.

---

## 4. Version Ordering & Authoritative Reconciliation

Each party record possesses a monotonic integer `version` stored durably in PostgreSQL. When clients receive realtime events:

```
                  ┌───────────────────────────────┐
                  │ Incoming Event (version = V)  │
                  └──────────────┬────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
      V < Current            V === Current          V === Current + 1       V > Current + 1
   (Stale Event)          (Duplicate Event)        (Sequential Event)       (Version Gap)
         │                       │                       │                       │
         ▼                       ▼                       ▼                       ▼
    Ignore Safely           Ignore Safely          Apply Snapshot       Trigger Authoritative
                                                   Immediately          HTTP Reconciliation
```

1. **Stale (`V < Current`)**: Discarded silently.
2. **Duplicate (`V === Current`)**: Discarded silently.
3. **Sequential (`V === Current + 1`)**: Applied directly into local state without HTTP round-trip.
4. **Gap (`V > Current + 1`)**: Indicates one or more intermediate network packets were lost. The client immediately triggers an authoritative `GET /social/party/me` request to reconcile.

Clients **never** attempt to reconstruct missing intermediate states locally.

---

## 5. Security & Server-Side Authorization

- **Server-Side Targeting**: Private party events are delivered strictly to active authorized members. Private party data is never broadcast globally and filtered on the client.
- **Subscription Verification**: When a client issues `party:subscribe`, the server checks whether the user is an active member of that party.
- **Eviction Enforcement**: When a user leaves or is kicked, their subscription is immediately severed so they stop receiving subsequent party messages.
- **Multi-Device Support**: Deliveries target user IDs using `sendToUser(userId, ...)`. If a user is active on both mobile phone and tablet, both devices receive the update simultaneously.

---

## 6. HTTP Fallback & Transport Degradation

Realtime synchronization is designed strictly as an enhancement:
- If the WebSocket connection drops, errors, or fails to connect, all HTTP mutations (`createParty`, `inviteFriend`, `setReady`, `selectGame`, `leaveParty`, etc.) continue to function without degradation.
- When the socket reconnects or during periodic application foregrounding, the client triggers `refreshSocial()` to synchronize authoritative state.
