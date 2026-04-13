# Development Context — Flip 7 Online

This file captures implementation state and pending work so context survives conversation compaction.

---

## What Has Been Built

### Monorepo root (`get-seven/`)
- `package.json` — pnpm workspace root, scripts: `dev:api`, `dev:web`, `build`, `test`
- `pnpm-workspace.yaml` — declares `packages/*` and `apps/*`
- `tsconfig.base.json` — shared TS config (`strict: true`, ES2022, sourceMap, declaration)
- `docker-compose.yml` — Postgres 16 + Redis 7 with healthchecks and volumes
- `.env.example` — all env vars documented
- `PLAN.md` — full architecture plan (refer to this for structure decisions)
- `SYSTEM_DESIGN.md` — full system design doc: flows, state machine, data layer, key decisions

### `packages/shared` → `@flip7/shared` ✅ (compiled, tests pass)
Pure type/constant contracts. Zero business logic. Imported by both api and web.

**Types:**
- `card.types.ts` — `Card` (discriminated union: `NumberCard | ModifierCard | ActionCard`), `ModifierKind`, `ActionKind`, `MODIFIER_VALUES`
- `game.types.ts` — `GamePhase`, `PlayerStatus`, `PlayerRoundState`, `GameState`, `PublicGameState`, `PublicPlayerState`, `GameAction`
- `room.types.ts` — `Room`, `RoomPlayer`, `RoomStatus`

**GamePhase values:**
`'dealing' | 'player_turn' | 'bust_pending' | 'action_pending' | 'flip_three' | 'round_end' | 'game_over'`

**Key GameState fields (server-only, stored in Redis):**
- `deck: Card[]` — never sent to clients
- `bustPendingPlayerId`, `bustDuplicateCard` — set during bust_pending phase
- `pendingActionCard` — set during action_pending (Freeze/Flip Three/SC awaiting target)
- `dealProgress` — tracks initial deal progress
- `deferredActions` on `PlayerRoundState` — action cards encountered mid-Flip Three, resolved after with target selection

**Events (socket.io typed interfaces):**
- `client.events.ts` — `ClientToServerEvents`: lobby:join, lobby:leave, lobby:start_game, game:hit, game:stay, game:use_second_chance, game:select_action_target
- `server.events.ts` — `ServerToClientEvents`: all server→client events with exact payload shapes

**Constants:**
- `WINNING_SCORE=200`, `FLIP7_BONUS=15`, `FLIP7_UNIQUE_CARDS_NEEDED=7`
- `TURN_TIMEOUT_MS=30_000`, `ACTION_TARGET_TIMEOUT_MS=15_000`, `SECOND_CHANCE_WINDOW_MS=5_000`
- `DECK_TOTAL` — computed dynamically from count maps (= 94)
- Deck composition: 79 number cards (N copies of N, plus one 0), 6 modifier cards (1 each), 9 action cards (3 freeze, 3 flip_three, 3 second_chance)

### `apps/api` → `@flip7/api` (NestJS) ✅ — full backend complete, `tsc --noEmit` clean

**`tsconfig.json` notes:**
- `module: "nodenext"`, `moduleResolution: "nodenext"` (NestJS 11 defaults)
- `strictPropertyInitialization: false` — TypeORM entities use decorator-based init, not constructors
- Jest `moduleNameMapper`: `"^@flip7/shared(.*)$": "<rootDir>/../../../packages/shared/src$1"`

#### Infrastructure

- `src/main.ts` — ValidationPipe, IoAdapter, CORS (`CLIENT_URL`), global `/api` prefix
- `src/app.module.ts` — imports ConfigModule, DatabaseModule, RedisModule, BullModule (forRootAsync), RoomsModule, GameModule, SchedulerModule
- `src/config/config.module.ts` — wraps `@nestjs/config`, global, reads `.env`
- `src/database/database.module.ts` — TypeORM async factory, `synchronize: false`, auto-discovers `*.entity.ts`
- `src/database/data-source.ts` — TypeORM `DataSource` for CLI (migration commands)
- `src/database/migrations/1776002056889-InitialSchema.ts` — creates `rooms` and `room_players` tables
- `src/redis/redis.module.ts` — global ioredis client, exported as `REDIS_CLIENT` injection token, `maxRetriesPerRequest: null` for BullMQ

