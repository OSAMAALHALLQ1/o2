# O2 Universe — Master Product Specification
**Document Version:** 1.1.0 (Phase 0 Revised Baseline)  
**Status:** Approved Architectural Baseline  
**Target Platforms:** Android & iOS (Cross-Platform Mobile), Web (Admin Portal)

---

## 1. Product Vision & Brand Identity

### 1.1 The O2 Universe Concept
The O2 mobile application is not a traditional restaurant delivery app with gamified badges, nor is it a generic gaming arcade with restaurant logos. It is a **cohesive digital universe** built around the O2 brand, creating an emotional and entertaining daily destination for customers, friends, and families.

The application unites three foundational pillars into one seamless ecosystem:
1. **A Living Virtual Companion (Mascot):** A permanent, cute anthropomorphic companion chosen by the player upon registration that serves as their digital avatar, emotional anchor, and social representation.
2. **Social Multiplayer Parlor & Party Games:** Real-time social games (Mafia, Atrash Bel Zaffeh, Tarneeb, O2 Hide & Seek, and O2 Imposter) played with friends or via matchmaking.
3. **Real-World Restaurant Retention Engine:** A seamless bridge to O2 Restaurant branches (Gaza, Nuseirat, etc.) where real dining generates non-pay-to-win status, rare cosmetics, exclusive virtual foods, and digital reward drops.

### 1.2 Brand Identity & Visual Language
* **Primary Brand Colors:** Deep O2 Brand Red (`#D32F2F` / `#E53935`), Dark Navy/Charcoal background surfaces (`#0A0E17`, `#121824`), Warm Off-White (`#F8F9FA`), and Muted Gold accents (`#FFD54F`) for prestige elements.
* **Atmospheric Tone:** Warm, family-friendly, premium yet playful restaurant ambiance. Warm interior restaurant lighting and soft shadows.
* **Art Direction:** Stylized, soft-rounded 3D aesthetic (chibi/kawaii proportions) with high mobile-game polish. Avoid excessive cyberpunk/neon aesthetics or gritty realism.
* **Sound & Micro-interactions:** Tactile feedback, warm acoustic sound effects, playful UI transitions, and celebratory particle moments during reward reveals.

---

## 2. Core Product Loop

```
  ┌────────────────────────────────────────────────────────┐
  │                                                        │
  ▼                                                        │
┌──────────────┐     ┌──────────────┐     ┌──────────────┐ │
│     PLAY     │ ──► │     EARN     │ ──► │  CUSTOMIZE   │ │
│ Social Games │     │ Coins/Drops  │     │ Food & Style │ │
└──────────────┘     └──────────────┘     └──────────────┘ │
                                                 │         │
                                                 ▼         │
┌──────────────┐     ┌──────────────┐     ┌──────────────┐ │
│  PLAY AGAIN  │ ◄── │    UNLOCK    │ ◄── │  SOCIALIZE   │ │
│ With Status  │     │ Gems & Drops │     │ Party Lobby  │ │
└──────────────┘     └──────────────┘     └──────────────┘ │
                            ▲                    │         │
                            │                    ▼         │
                            │             ┌──────────────┐ │
                            └──────────── │    ORDER     │ │
                                          │ Real O2 Food │ │
                                          └──────────────┘ │
                                                 ▲         │
                                                 └─────────┘
```

1. **PLAY:** Player participates in online matchmaking or private party games with friends.
2. **EARN:** Gameplay, victories, daily missions, and achievements award **O2 Coins**, collection progress, and reward drops.
3. **CUSTOMIZE:** Player spends Coins to buy virtual food for their companion (boosting mood and filling hunger) and purchase standard outfits, hats, glasses, and emotes.
4. **SOCIALIZE:** Player forms parties in their **Personal O2 Lobby**. Companions of friends physically stand beside each other in the stylized O2 lounge, showing off outfits and custom emotes.
5. **ORDER:** While socializing or visiting the restaurant, the player places real-world food orders via O2 branches or scans verified receipt QR codes.
6. **UNLOCK:** Authoritative server verification of real orders awards rare **O2 Gems**, exclusive "Golden" virtual food variants, campaign reward drops, and potential physical restaurant perks.
7. **PLAY AGAIN:** Equipped with rare visual prestige, players jump back into matches, maintaining continuous daily active engagement.

