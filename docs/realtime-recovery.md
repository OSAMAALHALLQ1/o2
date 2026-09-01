# O2 Universe — Phase 6D: Realtime Disconnect, Reconnect & State Recovery

## 1. Overview & Core Philosophy

Phase 6D establishes resilient network disconnect detection, automatic reconnect with bounded exponential backoff, and authoritative state recovery across transport, social parties, and gameplay rooms.

### Fundamental Principles
1. **Ephemeral Connection Sequence vs Authoritative State Versioning**:
   - The transport sequence (`connection.sequence`) is strictly scoped to an individual socket connection and resets to 1 on reconnect.
   - Recovery is driven by durable `party.version`, in-memory `room.version`, and authoritative snapshots (`PartyRealtimeSnapshot`, `PlayerRoomProjection`).
2. **Snapshot-First Baseline Replacement**:
   - Reconnecting clients do not attempt to replay lost intermediate events over an unstable connection.
   - Upon reconnection, clients fetch authoritative snapshots to establish a fresh baseline.
3. **No Unbounded Offline Queues**:
   - Stale gameplay actions are not stockpiled offline.
   - Only explicitly retry-safe, idempotent actions with unique `actionId` identifiers may be retransmitted.
4. **Server Restart Boundary**:
   - Room memory is ephemeral in Phase 6. If the server restarts while a match was active, clients receive a deterministic `ROOM_UNAVAILABLE` error and fall back cleanly to Party or main menu without hanging.

---

## 2. Reconnect Lifecycle State Machine

```
              ┌─────────────────┐
              │  DISCONNECTED   │◄────────────────────────┐
              └────────┬────────┘                         │
                       │ (scheduleReconnect)              │
                       ▼                                  │
              ┌─────────────────┐                         │
              │   CONNECTING    │                         │
              └────────┬────────┘                         │
                       │ (socket connected)               │
                       ▼                                  │
              ┌─────────────────┐                         │ (transport
              │ AUTHENTICATING  │                         │  drop)
              └────────┬────────┘                         │
                       │ (handshake ready)                │
                       ▼                                  │
              ┌─────────────────┐                         │
              │    CONNECTED    │                         │
              └────────┬────────┘                         │
                       │ (execute resyncHandler)          │
                       ▼                                  │
              ┌─────────────────┐                         │
              │    RESYNCING    │                         │
              └────────┬────────┘                         │
                       │ (authoritative sync complete)    │
                       ▼                                  │
              ┌─────────────────┐                         │
              │      READY      │─────────────────────────┘
              └─────────────────┘
```

- **`DISCONNECTED`**: Transport connection lost. Triggers backoff scheduler.
- **`CONNECTING`**: Socket attempt initiated using delay calculated from exponential backoff.
- **`AUTHENTICATING`**: Socket connected; verifying access JWT handshake.
- **`CONNECTED`**: Handshake confirmed; connection registered.
- **`RESYNCING`**: Refreshing authoritative state (`Party` and `Room`) and restoring subscriptions.
- **`READY`**: Authoritative recovery complete; client resumes event processing.
- **`FAILED`**: Permanent authentication failure (e.g. refresh token expired or revoked); stops automatic retry loops.

---

## 3. Bounded Exponential Backoff & Jitter

Reconnection timing is governed by centralized constants in `@o2/types`:

```typescript
export const RECOVERY_CONSTANTS = {
  INITIAL_RETRY_DELAY_MS: 500,    // Initial attempt delay: 500ms
  MAX_RETRY_DELAY_MS: 10_000,     // Maximum retry delay cap: 10 seconds
  JITTER_FACTOR: 0.20,            // ±20% randomized jitter
  ROOM_DISCONNECT_GRACE_MS: 60_000, // 60-second room disconnect grace
} as const;
```

### Delay Calculation Formula
$$\text{Base Delay} = \min(500 \times 2^{\text{attempt}}, 10000)$$
$$\text{Jitter} = \text{Base Delay} \times 0.20 \times \text{Uniform}(-1, 1)$$
$$\text{Final Delay} = \max(0, \text{round}(\text{Base Delay} + \text{Jitter}))$$

This prevents the "thundering herd" problem during server reconnections while guaranteeing that clients reconnect within 10 seconds.

---

## 4. Re-Authentication & Token Management

1. Every reconnect creates a completely new socket connection with a new `connectionId`.
2. Mobile clients provide a `tokenProvider: () => Promise<string | null>`.
3. If an access token expires during disconnect:
   - Mobile refreshes the token using existing Phase 2 HTTP authentication (`AuthContext` / `AuthTokenStorage`).
   - The fresh token is passed to `realtimeClient.connect(freshToken)`.
4. If token refresh fails (session revoked or user banned):
   - The client transitions to `FAILED` and halts reconnection loops.
   - The user is routed to the login screen.
   - Refresh tokens are **never** transmitted across WebSockets.

---

## 5. Room Disconnect Grace Window & Recovery

### 5.1 The 60-Second Grace Window
When a player's socket drops during an active match:
- The player is **not** immediately kicked or replaced.
- The player's status in `RoomParticipant` transitions from `'CONNECTED'` to `'DISCONNECTED_GRACE'`.
- The room increments its version and broadcasts `STATE_SYNC` to notify peers.
- A 60-second cancelable timer is scheduled: `grace_${userId}`.

### 5.2 Recovery Procedure (`room:recover`)
When the player reconnects within 60 seconds:
1. Client emits `room:recover`.
2. Server validates that the caller is in the room's participant registry.
3. The server cancels `grace_${userId}`, restores status to `'CONNECTED'`, increments room version, and broadcasts `STATE_SYNC`.
4. The server returns the caller's specific `PlayerRoomProjection` containing private hand/role data alongside the public room state. Master engine state is never leaked.

### 5.3 Grace Expiration
If the 60-second grace window expires without reconnection:
- For `WAITING` or `READY` rooms: The disconnected participant is cleanly removed.
- For running matches: The room marks the player as forfeited according to future game rules without crashing.

---

## 6. Party Recovery & Authoritative Sync

Social Party state is durable in PostgreSQL:
1. Upon reconnecting, the mobile client executes its `resyncHandler`, invoking `GET /social/party/me`.
2. If the user was kicked or removed during disconnect:
   - Server returns `null` or 404.
   - Client clears local party state and unsubscribes.
3. If the user remains a party member:
   - Client receives authoritative `PartyRealtimeSnapshot`.
   - Client replaces local party state with the snapshot baseline.
   - Client re-subscribes via `party:subscribe`.

---

## 7. Version Ordering & Deduplication

Once the authoritative snapshot establishes the baseline version $V$:

| Event Version ($E_v$) | Condition | Action |
| :--- | :--- | :--- |
| $E_v < V$ | Stale | Ignore safely |
| $E_v == V$ | Duplicate | Ignore safely |
| $E_v == V + 1$ | Sequential | Apply snapshot immediately |
| $E_v > V + 1$ | Version Gap | Trigger authoritative HTTP reconciliation |

---

## 8. Action Retries & Idempotency Boundary

1. State-changing actions carry a unique `actionId`.
2. The Room engine maintains an LRU idempotency cache `(actionId -> response)` with a 5-minute TTL.
3. If a network blip occurs after the server processed an action but before the response reached the client:
   - Client retries the request with the identical `actionId`.
   - Server detects `idempotency.has(actionId)` and returns `{ ...cachedResponse, cached: true }` without executing the action twice.
4. **Retry-Safe Guard**: Automatic retransmission is permitted **only** when `retrySafe: true` is explicitly configured on the request. Non-idempotent actions are never blindly repeated.