**Migration scripts in `package.json`:**
```
migration:generate  — typeorm-ts-node-commonjs migration:generate ...
migration:run       — typeorm-ts-node-commonjs migration:run ...
migration:revert    — typeorm-ts-node-commonjs migration:revert ...
migration:show      — typeorm-ts-node-commonjs migration:show ...
```

#### Entities

- `src/rooms/entities/room.entity.ts` — `rooms` table: id, code (6-char unique), status, hostPlayerId, maxPlayers, createdAt, updatedAt, finishedAt
- `src/rooms/entities/room-player.entity.ts` — `room_players` table: id, roomId (FK cascade), displayName, totalScore, socketId (nullable), isConnected, seatIndex, joinedAt

#### `DeckService` ✅ (`src/game/deck.service.ts`)
- `buildDeck(): Card[]`
- `shuffle(deck, rng?): Card[]`
- `buildShuffledDeck(): Card[]`
- `rebuildDeck(excludeIds: Set<string>): Card[]` — builds fresh deck, filters out in-play card IDs, shuffles

Tests: `deck.service.spec.ts` — 11 tests, all passing ✅

#### `ScoringService` ✅ (`src/game/scoring.service.ts`)
- `addCardToPlayer(player: PlayerRoundState, card: Card): PlayerRoundState` — adds card to hand, updates `numberSum`/`hasTimesTwo`/`flatBonuses`, recomputes live `roundScore`
- `applyRoundScores(state: GameState): GameState` — applies each player's `roundScore` to `cumulativeScores`, detects winner (highest score ≥ `WINNING_SCORE`)

Tests: `scoring.service.spec.ts` ✅

#### `GameEngineService` ✅ (`src/game/game-engine.service.ts`)
Pure state-transition functions — no async, no I/O. Injects `DeckService` and `ScoringService`.

**Methods:**
- `initRound(params: { roomId, round, players, dealerIndex, cumulativeScores, deck }): GameState`
- `applyDeal(state): { newState, card, targetPlayerId }` — deals top card to next player in seat order; rebuilds deck via `deckService.rebuildDeck()` if empty
- `applyHit(state, drawnCard): HitResult`
- `applyStay(state): GameState`
- `applyActionTarget(state, targetPlayerId): GameState` — handles Freeze, Flip Three, and Second Chance; chains remaining deferred actions
- `applySecondChance(state): GameState` — player uses held SC to avoid a bust
- `confirmBust(state): GameState` — confirms bust, zeros `flipThreeRemaining`
- `advanceTurn(state): GameState`
- `isRoundOver(state): boolean`

**`HitResult` discriminated union:**
```typescript
type HitResult =
  | { event: 'number_ok'; newState: GameState }
  | { event: 'flip7'; newState: GameState }
  | { event: 'bust'; newState: GameState; hasSecondChance: boolean }
  | { event: 'modifier_added'; newState: GameState }
  | { event: 'action_target_needed'; newState: GameState; validTargets: string[] }
  | { event: 'second_chance_received'; newState: GameState }
  | { event: 'flip_three_card'; newState: GameState; remaining: number }
  | { event: 'flip_three_done'; newState: GameState }
```

