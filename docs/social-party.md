# Social graph and party foundation (Phase 5)

Phase 5 stores all friendship and party state in PostgreSQL. The mobile client never creates authoritative offline state; after every mutation it refetches the relevant server resources. Realtime transport, presence, matchmaking, voice, and gameplay are intentionally outside this phase.

## Safe public identity and discovery

Authenticated search uses a trimmed, lower-case `normalizedUsername` prefix. Queries shorter than three characters return no results, responses are capped at 10, the requester and mutually blocked accounts are excluded, and suspended/banned accounts are excluded. Responses contain only the public user ID, username, display name, selected companion presentation, coarse activity, and friendship state. Email, OAuth, session, IP, and moderation data are never returned.

Activity is deliberately coarse: `IN_PARTY`, `ACTIVE_RECENTLY`, or `INACTIVE`. It is not an online-presence claim.

## Friendship and request state

`Friendship` stores each symmetric relationship once as `(userLowId, userHighId)`. Application code canonicalizes the UUID pair and PostgreSQL enforces ordering, non-self relationships, and uniqueness.

`FriendRequest` retains a small audit history with `PENDING`, `ACCEPTED`, `REJECTED`, and `CANCELLED`; the `Friendship` row is the authority for an accepted relationship. Only one pending request may exist for a canonical pair. If opposite requests cross, whichever transaction obtains the ordered user locks second observes the first pending intent and atomically creates the friendship. Accept, reject, and cancel take the same ordered locks so a rejected or cancelled request cannot subsequently become a friendship. Repeating an already-completed operation yields the existing outcome or a deterministic conflict.

Blocking is directed and idempotent. In one transaction it removes the friendship, cancels pending requests and pairwise party invitations, and separates blocked users who share a party. If the blocker leads that party, the blocked member is removed; otherwise the blocker leaves. APIs use generic unavailable/not-found errors so they do not reveal who blocked whom. Privacy is intentionally limited to `friendRequestPolicy` (`EVERYONE` or `NOBODY`) and `allowPartyInvites`.

## Party lifecycle

A party begins private, with a cryptographically random, non-ambiguous six-character code. Direct code join works only after the leader explicitly enables `allowJoinByCode`; the code is discovery, not authentication. Only the leader can invite, and Phase 5 invitations are limited to friends. Invites expire after 10 minutes.

`PartyMember.userId` is globally unique, enforcing one active party per user. Party and user row locks serialize capacity and cross-party races. The maximum before a game is selected is 14. Selecting a game uses centralized capacities: ATRASH 5, MAFIA_CLASSIC 14, TARNEEB 4, HIDE_AND_SEEK 8, and O2_IMPOSTER 8. Selection is rejected when the current membership exceeds the chosen maximum and otherwise resets every member to `NOT_READY`.

Leaving removes the member. A departing leader transfers leadership atomically to the earliest joined remaining member, with user ID as a stable tie-breaker. The final member leaving deletes the party. Kicking oneself through the kick route is forbidden; kicking a missing member is idempotent. Every durable mutation increments the party `version` where state remains.

## Retry and concurrency strategy

Database state supplies deterministic idempotency rather than a separate action-key ledger:

- friend send: canonical pending uniqueness; same-direction retry returns the pending request;
- accept: canonical friendship uniqueness; retry returns the existing friendship;
- reject/cancel: terminal status is returned for the same operation;
- party create: globally unique membership plus ordered user lock returns the existing party;
- invite: one pending invite per party/invitee; retry returns it;
- join: user and party locks plus unique membership return the joined party or deterministic conflict;
- leave/kick: missing membership is an already-completed outcome;
- ready/game/code access: desired state is compared before mutation where applicable.

All multi-user locks use ascending user IDs, followed by the party lock. This stable order prevents the critical friend, block, invite, join, capacity, and membership races from relying on stale application checks alone. PostgreSQL uniqueness and check constraints remain the final invariant boundary.

## Authorization and abuse controls

The authenticated session supplies the acting user ID; mutation bodies never choose it. Only the request receiver may accept/reject, only the sender may cancel, each friend may remove the relationship, members may change only their own readiness, and only the leader may invite, kick, change the game, or enable code access. Existing auth moderation checks reject suspended/banned sessions.

Per-minute throttles are search 30, friend-request send 10, party invite 20, party-code join 20, and block/unblock 20. Lists are paginated and capped at 50 items per page.

## Phase 6 extension seams

Shared packages expose party domain-event shapes, a versioned `PartyMatchmakingSnapshot`, and typed analytics event names. They are contracts only: Phase 5 emits no WebSocket events, creates no queue, and starts no match.
