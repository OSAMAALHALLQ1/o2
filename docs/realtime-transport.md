# O2 Universe — Phase 6A: Authenticated Realtime Transport Foundation

## 1. Overview & Architectural Boundaries

Phase 6A establishes the foundational, transport-agnostic realtime networking layer for the O2 Universe platform. It provides authenticated bidirectional communication between client applications (such as the React Native mobile client) and the NestJS backend API.

### 1.1 Strict Decoupling and Transport Boundary

A primary architectural requirement of Phase 6A is that **business and domain code must NEVER depend directly on transport-specific libraries** (such as Socket.IO or WebSocket APIs).

The transport boundary consists of four core contracts:
- `RealtimeConnection`: Abstract representation of an authenticated bidirectional client socket connection with identity, state, sequence tracking, and message emission methods.
- `RealtimeServer`: Transport-agnostic coordinator managing active connection registries, message routing, rate limiting, heartbeat timers, and event dispatching.
- `RealtimeClient`: Client-side abstraction (in `apps/mobile`) handling connection lifecycle, authentication headers, request correlation, heartbeat pinging, and typed event dispatching.
- `RealtimeGateway` & `SocketIoRealtimeConnection`: The Socket.IO adapter layer located exclusively in `apps/api/src/modules/realtime/adapters/`. No other module interacts with Socket.IO directly.

```
┌────────────────────────────────────────────────────────┐
│               Domain / Application Logic               │
└──────────────────────────▲─────────────────────────────┘
                           │ Transport-Agnostic Interface
┌──────────────────────────┴─────────────────────────────┐
│                 RealtimeServer / Engine                │
│    - Connection Registry (User -> Connections Map)     │
│    - Sliding Window Rate Limiting                      │
│    - Envelope & RequestId Validation                   │
│    - Heartbeat Timeout Monitor                         │
└──────────────────────────▲─────────────────────────────┘
                           │
┌──────────────────────────┴─────────────────────────────┐
│               Socket.IO Adapter Layer                  │
│    - RealtimeGateway (WebSocketGateway)                │
│    - SocketIoRealtimeConnection                        │
└──────────────────────────▲─────────────────────────────┘
                           │ Network (WebSocket / Polling fallback)
┌──────────────────────────┴─────────────────────────────┐
│               Mobile Realtime Client                   │
│    - apps/mobile/src/realtime/client.ts                │
└────────────────────────────────────────────────────────┘
```

---

## 2. Authentication & Socket Identity

### 2.1 Handshake Authentication Flow

Realtime authentication completely reuses the approved Phase 2 JWT and session verification subsystem:

1. **Token Transport**: The client passes the Phase 2 Access JWT in the connection handshake (`auth: { token: 'Bearer ...' }` or HTTP `Authorization` header).
2. **Cryptographic Verification**: The backend validates the JWT using the configured `JWT_ACCESS_SECRET`. Malformed, invalid, or expired tokens are rejected with `UNAUTHORIZED`.
3. **Session Verification**: The `sessionId` embedded within the token claims is validated against PostgreSQL `user_sessions`:
   - If the session does not exist: rejected with `SESSION_REVOKED`.
   - If `revokedAt` is set: rejected with `SESSION_REVOKED`.
   - If `expiresAt` is in the past: rejected with `SESSION_EXPIRED`.
4. **Moderation Status Check**: The associated user account is inspected:
   - If `moderationStatus` is `BANNED` or `SUSPENDED`: rejected with `ACCOUNT_RESTRICTED`.
5. **Identity Resolution**: Upon successful validation, the server generates a cryptographically random `connectionId` (UUID v4) and constructs the authoritative `AuthenticatedSocketIdentity`:
   - `connectionId`: Unique ephemeral identifier for this socket session.
   - `userId`: Authoritative user ID from the database session (client-supplied user IDs are NEVER trusted).
   - `sessionId`: The underlying Phase 2 persistent session ID.
   - `role`: The user role (`PLAYER`, `ADMIN`, etc.).

---

## 3. Connection Lifecycle State Machine

Connection lifecycle is governed by an explicit finite state machine with validated transitions.

### 3.1 States
- `CONNECTING`: Socket connection initiated; transport handshake in progress.
- `AUTHENTICATING`: Physical connection established; handshake token undergoing cryptographic and session verification.
- `CONNECTED`: Handshake verified; socket identity registered in `RealtimeServer`; ready for bidirectional messages.
- `DISCONNECTING`: Graceful termination initiated by client or server.
- `DISCONNECTED`: Terminal state; socket closed; ephemeral connection registry and rate-limit buckets cleaned up.

### 3.2 Valid Transitions
```
CONNECTING ────────► AUTHENTICATING ────────► CONNECTED
     │                       │                    │
     │                       ▼                    │
     └───────────────► DISCONNECTED ◄─────────────┤
                             ▲                    ▼
                             └────────────── DISCONNECTING
```

Any illegal transition (e.g. attempting to jump from `CONNECTING` directly to `CONNECTED`, or transitioning out of `DISCONNECTED`) throws an `InvalidStateTransitionError` and is rejected.

---

## 4. Protocol Specification & Envelopes

All communication over the realtime transport conforms to protocol version `1.0` and uses strictly typed envelopes.

### 4.1 Client Event Envelope
Sent from client to server:
```json
{
  "protocolVersion": "1.0",
  "event": "game:action",
  "requestId": "req_1725184800000_abc123",
  "payload": { ... }
}
```
- `protocolVersion`: Must equal `"1.0"`. Unsupported versions are rejected with `INVALID_PROTOCOL_VERSION`.
- `event`: Event identifier string (e.g. `system:ping`, `chat:message`).
- `requestId`: Client-generated correlation ID matching `^[a-zA-Z0-9_.:-]+$` (max 64 characters). Invalid request IDs are rejected with `INVALID_REQUEST_ID`.
- `payload`: Arbitrary JSON-serializable payload within max size limit (16 KB).

