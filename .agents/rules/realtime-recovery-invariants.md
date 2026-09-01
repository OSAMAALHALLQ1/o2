# Realtime Disconnect, Reconnect & State Recovery Invariants

## 1. Reconnect & Backoff Invariants
- Transport reconnect must use bounded exponential backoff with jitter (initial 500ms, max 10s, ±20% jitter).
- Reconnect loops must be cancellable and stop aggressive retries upon permanent authentication failure.
- Every new socket connection must perform full authentication using an unexpired access JWT.

## 2. Recovery & Reconciliation Strategy
- Connection sequence (`connection.sequence`) is ephemeral and resets to 1 upon reconnect.
- State recovery must use authoritative snapshots (`PartyRealtimeSnapshot`, `PlayerRoomProjection`), never transport sequences.
- Local state is reconciled against the snapshot baseline:
  - Events with `v <= snapshot.version` are discarded as duplicate/stale.
  - Sequential events `v === local.version + 1` are applied.
  - Version gaps `v > local.version + 1` trigger immediate snapshot re-fetch.

## 3. Action Retry & Idempotency Rules
- Network timeouts must never blindly retry non-idempotent actions.
- Only actions explicitly flagged as retry-safe and possessing an `actionId` may be retransmitted.
- The server deduplicates via `(roomId, actionId)` LRU cache and returns prior results.

## 4. Room Grace & Server Restart Boundaries
- Sockets dropped during active matches enter a 60-second `DISCONNECTED_GRACE` window reserving their slot.
- If a server restarts and room memory is lost, clients receive deterministic `ROOM_UNAVAILABLE`. Never pretend the room exists.