---

## 3. The Companion System (First-Class Pillar)

### 3.1 Mascot Archetypes & Selection
* **Data-Driven Character Roster:** Starter and unlockable characters are defined data-driven in the database (supporting >20 mascots without schema migrations). Mascot archetypes include Panda, Koala, Bunny, Fox, Cat, Bear, Penguin, Raccoon, Tiny Dino, Monkey, stylized Bird, and mythical creatures.
* **Permanent Selection:** During onboarding, each player selects one permanent base companion.
* **Anatomy & Style:** Anthropomorphic mascots with oversized expressive heads, huge sparkling eyes, tiny hands and feet, soft rounded bodies, and rich emotional animations.
* **Identity Distinction:** The chosen companion is the player's core identity—**NOT just an interchangeable skin**. Outfits, headwear, eyewear, back items, and emotes are layered modularly through a character-compatibility asset system. Switching base characters is restricted to deliberate, rare product events.

### 3.2 Non-Punitive Care Mechanics
* **Four Core Needs:**
  1. **Hunger (0–100):** Restored by feeding virtual O2 food.
  2. **Cleanliness (0–100):** Restored through quick bathing interactions.
  3. **Energy (0–100):** Restored when the companion takes naps or sleeps.
  4. **Mood (0–100):** Boosted by petting, mini-interactions, high hunger/cleanliness, and social party presence.
* **Zero Death / No Punishment Policy:** The companion **never dies, runs away, or gets deleted**. If the player stops opening the app for weeks, needs decay to a floor value, altering idle animations and facial expressions (sleepy/pouty). Once the player returns and feeds/pets them, the companion immediately perks up.
* **Independence from Real Orders:** Real restaurant orders are **never required** to keep the companion healthy or happy.

---

## 4. Virtual O2 Food vs. Real O2 Food

| Feature | Virtual O2 Food | Real O2 Restaurant Food |
| :--- | :--- | :--- |
| **Purpose** | In-game companion care, mood restoration, collection. | Real physical human consumption. |
| **Purchased With** | **O2 Coins** (earned exclusively from gameplay/missions). | Real Money (Cash, Card, Online Payment). |
| **Menu Items** | Digital Shawarma, Pizza, Burger, Fries, Eastern Sweets, Gelato, Drinks, Golden Desserts. | Physical menu items from O2 branches (Gaza, Nuseirat, etc.). |
| **In-Game Effect** | Triggers eating animation, fills companion hunger meter, increases mood. | Awards **O2 Gems**, exclusive Reward Drops, and unlocks special virtual recipe variants. |

---

## 5. Comprehensive Economy & Currencies (No Global XP)

```
                     ┌────────────────────────┐
                     │   GAMEPLAY ACTIVITIES  │
                     │ Matches, Missions, Win │
                     └────────────────────────┘
                                 │
                                 ▼
                     ┌────────────────────────┐
                     │        O2 COINS        │
                     └────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       ┌───────────────────┐           ┌───────────────────┐
       │ VIRTUAL COMPANION │           │ STANDARD FASHION  │
       │ Food, Snacks, Care│           │ Hats, Outfits, UI │
       └───────────────────┘           └───────────────────┘

                     ┌────────────────────────┐
                     │ VERIFIED REAL O2 ORDER │
                     │  Receipt QR / Webhook  │
                     └────────────────────────┘
                                 │
                                 ▼
                     ┌────────────────────────┐
                     │        O2 GEMS         │
                     └────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       ┌───────────────────┐           ┌───────────────────┐
       │  PRESTIGE OUTFITS │           │ EXCLUSIVE REWARDS │
       │ Legendary/Mythic  │           │ Golden Foods & FX │
       └───────────────────┘           └───────────────────┘
```

