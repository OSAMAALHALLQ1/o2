# O2 Universe — Phase 6B: Server-Authoritative Realtime Room Engine

## 1. Architectural Overview & Boundaries

Phase 6B introduces a generic, server-authoritative realtime room engine to the O2 Universe platform. It is designed as core infrastructure for orchestrating multiplayer sessions, acting as the foundation upon which future game engines (Atrash, Mafia, Tarneeb, Hide & Seek, Imposter) will execute.

### 1.1 Fundamental Distinction: Party vs Room

It is critical to distinguish between **Party** (Phase 5) and **Room** (Phase 6B):

| Concept | Purpose | Scope | Persistence | Lifecycle |
| :--- | :--- | :--- | :--- | :--- |
| **Party** | Social group / friend squad | Out-of-game social coordination | Persistent in PostgreSQL (`parties` table) | Long-lived; persists across game sessions |
| **Room** | Realtime gameplay session / match container | In-game active multiplayer coordination | Ephemeral in-memory only | Short-lived; ends and closes when match finishes |

A Party may create or queue into a Room together, but a Party is **never** conflated with a Room. The room engine knows nothing of friend graphs, party invite codes, or party leadership rules.

---

## 2. Room Lifecycle State Machine

The room lifecycle is modeled as an explicit, deterministic finite state machine with strict transition guards:

### 2.1 Room States
- `CREATING`: Room entity instantiated; allocating initial config and host slot.
- `WAITING`: Room open for participants; awaiting required player count.
- `READY`: Room has reached minimum/target capacity; ready to start match.
- `RUNNING`: Active game match in progress; actions processed by game engine.
- `ENDING`: Game finished; calculating final scores, awards, and win conditions.
- `ENDED`: Match terminated; displaying victory summary / scoreboard.
- `CLOSED`: Terminal state; room destroyed; executor and timers disposed.

### 2.2 Valid State Transitions
```
CREATING ────────► WAITING ◄───────┐
                      │            │ (player leaves)
                      ▼            │
                    READY ─────────┘
                      │
                      ▼
                   RUNNING
                      │
                      ▼
                   ENDING
                      │
                      ▼
                    ENDED
                      │
                      ▼
                    CLOSED (Terminal)
```
- Allowed: `CREATING -> WAITING`, `WAITING -> READY`, `READY -> RUNNING`, `READY -> WAITING`, `RUNNING -> ENDING`, `ENDING -> ENDED`, `ENDED -> CLOSED`.
- Any non-terminal state may transition directly to `CLOSED` (e.g. host shutdown, idle timeout, or unrecoverable error).
- Any illegal jump throws an `InvalidRoomStateTransitionError`.

---

## 3. Room Data & Ephemeral Memory Structure

Each in-memory `Room` instance maintains:
- `roomId`: Unique string identifier (`room_<uuid12>`).
- `gameMode`: Validated server-recognized enum (`ATRASH`, `MAFIA_CLASSIC`, `TARNEEB`, `HIDE_AND_SEEK`, `O2_IMPOSTER`).
- `state`: Authoritative `RoomState`.
- `capacity`: Maximum allowed participant count derived from centralized server configuration.
- `creatorUserId`: The authenticated host who created the room.
- `version`: Monotonic revision counter (starts at 1, increments on every state mutation).
- `participants`: Map of `userId -> RoomParticipant`.
- `createdAt` / `updatedAt`: Authoritative server timestamps.
- `executor`: Dedicated `RoomSequentialExecutor`.
- `idempotency`: Dedicated `RoomActionIdempotency` LRU tracker.
- `timers`: Dedicated `RoomTimerRegistry`.
- `engineAdapter`: Pluggable `IRoomEngineAdapter` instance.

> [!NOTE]
> All room data is strictly ephemeral and held in server memory. In accordance with Phase 6B requirements, no persistent database tables and no Redis clustering are utilized.

---

## 4. Per-Room Sequential Execution

To eliminate race conditions without resorting to heavy distributed locks (such as Redlock) or PostgreSQL transaction row locks for high-frequency gameplay actions:
- Every room owns an isolated `RoomSequentialExecutor`.
- All state-mutating operations (`joinRoom`, `leaveRoom`, `dispatchAction`, timer triggers) are enqueued into a FIFO promise chain.
- Handlers never execute concurrently for the same room. Action A, Action B, Action C execute in deterministic arrival order.
- If an individual action throws an exception, the sequential executor safely catches it, rejects only that caller's promise, and continues processing subsequent queue items without stalling.

---

## 5. Room Action Contract & Authoritative Identity

Clients submit action intent using the `RoomAction` contract:
```typescript
interface RoomAction<TPayload = unknown> {
  actionId: string;        // Client-supplied or correlation UUID
  roomId: string;          // Target room
  userId: string;          // Authoritative user ID derived from connection
  type: string;            // Action type (e.g. "SET_READY", "VOTE", "PLAY_CARD")
  payload: TPayload;       // Action parameters
  receivedAt: number;      // Server arrival timestamp
}
```