### 4.2 Server Event Envelope
Sent from server to client:
```json
{
  "protocolVersion": "1.0",
  "event": "chat:message",
  "requestId": "req_1725184800000_abc123",
  "sequence": 42,
  "serverTimestamp": 1725184800123,
  "payload": { ... }
}
```
- `sequence`: Monotonically increasing 1-based integer counter scoped to the individual connection.
- `requestId`: Correlated client request ID if the server event is a direct reply to a client request.
- `serverTimestamp`: Authoritative server epoch timestamp in milliseconds.

### 4.3 Error Envelope
Sent upon validation failure, authorization rejection, or handler errors:
```json
{
  "protocolVersion": "1.0",
  "requestId": "req_1725184800000_abc123",
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "تم تجاوز معدل إرسال الرسائل المسموح به"
}
```

Standard Error Codes:
- `UNAUTHORIZED`
- `SESSION_REVOKED`
- `SESSION_EXPIRED`
- `ACCOUNT_RESTRICTED`
- `INVALID_PROTOCOL_VERSION`
- `MALFORMED_ENVELOPE`
- `PAYLOAD_TOO_LARGE`
- `RATE_LIMIT_EXCEEDED`
- `HEARTBEAT_TIMEOUT`
- `UNKNOWN_EVENT`
- `INVALID_REQUEST_ID`
- `INTERNAL_ERROR`

---

## 5. Sequence Semantics & Request Correlation

### 5.1 Monotonic Sequence Counter
- Each `RealtimeConnection` maintains an independent integer counter initialized to `0`.
- Every outbound `ServerEventEnvelope` increments `sequence` by `1` (`_sequence += 1`).
- The sequence is scoped to the ephemeral connection lifetime. Because Phase 6A does not implement persistent message replay, reconnecting establishes a new connection with a fresh sequence starting at 1.

### 5.2 Request Correlation
- When the mobile client invokes `client.send(event, payload, timeoutMs)`, a unique `requestId` is generated.
- The client registers an awaiting `Promise` keyed by `requestId`.
- When the server replies with a correlated `ServerEventEnvelope` (or `ErrorEnvelope`) containing the matching `requestId`, the client resolves (or rejects) the promise and cleans up its timeout timer.

---

## 6. Heartbeat, Disconnect Detection & Rate Limiting

### 6.1 Heartbeat Mechanism
- **Interval**: 15,000 ms (15s).
- **Timeout**: 45,000 ms (45s).
- The client periodically emits `{ protocolVersion: '1.0', event: 'system:ping', requestId: '...', payload: { clientTime: Date.now() } }`.
- The server updates `lastHeartbeatAt = Date.now()` and immediately responds with `system:pong` containing `{ clientTime, serverTime }`.
- A background server monitor runs every 15 seconds. Any connection where `now - lastHeartbeatAt > 45,000` is forcefully disconnected with `HEARTBEAT_TIMEOUT`.

### 6.2 Rate Limiting & Protection
- **Max Payload Size**: 16 KB (16,384 bytes). Envelopes exceeding this are rejected with `PAYLOAD_TOO_LARGE`.
- **Sliding Window Rate Limit**: Maximum 50 events per 10-second sliding window per connection. Excess events are throttled with `RATE_LIMIT_EXCEEDED`.
- **Malformed Frame Threshold**: If a connection sends 5 malformed envelopes, the connection is immediately terminated to protect backend resources.

---

## 7. Multi-Device Concurrency & Persistence Scope

### 7.1 Multi-Device Concurrency
- A single user account may be connected simultaneously from multiple devices (e.g. mobile phone and tablet).
- Each device maintains its own `connectionId`, independent sequence numbers, and independent heartbeat state.
- `RealtimeServer.getConnectionsByUserId(userId)` returns all active connections for that user.
- `RealtimeServer.sendToUser(userId, event, payload)` broadcasts to all devices registered to that user.

### 7.2 Ephemeral In-Memory State
- In accordance with Phase 6A specifications, connection state is strictly ephemeral and held in server memory.
- No new persistent database tables were created.
- No Redis persistence or clustering was added (reserved for future phases when multi-node scaling is required).

---

## 8. Mobile Client Implementation

The mobile client (`apps/mobile/src/realtime/client.ts`) implements the full lifecycle contract:
- `connect(token)`: Connects to the backend gateway, passes the authentication token, and transitions lifecycle states.
- `disconnect()`: Cleanly shuts down active socket, clears heartbeat timers, and rejects any pending request promises.
- `send(event, payload, timeoutMs)`: Correlated request/response promise with configurable timeout.
- `on(event, handler)` / `off(event, handler)`: Typed event subscription and unsubscription.
- Auto-reconnect handling with exponential backoff on unexpected transport disconnects.
- Automatic heartbeat loop pinging `system:ping` every 15 seconds while connected.

---

## 9. Non-Goals & Scope Exclusions for Phase 6A

The following features are explicitly **out of scope** for Phase 6A and will be implemented in subsequent phases:
- Game rooms and game room lifecycle (Phase 6B)
- Matchmaking queues and lobbies
- Voice networking and LiveKit integration
- Game-specific realtime state machines (Mafia, Atrash, Tarneeb, Hide & Seek, Imposter)
- Redis clustering and horizontal multi-node socket synchronization
- Party realtime synchronization
