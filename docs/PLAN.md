# Flip 7 Online — Project Plan

## What We're Building

An online real-time multiplayer version of the **Flip 7** card game. Players join a room via a shareable link, and play a press-your-luck card game where the first to 200 points wins.

---

## Game Rules Summary

- **Deck**: 94 cards — number cards 0–12 (N copies of number N), score modifier cards (+2 to +10, ×2), and action cards (Freeze, Flip Three, Second Chance)
- **Goal**: First player to reach **200 cumulative points** wins
- **Each round**:
  1. Dealer deals 1 card to each player (action cards resolved immediately)
  2. In turn order, each player chooses **Hit** (draw another card) or **Stay** (bank points)
  3. Draw a **duplicate number** → **BUST** (score 0 for that round)
  4. Collect **7 unique number cards** → **Flip 7** bonus (+15 pts, round ends immediately)
- **Scoring**: `sum(number cards)` [×2 if you have a ×2 modifier] + flat bonus modifiers + 15 if Flip 7
- **Action cards**:
  - **Freeze**: Target player is forced to Stay
  - **Flip Three**: Target must draw 3 cards in sequence
  - **Second Chance**: Held in hand; saves you from 1 bust (discard both the duplicate and the Second Chance card)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | NestJS (TypeScript) + Socket.io |
| Frontend | React (TypeScript) + Vite + Zustand |
| Database | PostgreSQL via TypeORM |
| Cache / Game State | Redis via ioredis |
| Job Queue | BullMQ (on Redis) |
| Monorepo | pnpm workspaces |

Additional libraries: `framer-motion` (card animations), `react-router-dom` v6, `zod` (WS payload validation), `nanoid` (room codes), `react-hot-toast`, `vitest` (tests)

---

## Project Structure

```
get-seven/
├── package.json                    # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── docker-compose.yml              # postgres + redis for local dev
├── .env.example
│
├── packages/
│   └── shared/                     # @flip7/shared — types shared between api + web
│       └── src/
│           ├── types/
│           │   ├── card.types.ts       # Card, NumberCard, ModifierCard, ActionCard
│           │   ├── game.types.ts       # GameState, PlayerRoundState, GamePhase
│           │   └── room.types.ts       # Room, RoomStatus
│           ├── events/
│           │   ├── client.events.ts    # ClientToServerEvents (typed socket events)
│           │   └── server.events.ts    # ServerToClientEvents, PublicGameState
│           └── constants/
│               └── game.constants.ts  # WINNING_SCORE=200, FLIP7_BONUS=15, TURN_TIMEOUT_MS=30000
│
├── apps/
│   ├── api/                        # NestJS backend
│   │   └── src/
│   │       ├── config/             # @nestjs/config typed env wrapper
│   │       ├── database/           # TypeORM module + migrations
│   │       ├── redis/              # global ioredis service
│   │       ├── rooms/
│   │       │   ├── rooms.controller.ts   # POST /rooms, GET /rooms/:code
│   │       │   ├── rooms.service.ts      # DB operations
│   │       │   ├── rooms.gateway.ts      # /lobby WS namespace
│   │       │   └── entities/             # Room, RoomPlayer TypeORM entities
│   │       ├── game/
│   │       │   ├── game.gateway.ts       # /game WS namespace (thin — delegates to service)
│   │       │   ├── game.service.ts       # orchestration (I/O boundary)
│   │       │   ├── game-state.service.ts # Redis R/W (Lua atomic update)
│   │       │   ├── game-engine.service.ts# PURE logic: (state, action) => state
│   │       │   ├── deck.service.ts       # build + shuffle 94-card deck
│   │       │   └── scoring.service.ts    # round score formula
│   │       └── scheduler/
│   │           └── room-cleanup.processor.ts  # BullMQ: turn timeout + 20min room cleanup
│   │
│   └── web/                        # React + Vite frontend
│       └── src/
│           ├── socket.ts               # singleton socket.io-client instance
│           ├── pages/
│           │   ├── HomePage.tsx         # create room or enter code to join
│           │   ├── LobbyPage.tsx        # waiting room (player list, share link, start)
│           │   └── GamePage.tsx         # active game board
│           ├── components/
│           │   ├── lobby/               # PlayerList, ShareLink, StartButton
│           │   └── game/
│           │       ├── GameBoard.tsx
│           │       ├── PlayerHandArea.tsx
│           │       ├── CardComponent.tsx
│           │       ├── ActionBar.tsx        # Hit / Stay buttons + countdown timer
│           │       ├── BustWarningModal.tsx # Second Chance decision (5s window)
│           │       ├── RoundEndOverlay.tsx
│           │       └── WinnerScreen.tsx
│           ├── store/
│           │   ├── useGameStore.ts      # Zustand: game state
│           │   ├── useRoomStore.ts      # Zustand: lobby state
│           │   └── usePlayerStore.ts    # Zustand: local identity + turn state
│           └── hooks/
│               ├── useGameEvents.ts     # bind server→client events to game store
│               └── useRoomEvents.ts     # bind server→client events to room store
```