**Key game rules implemented:**
- **Bust during Flip Three + SC**: SC is auto-consumed (not a choice), duplicate discarded, flip three continues
- **Bust during Flip Three without SC**: bust proceeds normally, `flipThreeRemaining` zeroed in `confirmBust`
- **Second Chance drawn**: always prompts `action_target_needed` — any player without a SC is a valid target (including self); auto-discards if no valid targets; deferred during Flip Three if valid targets exist
- **Freeze/Flip Three during Flip Three**: deferred into `deferredActions`; after sequence ends, prompts `action_target_needed` for each deferred card in order (not auto-applied to self)
- **Empty deck during deal**: rebuilds via `deckService.rebuildDeck()` excluding cards in hands + discard pile
- **Dealing phase**: action cards auto-applied to recipient (no player choice); SC auto-discarded if recipient already holds one

Tests: `game-engine.service.spec.ts` ✅

#### `GameStateService` ✅ (`src/game/game-state.service.ts`)
- `getState(roomId): Promise<GameState | null>`
- `setState(roomId, state): Promise<void>`
- `updateState(roomId, updater): Promise<GameState>` — read-then-set (turn-based, one actor at a time)
- `deleteState(roomId): Promise<void>`
- `setDisplayNames(roomId, names): Promise<void>` — key `game:{roomId}:names`
- `getDisplayNames(roomId): Promise<Record<string, string>>`
- `deleteDisplayNames(roomId): Promise<void>`

Key pattern: `game:{roomId}`, TTL: 7200s. Tests: `game-state.service.spec.ts` ✅

#### `RoomsModule` ✅
- `src/rooms/dto/create-room.dto.ts` — `{ displayName, maxPlayers? }`
- `src/rooms/dto/join-room.dto.ts` — `{ roomCode, displayName }`
- `src/rooms/rooms.service.ts` — `createRoom`, `addOrReconnectPlayer` (upsert by displayName), `removePlayer`, `setPlayerConnected`, `transferHost`, `updateRoomStatus`; nanoid v3 for 6-char codes
- `src/rooms/rooms.controller.ts` — `POST /rooms` (returns `{ roomId, roomCode, playerId, shareUrl }`), `GET /rooms/:code`
- `src/rooms/rooms.gateway.ts` — `/lobby` namespace; handles `lobby:join`, `lobby:leave`, `lobby:start_game`, `handleDisconnect`; NAME_TAKEN check only applies to connected players; calls `gameService.startGame` fire-and-forget
- `src/rooms/rooms.module.ts` — imports `TypeOrmModule.forFeature([Room, RoomPlayer])`, `GameModule`; exports `RoomsService`

#### `GameService` + `GameGateway` + `GameModule` ✅
- `src/game/game.service.ts` — full orchestration; `setServer(server)` called from gateway `afterInit`; `startGame`, `handleHit`, `handleStay`, `handleSecondChance`, `handleActionTarget`, `handlePlayerDisconnect`; BullMQ enqueue/cancel for turn-timeout and action-timeout; `toPublicGameState(state, displayNames)` public helper
- `src/game/game.gateway.ts` — `/game` namespace; `handleConnection` validates auth + joins socket rooms + emits `game:reconnected`; all event handlers use `@UseGuards(WsPlayerGuard)`; `@UseFilters(WsExceptionFilter)` at class level
- `src/game/game.module.ts` — imports `TypeOrmModule.forFeature([Room])`, `BullModule.registerQueue([turn-timeout, room-cleanup])`; exports `GameService`, `GameStateService`

#### Common ✅
- `src/common/guards/ws-player.guard.ts` — reads `session:{socketId}` from Redis, attaches `{ playerId, roomId }` to `client.data`, emits `game:error NOT_YOUR_TURN` and returns false if session missing
- `src/common/filters/ws-exception.filter.ts` — catches `WsException`, emits `game:error` with `{ code, message }`

#### `SchedulerModule` ✅
- `src/scheduler/turn-timeout.processor.ts` — `@Processor('turn-timeout')`; dispatches on `job.name`: `turn-timeout` → auto-stay (stale-job guard: round + turnIndex + phase), `action-timeout` → auto-target-self (stale-job guard: round + turnIndex + phase=action_pending)
- `src/scheduler/room-cleanup.processor.ts` — `@Processor('room-cleanup')`; deletes room from Postgres (cascade), calls `deleteState` + `deleteDisplayNames`
- `src/scheduler/scheduler.module.ts` — imports `BullModule.registerQueue([turn-timeout, room-cleanup])`, `TypeOrmModule.forFeature([Room])`, `GameModule`