**Security Invariant**: The `userId` is strictly resolved by the backend from the authenticated connection context (`conn.userId`). Client-supplied user identities are never trusted.

---

## 6. Action Idempotency & Replay Defense

Network retries or multi-device duplicates can cause actions to arrive more than once:
- The room engine maintains a bounded in-memory idempotency cache (`RoomActionIdempotency`) per room.
- Key: `actionId`.
- Maximum entries: `1,000` actions per room.
- TTL: `5 minutes` (`300,000 ms`).
- When an action with a previously processed `actionId` arrives, the room engine skips re-execution, does not bump the room revision `version`, and returns the cached result.
- Distinct rooms can utilize identical `actionId` values independently without collisions.

---

## 7. Participant Management & Multi-Device Delivery

- **User-Centric Membership**: Room membership is tracked by `userId`, not socket connection ID.
- **Multi-Device Support**: A user may have multiple simultaneous active transport connections (e.g. mobile phone and tablet). Both connections receive broadcasts and room events addressed to that user.
- **Join Verification**:
  - Room exists and is not `CLOSED` (otherwise `ROOM_NOT_FOUND` / `ROOM_CLOSED`).
  - User is not already a member (otherwise `ROOM_ALREADY_JOINED`).
  - Participant count has not reached `capacity` (otherwise `ROOM_FULL`).
  - User is authenticated (otherwise `NOT_AUTHORIZED`).

---

## 8. Disconnect Behavior & Grace Semantics

Phase 6B establishes explicit rules regarding connection loss:
- **Connection Loss ≠ Room Leave**: When a socket disconnects, the transport-level connection mapping is removed, but the user **remains an active member of the room**.
- The user's slot, state, and identity are preserved.
- When the user reconnects, their new connection immediately maps to their existing room membership.
- Full reconnection grace periods, reconnect tokens, and forfeit timers will be formalized in Phase 6D.

---

## 9. State Projection & Hidden State Protection

To guarantee cheat-prevention in competitive games (e.g. Mafia secret roles, Tarneeb hidden cards, Imposter assignments):
- The server **never** broadcasts internal `MasterRoomState` directly.
- The projection boundary strictly bifurcates state into two safe models:
  1. `PublicRoomProjection`: Contains safe, non-sensitive room data broadcast to all participants (`roomId`, `gameMode`, `state`, `capacity`, `participantCount`, participant list with public summaries, `version`, timestamps).
  2. `PlayerRoomProjection`: Delivered solely to the individual authorized player, appending player-specific revealed state through `engineAdapter.getPlayerProjection(state, userId)`.

---

## 10. Server-Owned Room Timers

Rooms require authoritative timers (e.g. turn timers, phase countdowns, ready checks):
- Managed via `RoomTimerRegistry`.
- Timers use the server clock (`setTimeout`).
- Callbacks are dispatched through the room's `RoomSequentialExecutor`, ensuring timer-driven state changes are perfectly serialized with player actions.
- Timers are explicitly cancelable by `timerId`.
- When a room transitions to `CLOSED`, all active timers are automatically cleared and disposed.

---

## 11. Monotonic Room Version Semantics

- Every authoritative room mutation increments the room's monotonic integer `version` by `1` (`_version += 1`).
- **Connection Sequence vs Room Version**:
  - `connection.sequence`: Scoped to a single client socket transport connection; resets upon reconnect.
  - `room.version`: Scoped to authoritative room state evolution; increments on joins, leaves, actions, and state transitions; persists across individual client reconnects.

---

## 12. Centralized Game Capacities & Limits

### 12.1 Capacities
Room game modes and capacities are statically governed by the server:
- `ATRASH`: **5** players
- `MAFIA_CLASSIC`: **14** players
- `TARNEEB`: **4** players
- `HIDE_AND_SEEK`: **8** players
- `O2_IMPOSTER`: **8** players

Arbitrary or client-invented game modes (e.g. `"give_me_admin"`) are rejected with `INVALID_GAME_MODE`.

### 12.2 Memory Safety & TTL Cleanups
- **Idle Room Timeout**: Waiting rooms with no activity for `30 minutes` are automatically closed and swept (`ROOM_LIMITS.IDLE_ROOM_TIMEOUT_MS = 1,800,000 ms`).
- **Closed Room Retention**: Closed rooms are swept from server memory (`ROOM_LIMITS.CLOSED_ROOM_RETENTION_MS = 60,000 ms`).
- **Action Dedup Retention**: 1,000 entries max per room; 5-minute TTL.
- **Action Rate Limit**: Bounded to 30 actions per 10 seconds per user (`ROOM_LIMITS.MAX_ACTIONS_PER_WINDOW = 30`).

---

## 13. Future Integration Boundaries

- **Game Engine Integration (`IGameEngine`)**: Plugs into `IRoomEngineAdapter` in Phase 6C+ without modifying room infrastructure.
- **Redis Multi-Node Boundary (Phase 6D+)**: When scaling beyond a single instance, `RoomManager` will delegate room lookup and pub/sub broadcasting to Redis adapters while retaining local per-room actor queues.