---

## Data Models

### PostgreSQL Tables

```typescript
// rooms table
{
  id: UUID (PK),
  code: VARCHAR(6) UNIQUE,        // shareable room code e.g. "XK72MA"
  status: 'waiting' | 'in_progress' | 'finished',
  hostPlayerId: UUID,
  maxPlayers: INT (default 18),
  createdAt: TIMESTAMP,
  finishedAt: TIMESTAMP nullable  // set when game ends, triggers 20min cleanup
}

// room_players table
{
  id: UUID (PK),
  roomId: UUID (FK → rooms),
  displayName: VARCHAR,
  totalScore: INT (default 0),    // accumulated across all rounds
  socketId: VARCHAR nullable,
  isConnected: BOOL,
  seatIndex: INT,                 // determines turn order
  joinedAt: TIMESTAMP
}
```

### Redis Game State

Key: `game:{roomId}` | TTL: 2 hours

```typescript
interface GameState {
  roomId: string;
  phase: 'dealing' | 'player_turn' | 'bust_pending' | 'action_pending' | 'flip_three' | 'round_end' | 'game_over';
  round: number;
  deck: Card[];              // NEVER sent to clients (cheat prevention)
  discardPile: Card[];
  playerStates: PlayerRoundState[];
  playerOrder: string[];     // playerIds in seat order
  activePlayerIndex: number;
  cumulativeScores: Record<string, number>;
  winnerId: string | null;
}

interface PlayerRoundState {
  playerId: string;
  hand: Card[];              // all cards face-up (Flip 7 is open information)
  numberSum: number;
  hasTimesTwo: boolean;
  flatBonuses: number;
  hasSecondChance: boolean;
  status: 'active' | 'stayed' | 'busted' | 'frozen' | 'flip7';
  roundScore: number;
  flipThreeRemaining: number; // 0 normally, counts down during Flip Three
}
```

Other Redis keys:
- `session:{socketId}` → `{ playerId, roomId }` (TTL 30min)
- `game:{roomId}:names` → `Record<playerId, displayName>` (TTL 2h) — for `toPublicGameState` without hitting Postgres

---

## WebSocket Events

### Client → Server

| Event | Namespace | Payload | Who |
|---|---|---|---|
| `lobby:join` | /lobby | `{ roomCode, displayName }` | anyone |
| `lobby:leave` | /lobby | — | anyone |
| `lobby:start_game` | /lobby | — | host only |
| `game:hit` | /game | `{ roomId }` | active player only |
| `game:stay` | /game | `{ roomId }` | active player only |
| `game:use_second_chance` | /game | `{ roomId }` | busting player (5s window) |

### Server → Client

| Event | Target | Payload |
|---|---|---|
| `lobby:state` | room broadcast | full player list snapshot |
| `lobby:player_joined` | room broadcast | `{ playerId, displayName }` |
| `lobby:player_left` | room broadcast | `{ playerId }` |
| `game:started` | room broadcast | `{ gameState: PublicGameState, yourPlayerId }` |
| `game:state_update` | room broadcast | `{ gameState, action }` (after every event) |
| `game:your_turn` | active player only | `{ timeoutMs: 30000 }` |
| `game:bust_warning` | busting player only | `{ card, hasSecondChance }` |
| `game:round_end` | room broadcast | `{ roundScores, cumulativeScores }` |
| `game:over` | room broadcast | `{ winnerId, finalScores }` |
| `game:error` | sender only | `{ code, message }` |

`PublicGameState` sends `deckSize: number` — never the actual deck contents.

---

## Game State Machine

```
LOBBY
  └─ host emits lobby:start_game
       ↓
  DEALING  ← server deals 1 card to each player in seat order
             action cards resolved immediately as they land
       ↓
  PLAYER_TURN  ← emit game:your_turn to active player (30s timeout)
    │
    ├── game:hit
    │     └─ draw card
    │           ├─ number (unique) → add to hand, check Flip 7
    │           ├─ number (duplicate) → emit bust_warning, await SC use (5s)
    │           │     └─ SC used → discard both, continue
    │           │     └─ SC not used → BUST, advanceTurn
    │           ├─ modifier → apply to state, advanceTurn
    │           └─ action card → RESOLVING_ACTION
    │                 ├─ Freeze → target.status = 'frozen', advanceTurn
    │                 ├─ Flip Three → flipThreeRemaining = 3, force-hit loop
    │                 └─ Second Chance → target.hasSecondChance = true, advanceTurn
    │
    ├── game:stay / timeout
    │     └─ player.status = 'stayed', advanceTurn
    │
    └── advanceTurn()
          └─ all players done? (stayed | busted | frozen | flip7)
                ├─ NO → next active player → PLAYER_TURN
                └─ YES → ROUND_END
                          └─ calculate scores
                          └─ anyone ≥ 200?
                                ├─ YES → GAME_OVER → emit game:over → schedule room deletion (+20min)
                                └─ NO → next round → DEALING
```

