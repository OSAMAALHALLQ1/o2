# O2 Universe — Phase 6F: Voice Service Foundation

## 1. Overview & Architecture

The **Voice Service Foundation** in O2 Universe provides a provider-agnostic, low-latency voice communications layer for multiplayer parties and match rooms. Designed to decouple domain business logic from WebRTC transport providers, the architecture cleanly isolates room coordination, authorization, permission state machines, and moderation from downstream providers such as LiveKit.

```mermaid
graph TD
    subgraph Client Layer [Mobile Application]
        UI[Screens / Game Shell] --> useVoice[useVoice Hook]
        useVoice --> VoiceClient[VoiceClient Abstraction]
        VoiceClient -->|setLocalMute| LocalMutes[Client-Only Audio Suppression]
        VoiceClient -->|HTTP POST /voice/token| VoiceAPI[Mobile Voice API]
    end

    subgraph API Layer [NestJS Authoritative Server]
        VoiceAPI --> VoiceController[VoiceController]
        VoiceController --> VoiceService[VoiceService / VoiceServiceCore]
        VoiceService -->|Context Verification| PostgreSQL[(PostgreSQL: Party Membership)]
        VoiceService -->|Context Verification| RoomManager[Phase 6B RoomManager]
        VoiceService --> VoiceRoomManager[Ephemeral VoiceRoom Registry]
        VoiceService --> IVoiceProviderAdapter[IVoiceProviderAdapter Boundary]
        IVoiceProviderAdapter --> MockAdapter[MockVoiceAdapter]
        IVoiceProviderAdapter -.-> LiveKitAdapter[LiveKitVoiceAdapter (Config Gated)]
        VoiceService --> RealtimeServer[Phase 6A Realtime Server]
    end

    RealtimeServer -.->|voice:events| VoiceClient
```

---

## 2. Core Abstractions

| Interface / Class | Responsibility |
|---|---|
| `IVoiceProviderAdapter` | Uniform interface for minting signed access tokens and executing provider-level mutations (mute, room teardown). |
| `MockVoiceAdapter` | Active development and testing adapter generating deterministic HMAC-SHA256 signed access tokens without external cloud dependencies. |
| `LiveKitVoiceAdapter` | Production WebRTC adapter structure. Configuration-gated behind `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`. Reports unavailable when unconfigured. |
| `VoiceRoomManager` | Ephemeral, in-memory registry of active voice rooms and participant placements. |
| `VoiceRoom` | Authoritative room entity maintaining permission states, participants, speaking states, and quality ratings. |
| `VoiceServiceCore` | Authoritative business logic managing context authorization, room access grants, permission toggles, and safety hooks. |
| `VoiceClient` | Lightweight mobile client abstraction managing connection lifecycle, remote participant events, speaking indicators, and local audio suppression. |

---

## 3. Context Authorization & Access Token Minting

Voice rooms are **never joined directly through arbitrary room identifiers**. To prevent room spoofing and unauthorized eavesdropping, access tokens are exclusively minted by the backend through context-aware authorization.

### Supported Contexts:
1. **`PARTY`**:
   - The user requests a voice token for `contextType = 'PARTY'` and `contextId = partyId`.
   - The backend validates via PostgreSQL that `partyMember` exists for the user and matches the active party.
   - If the user is suspended or not an active party member, the request is rejected with `VOICE_UNAUTHORIZED` (HTTP 403).
2. **`GAME_ROOM`**:
   - The user requests a voice token for `contextType = 'GAME_ROOM'` and `contextId = roomId`.
   - The backend validates via the Phase 6B `RoomManager` that the user is currently placed in `roomId`.
   - If the user is not in the room or the room is closed, the request is rejected with `VOICE_UNAUTHORIZED` (HTTP 403).

### Token Structure:
- Tokens minted via `MockVoiceAdapter` use cryptographic HMAC-SHA256 signatures with a bounded time-to-live (`TOKEN_TTL_MS = 3600000` / 1 hour).
- Expired or malformed tokens are rejected by the transport boundary.

