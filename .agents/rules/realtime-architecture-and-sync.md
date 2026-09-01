# Realtime Architecture & Synchronization Invariants

## 1. Transport vs Business Boundaries
- Realtime WebSockets act as an event synchronization transport, NOT the authoritative business data store.
- Durable business entities (Parties, Friends, Profiles, Economy) mutate strictly via authenticated HTTP endpoints within PostgreSQL transactions.
- Ephemeral gameplay containers (Rooms) reside strictly in server memory without premature database persistence or Redis clustering until Phase 6F.

## 2. Authoritative Mutation Ordering
- Every mutation must strictly follow:
  `HTTP Request -> PostgreSQL Transaction -> Durable Commit -> Version Increment -> Realtime Event Broadcast`.
- Never broadcast a realtime event before the database transaction commits.
- A failed or rolled-back transaction must never emit a success event.

## 3. Version Handling & Reconciliation
- All realtime state synchronization events must carry `entityId` and monotonic `version`.
- Client version handling:
  - `incoming > current + 1`: Detect version gap -> trigger HTTP reconciliation (`GET`).
  - `incoming === current + 1`: Apply update sequentially.
  - `incoming === current`: Duplicate event -> discard safely.
  - `incoming < current`: Stale event -> discard safely.
- Never invent missing state locally.

## 4. Multi-Device & Authorization Boundaries
- Delivery must target `userId` via `sendToUser(userId, ...)`. Never assume 1 user = 1 socket.
- Subscriptions and event delivery must be verified server-side against current membership and block relationships.
- Projections must strictly separate public safe state from player secrets.