---

## Key Technical Decisions

### 1. Pure `GameEngineService`
`(state: GameState, action) => GameState` — zero async, zero I/O. All game logic is here. `GameService` is the only place that touches Redis or sockets. This makes the game rules trivially unit-testable and keeps rule changes isolated.

### 2. Two Socket.IO Namespaces
`/lobby` for pre-game, `/game` for in-game. Clean separation. A reconnecting player can rejoin `/game` directly and receive a full state snapshot without going through the lobby flow.

### 3. Atomic Redis State Updates (Lua)
Read-modify-write is atomic via a Lua script to prevent race conditions on concurrent socket events:
```lua
local s = redis.call('GET', KEYS[1])
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
return s
```
In practice, the turn-based structure means contention is rare, but the Lua script is a correctness guarantee.

### 4. BullMQ for All Timed Operations
`setTimeout` is lost on server restart. BullMQ jobs persist in Redis:
- **Turn timeout**: 30s delayed job per turn, cancelled immediately if player acts. Job ID includes round number to guard against stale fires.
- **Room cleanup**: 20min delayed job on game end to delete room from Postgres + Redis.

### 5. Session in Redis
Key `session:{socketId}` → `{ playerId, roomId }` (TTL 30min). No cookies, no JWT. `WsPlayerGuard` reads this key and attaches `client.data` on every guarded event. When auth is added later, `playerId` is simply linked to a `users` table — no other code changes needed.

### 6. Shared Types via `@flip7/shared`
Typed socket event interfaces are defined once and imported by both `api` and `web`. A typo in an event name is a TypeScript compile error. No `any` on the wire.

---

## Deck Composition (94 cards total)

| Type | Cards | Count |
|---|---|---|
| Number cards | 0(×1), 1(×1), 2(×2), 3(×3), 4(×4), 5(×5), 6(×6), 7(×7), 8(×8), 9(×9), 10(×10), 11(×11), 12(×12) | 79 |
| Score modifiers | +2(×2), +4(×2), +6(×2), +8(×2), +10(×2), ×2(×2) | 12 |
| Action cards | Freeze(×3), Flip Three(×3), Second Chance(×3) | 9 |

---

## Implementation Phases

### Phase 1 — Foundation ✅
- [x] pnpm workspace + `tsconfig.base.json` + `docker-compose.yml`
- [x] `@flip7/shared`: types, events, constants (no implementation, just contracts)
- [x] NestJS scaffold: ConfigModule, DatabaseModule, RedisModule
- [x] TypeORM migrations for `rooms` + `room_players`

### Phase 2 — Core Game Logic (test-first) ✅
- [x] `DeckService`: build deck, Fisher-Yates shuffle, unit tests
- [x] `GameEngineService`: all transitions + edge cases, unit tests
- [x] `ScoringService`: scoring formula, unit tests

### Phase 3 — API + Persistence ✅
- [x] `RoomsController` + `RoomsService`
- [x] `GameStateService`: Redis R/W
- [x] `GameService`: wire engine + state + scheduler

### Phase 4 — WebSockets ✅
- [x] `RoomsGateway` (`/lobby`): join, leave, start
- [x] `GameGateway` (`/game`): hit, stay, second chance, action target
- [x] `WsPlayerGuard`: session validation
- [x] `TurnTimeoutProcessor` + `RoomCleanupProcessor`: BullMQ workers
- [x] `WsExceptionFilter`: structured error emission
- [x] `SchedulerModule`: wired into AppModule

### Phase 5 — Frontend
- [ ] Next.js scaffold with TypeScript + Tailwind
- [ ] Socket.IO client setup (two namespaces: `/lobby`, `/game`)
- [ ] Zustand stores: game state, room state, player identity
- [ ] Event hooks binding server events to stores
- [ ] Pages: HomePage → LobbyPage → GamePage
- [ ] Game UI components + animations

### Phase 6 — Hardening
- [ ] Disconnection/reconnection handling (backend complete; verify via frontend)
- [ ] Edge cases: host leaves, player leaves mid-game
- [ ] E2E smoke test (3 browser tabs, full game to 200)

---

## How to Run Locally (once built)

```bash
# Start infrastructure
docker compose up -d

# Install all dependencies
pnpm install

# Run migrations
pnpm --filter api migration:run

# Start dev servers
pnpm --filter api dev       # NestJS on :3000
pnpm --filter web dev       # Vite on :5173
```

---

## Future Considerations (not in scope now)
- User authentication (designed for: session → userId link)
- Persistent leaderboard / game history
- Spectator mode
- Custom room settings (winning score, max players, turn timeout)
- Mobile-responsive UI