1. **O2 Coins (Standard Currency):**
   * *Sources:* Playing matches, daily missions, achievements, companion interactions.
   * *Sinks:* Virtual companion food, standard clothes, basic emotes, profile frames.
2. **O2 Gems (Prestige Currency):**
   * *Sources:* Verified real restaurant orders, major physical restaurant campaigns, milestone achievements.
   * *Sinks:* High-tier cosmetics (Epic, Legendary, Mythic), exclusive lobby aura effects, rare deck designs.
   * *Rule:* Direct real-money IAP purchasing of Gems is disabled in initial versions to keep prestige linked to true brand engagement.
3. **Event Tokens (Season/Event Scoped Currency):**
   * *Sources:* Limited-time seasonal missions (e.g., Ramadan, Summer, Anniversary).
   * *Scope:* Each token balance is strictly isolated to its respective `seasonId` / `eventId`.
   * *Sinks:* Seasonal event shop items. Tokens expire at the conclusion of the season.
4. **Reward Drops (Reward Boxes / صناديق مكافآت):**
   * *Rules:* Never sold as paid gambling mechanics. Earned via gameplay milestones or real order bonuses.
   * *Contents:* Predominantly digital cosmetics and coins; rare physical restaurant vouchers strictly bounded by restaurant budget caps.

---

## 6. Social Presence & The Personal O2 Lobby

* **Personal O2 Lobby:** The home screen is an interactive restaurant lounge featuring the player's companion.
* **Party Gathering:** Up to 8 friends can join a party via room code or invite link. When joined, **their companions physically sit or stand together** in the player's lounge.
* **No Stranger Free-Roaming:** There is no massive open-world MMO lobby with unvetted strangers. Public interaction occurs strictly inside authenticated game rooms and matchmaking queues.
* **Social Actions:** Emote triggers, synchronised cheer animations, party chat, ready-up status, and leader game selection.

---