---

## What Still Needs to Be Built

### `apps/web` — Next.js frontend

Not yet started. Refer to `PLAN.md` for the planned frontend structure and page breakdown.

**Pages:**
- `/` — home/landing: create room form
- `/join/[code]` — join room form (pre-fill code from URL)
- `/lobby/[roomId]` — waiting room: player list, start button for host
- `/game/[roomId]` — main game view

**Key frontend concerns:**
- Socket.IO client: connect to `/lobby` on lobby pages, switch to `/game` after `lobby:game_starting`
- Auth: pass `{ playerId, roomId }` in socket `auth` handshake for `/game`
- State: derive all UI from the latest `PublicGameState` emitted by `game:state_update` / `game:reconnected`
- Reconnect: on page load in `/game`, connect to `/game` with stored `playerId` — server emits `game:reconnected` with full state

---

## Key Design Decisions to Remember

1. **Two Socket.IO namespaces** — `/lobby` (pre-game) and `/game` (in-game). Clean separation. Reconnect to `/game` directly and get full state snapshot via `game:reconnected`.

2. **GameEngineService is pure** — `(state, action) => newState`, no async, no NestJS dependencies. All I/O is in `GameService`. This makes the engine fully unit-testable without mocking.

3. **Session in Redis** — `session:{socketId}` → `{ playerId, roomId }`. `WsPlayerGuard` reads this. When auth is added later, just link `playerId` to a `userId` in a `users` table — no other changes needed.

4. **BullMQ job IDs are deterministic** — `turn-{roomId}-{round}-{turnIndex}` and `action-{roomId}-{round}-{turnIndex}` so jobs can be cancelled by ID without storing them. Stale-job guards prevent late-firing jobs from acting on an advanced state.

5. **Action card target selection** — Freeze, Flip Three, and Second Chance all use `action_target_needed` / `game:select_action_target`. Valid targets: for Freeze/Flip Three = any active player (including self); for Second Chance = any player without a SC. Server emits `game:select_target`, waits `ACTION_TARGET_TIMEOUT_MS` (15s). During the dealing phase, action cards auto-apply to the recipient (no selection).

6. **Second Chance rules** — Drawing SC always prompts for target. If no valid targets, auto-discard. During Flip Three: deferred if valid targets exist, discarded immediately if not. Mid-Flip-Three bust with SC held: SC auto-consumed, flip three continues (no choice).

7. **Deferred actions** — Action cards drawn during a Flip Three sequence go into `deferredActions`. After the sequence ends, each is resolved one at a time via `action_pending` / `action_target_needed`. They are NOT auto-applied to self.

8. **Scoring responsibility** — `ScoringService` owns all score computation: live `roundScore` via `addCardToPlayer()` (called by GameEngine) and round-end settlement via `applyRoundScores()`.

9. **`nanoid` v3** — pinned to v3 (CommonJS) to avoid ESM issues with `module: nodenext`. Used for 6-char room codes.

10. **Migrations over `synchronize`** — `synchronize: false` in all environments. Run `pnpm migration:run` to apply. Uses `typeorm-ts-node-commonjs` CLI with `src/database/data-source.ts` as the datasource.

11. **No `.js` extension on relative imports** — despite `moduleResolution: nodenext`, the codebase does NOT use `.js` extensions on relative TypeScript imports. Jest is configured with `moduleNameMapper` for `@flip7/shared`.

---

## Running Locally
```bash
# 1. Start infra
docker compose up -d

# 2. Copy env
cp .env.example .env

# 3. Install
pnpm install

# 4. Run migrations
cd apps/api && pnpm migration:run

# 5. Run API in watch mode
pnpm dev:api
```