---

## 4. Voice Permission State Machine

Rooms operate under three distinct permission states:

| Permission State | Rules & Behavior |
|---|---|
| `VOICE_OPEN` | Any unmuted participant can broadcast audio freely. |
| `VOICE_RESTRICTED` | Only participants with an explicit speaking grant can broadcast audio. |
| `VOICE_MUTED` | All participants are globally silenced server-side. Speaking is disallowed. |

Permission state changes are restricted to the **Party Leader** (for parties) or **Room Host** (for game rooms). Any mutation attempt by non-leaders is rejected with `VOICE_PERMISSION_DENIED` (HTTP 403).

---

## 5. Participant Audio Controls

The architecture strictly distinguishes between three independent layers of audio suppression:

```
+-------------------------------------------------------------------------+
|                        PARTICIPANT AUDIO CONTROLS                       |
+--------------------+----------------------------------------------------+
| Control Type       | Enforcement & Scope                                |
+--------------------+----------------------------------------------------+
| Self Mute          | User mutes their own microphone. Propagated to room|
|                    | as isSelfMuted: true.                              |
+--------------------+----------------------------------------------------+
| Local Mute         | Listener suppresses another participant's audio on |
| (Client-Side Only) | their own device. NEVER modifies server state,     |
|                    | permissions, or moderation status of target user.  |
+--------------------+----------------------------------------------------+
| Server Mute        | Authoritative moderation action by leader/host.    |
| (Moderation)       | Target participant is silenced authoritatively.    |
+--------------------+----------------------------------------------------+
```

---

## 6. Speaking Indicators & Quality Normalization

1. **Speaking Indicators**:
   - Realtime audio active/inactive events are dispatched via `voice:speaking_changed`.
   - If a user is self-muted or server-muted, the authoritative engine clamps their speaking state to `false`.
2. **Connection Quality Normalization**:
   - Raw WebRTC network statistics (packet loss, jitter) are normalized into standard ratings:
     - `EXCELLENT`: Packet loss $\le 2\%$, Jitter $\le 50\text{ms}$.
     - `GOOD`: Packet loss $\le 8\%$, Jitter $\le 150\text{ms}$.
     - `POOR`: Packet loss $> 8\%$ or Jitter $> 150\text{ms}$.
     - `UNKNOWN`: Uninitialized or invalid input metrics.

---

## 7. Safety Hooks (Reporting & Blocking)

- **Report Participant**:
  - `POST /voice/report` logs an abuse report with `reportId`, `reporterId`, `reportedUserId`, `reason`, and timestamp.
- **Block Participant**:
  - Safety hook integrating with the user graph to ensure local audio suppression and prevent unwanted contact.

---

## 8. Mobile Integration & Lifecycle

The mobile application accesses voice through the `useVoice()` hook provided by `VoiceProvider`:
- **Lightweight by default**: Voice transport remains completely dormant until `joinVoice(contextType, contextId)` is invoked.
- **Automatic teardown**: Upon leaving or screen unmount, `leaveVoice()` tears down audio connections and resets local listeners.
- **No Global SDK Lock-in**: The UI code interacts solely with `VoiceClient` methods (`toggleSelfMute()`, `setLocalMute()`, `leaveVoice()`).

---

## 9. Strict Scope Boundaries

To preserve architectural integrity and avoid premature complexity:
1. **Zero Database Tables**: Voice state is entirely ephemeral in memory. No persistent database schema migrations were created.
2. **No Gameplay Rules**: Voice rules do not contain game-specific logic (e.g., Mafia night silencing, Tarneeb bidding phases). Game-specific voice rules belong in future Phase 7 game modules.
3. **No Redis Clustering**: Single-process in-memory room management for Phase 6F. Redis distributed state is planned for future horizontal scaling phases.
4. **No Production Provider Lock-in**: Development operates cleanly on `MockVoiceAdapter`. Real LiveKit connectivity remains configuration-gated behind environment credentials.