## 7. The Five Core Multiplayer Games

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             O2 MULTIPLAYER SUITE                            │
├──────────────────────┬──────────────────────┬───────────────────────────────┤
│ GAME                 │ PLAYERS (PUBLIC)     │ CORE GAMEPLAY GENRE           │
├──────────────────────┼──────────────────────┼───────────────────────────────┤
│ 1. Mafia             │ Exactly 8 Humans     │ Social Deduction + Voice/Text │
│ 2. Atrash Bel Zaffeh │ Exactly 5 Humans     │ Arabic Context Question Party │
│ 3. Tarneeb           │ Exactly 4 (2v2)      │ Authentic Trick-Taking Cards  │
│ 4. O2 Hide & Seek    │ 8 (4 Hiders / 4 Seek)│ Spatial Restaurant Stealth    │
│ 5. O2 Imposter       │ 6–10 (Configurable)  │ Mode A: Restaurant Sabotage   │
│                      │                      │ Mode B: Classic Imposter      │
└──────────────────────┴──────────────────────┴───────────────────────────────┘
```

### 7.1 Game 1: Mafia
* **Player Count:** Exactly 8 human players in public matchmaking (no AI bots in V1). Configurable in private/local rooms.
* **Mechanics:** Day/Night cycle, secret roles (Doctor, Detective, Mafia, Villager), phase-synchronized voice and text permissions (dead players cannot speak to the living), and server-authoritative secret voting.
* **Voice in MVP:** Phase 8 includes minimum voice integration (join/leave, speaking indicator, self mute, local mute, server-controlled publish permission, day/night permissions, spectator isolation, reconnect).
* **Local Moderator Mode:** Single device pass-and-play where the phone acts as the role dispenser, night-action coordinator, and narrator.

### 7.2 Game 2: Atrash Bel Zaffeh (أطرش بالزفة)
* **Player Count:** Exactly 5 players in public matchmaking.
* **Mechanics:** 4 players receive secret contextual details on a topic; 1 "Atrash" player receives nothing. Players take turns asking targeted questions to identify the outsider while the outsider attempts to deduce the context and blend in.
* **Packs:** O2 Food & Dining, Palestinian Culture & Cities, Cinema, Daily Life, Sports, and Gaming.

### 7.3 Game 3: Tarneeb (طرنيب)
* **Player Count:** Exactly 4 players (2 vs 2).
* **Mechanics:** Authentic Arabic rules. Bidding phase, trump selection, strict card-play legality enforcement, trick resolution, and hand scoring.
* **Integrity:** Per-player state projection; no client receives opponent cards until legally played.

### 7.4 Game 4: O2 Hide & Seek
* **Player Count:** 8 players (4 Hiders vs 4 Seekers).
* **Setting:** Stylized O2 Restaurant Map (Dining Hall, Kitchen, Counter, Dessert Station, Delivery Bay, Walk-in Fridge).
* **Mechanics:** Hiding phase (Seekers blinded). Hiders use decoys and camouflage; Seekers use spatial pulse scans. Hiders win if at least one survives until time expiration.

### 7.5 Game 5: O2 Imposter
* **Mode A: O2 Restaurant Sabotage (Original Signature Mode):**
  * Crew members complete authentic kitchen tickets (assembling orders, wrapping delivery boxes, checking receipt numbers).
  * Saboteurs introduce delayed flaws (swapping ingredients, misplacing order tickets). Sabotage is not instantly alerted; problems emerge downstream as "Order #42 Failed Inspection."
  * Crew manages a shared "Customer Satisfaction" meter and survives "Rush Hour" spikes.
* **Mode B: Classic Imposter:**
  * Straightforward social deduction with tasks, room wandering, sabotage alarms, meetings, and ejections with original O2 aesthetics.

---

## 8. Restaurant Integration Boundary

```
┌─────────────────────────┐             ┌────────────────────────────────────┐
│      MOBILE APP         │             │           O2 RESTAURANT            │
│  - Select Branch        │             │  - Physical Branch / Cashier       │
│  - Browse Menu Handoff  │ ──────────► │  - Web Ordering / POS System       │
│  - Launch Order Webview │             │  - Receipt Printer (Generates QR)  │
└─────────────────────────┘             └────────────────────────────────────┘
             │                                             │
             │ Order Placed with Player ID                 │
             ▼                                             ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                       O2 BACKEND API (NestJS)                              │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     RestaurantIntegration Adapter                    │  │
│  │  - Webhook: verifyOrder(orderId, customerToken, totalAmount)         │  │
│  │  - QR Scanner: redeemReceiptQR(signedPayload, userId)                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      Reward Attribution Engine                       │  │
│  │  - Validates business rules (min spend, branch validity, campaign)   │  │
│  │  - Writes to CurrencyLedger (Credit Gems / Drops)                    │  │
│  │  - Enforces physical budget limits                                   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

* **Decoupled Architecture:** The mobile app communicates strictly with the `RestaurantIntegration` interface on the NestJS backend.
* **No Unverified Claims:** The client app never claims "I made an order." Rewards are credited only when the backend receives an authentic cryptographically signed webhook from the restaurant ordering engine or a verified receipt QR redemption token.
* **Graceful Mocking in Phase 0/MVP:** The adapter interface provides deterministic mock implementations until official O2 POS technical credentials and webhooks are configured.

---

## 9. Restaurant Admin & Management Dashboard

* **Target Users:** Super Admin, Branch Manager (Gaza / Nuseirat), Marketing Officer, Community Moderator.
* **Core Modules:**
  1. **Analytics & Attribution:** Registered users, DAU/MAU, user retention, app-attributed food orders, Gem generation volume, repeat order frequency.
  2. **Campaign & LiveOps Manager:** Configure QR campaigns, reward drops, drop probabilities, seasonal event dates, and daily mission parameters.
  3. **Physical Reward Budget Caps:** Hard spending limits on physical vouchers with atomic reservation transactions to prevent financial overruns.
  4. **Moderation & Security:** User lookup, chat/voice report queue, account bans, chat mutes, and audit logs of all administrative actions.
