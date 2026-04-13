# System Design — Flip 7 Online

## Table of Contents
1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Module Structure](#module-structure)
4. [Data Layer](#data-layer)
5. [Client Flows](#client-flows)
6. [Game State Machine](#game-state-machine)
7. [Key Design Decisions](#key-design-decisions)

---

## Overview

Flip 7 Online is a real-time multiplayer card game. Players join a lobby, the host starts the game, and each player takes turns drawing cards until the round ends. The first player to accumulate 200+ points across rounds wins.

The backend is a NestJS API with two Socket.IO namespaces — `/lobby` (pre-game) and `/game` (in-game) — backed by PostgreSQL for persistent room data and Redis for ephemeral game state and sessions.

---

## Tech Stack

| Layer | Technology |
|---|---|
| API framework | NestJS 11 (TypeScript) |
| Real-time transport | Socket.IO 4 (two namespaces) |
| Persistent storage | PostgreSQL 16 via TypeORM |
| Ephemeral state + sessions | Redis 7 via ioredis |
| Job scheduling | BullMQ backed by Redis |
| Shared types | `@flip7/shared` workspace package |

---

## Module Structure

```
AppModule
├── ConfigModule         (global)
├── DatabaseModule       (TypeORM + PostgreSQL)
├── RedisModule          (global ioredis client, REDIS_CLIENT token)
├── BullModule root      (BullMQ connection, global)
├── RoomsModule
│   ├── TypeOrmModule.forFeature([Room, RoomPlayer])
│   ├── RoomsService     (DB operations)
│   ├── RoomsController  (HTTP endpoints)
│   ├── RoomsGateway     (/lobby WS namespace)
│   └── → imports GameModule
├── GameModule
│   ├── TypeOrmModule.forFeature([Room])
│   ├── BullModule.registerQueue([turn-timeout, room-cleanup])
│   ├── DeckService      (pure: build & shuffle deck)
│   ├── ScoringService   (pure: live score + round settlement)
│   ├── GameEngineService (pure state machine)
│   ├── GameStateService (Redis read/write for GameState)
│   ├── GameService      (orchestration: I/O + emit)
│   ├── GameGateway      (/game WS namespace)
│   ├── WsPlayerGuard    (session → client.data)
│   └── WsExceptionFilter
└── SchedulerModule
    ├── BullModule.registerQueue([turn-timeout, room-cleanup])
    ├── TurnTimeoutProcessor  (auto-stay + auto-target-self)
    └── RoomCleanupProcessor  (delete room + Redis keys)
```

**Module dependency rule:** `RoomsModule → GameModule`. `GameModule` has no knowledge of `RoomsModule`. `SchedulerModule → GameModule`. No circular dependencies.

---

## Data Layer

### PostgreSQL (persistent)

**`rooms`**
```
id (uuid PK) | code (6-char unique) | status (waiting|in_progress|finished)
hostPlayerId (uuid FK→room_players) | maxPlayers | createdAt | updatedAt | finishedAt
```

**`room_players`**
```
id (uuid PK) | roomId (uuid FK→rooms CASCADE) | displayName | totalScore
socketId (nullable) | isConnected | seatIndex | joinedAt
```

Rooms and players are created via HTTP and persist until the `room-cleanup` BullMQ job fires 20 minutes after game over.

### Redis (ephemeral)

| Key | Value | TTL | Purpose |
|---|---|---|---|
| `game:{roomId}` | `GameState` JSON | 2h | Full server-side game state (includes deck — never sent to clients) |
| `game:{roomId}:names` | `Record<playerId, displayName>` JSON | 2h | Display names for `toPublicGameState` |
| `session:{socketId}` | `{ playerId, roomId }` JSON | 30min | Maps a connected socket to a player identity |

Sessions are written on WS connect (both `/lobby` and `/game`) and deleted on disconnect. `WsPlayerGuard` reads the session key and attaches `{ playerId, roomId }` to `client.data` on every guarded event handler.

### BullMQ queues (in Redis)

| Queue | Job name | Job ID pattern | Trigger | Action |
|---|---|---|---|---|
| `turn-timeout` | `turn-timeout` | `turn-{roomId}-{round}-{turnIndex}` | After `game:your_turn` emitted | Auto-stay the active player |
| `turn-timeout` | `action-timeout` | `action-{roomId}-{round}-{turnIndex}` | After `game:select_target` emitted | Auto-target-self |
| `room-cleanup` | `room-cleanup` | `cleanup-{roomId}` | 20 min after game over | Delete room + Redis keys |

Both timeout jobs carry `{ round, turnIndex }` for stale-job detection — if the game state has advanced, the job silently exits.

---

## Client Flows

### 1. Create a Room (HTTP)

```
Client                          API
  |  POST /api/rooms             |
  |  { displayName, maxPlayers } |
  |----------------------------→ |
  |                              | INSERT room (status=waiting)
  |                              | INSERT room_player (host, isConnected=false)
  |                              | UPDATE room.hostPlayerId
  |  { roomId, roomCode,         |
  |    playerId, shareUrl }      |
  |←---------------------------- |
```

The host player is created in Postgres but disconnected until they join via WebSocket.

---

### 2. Lobby Flow (/lobby namespace)

```
Client                          RoomsGateway              Redis
  | connect to /lobby             |                          |
  | emit lobby:join               |                          |
  |  { roomCode, displayName }    |                          |
  |-----------------------------→ |                          |
  |                               | findByCode(roomCode)     |
  |                               | validate: exists,        |
  |                               |   waiting, not full,     |
  |                               |   name not taken         |
  |                               | addOrReconnectPlayer()   |
  |                               | client.join(roomId)      |
  |                               | SET session:{socketId}   |
  |                               |------------------------→ |
  |  lobby:joined { yourPlayerId }|                          |
  |  lobby:state { players, ... } |                          |
  |←-----------------------------|                          |
  |                               | to(roomId).emit(         |
  |                               |   lobby:player_joined)   |
  | (other clients receive ↑)     |                          |
```

**Reconnect:** if `displayName` matches a disconnected player in the room, their existing `RoomPlayer` record is updated with the new `socketId` (no duplicate created).

**Disconnect:** `isConnected = false`, `socketId = null`. Host transfers to the next connected player by `seatIndex`.

---

### 3. Start Game

```
Host client                  RoomsGateway          GameService          GameGateway
  | emit lobby:start_game     |                       |                    |
  |---------------------------→                       |                    |
  |                           | validate host +       |                    |
  |                           |   min players         |                    |
  |                           | updateRoomStatus      |                    |
  |                           |   → in_progress       |                    |
  |                           | to(roomId).emit(      |                    |
  |                           |   lobby:game_starting)|                    |
  |                           | startGame(roomId,     |                    |
  |                           |   players) --------→ |                    |
  |                           |                       | setDisplayNames    |
  |                           |                       | initRound(round=1) |
  |                           |                       | dealing loop:      |
  |                           |                       |   applyDeal × N    |
  |                           |                       |   emit state_update|
  |                           |                       | notifyActivePlayer |
  |                           |                       |   emit your_turn   |
  |                           |                       |   enqueue BullMQ   |

(Meanwhile, all clients disconnect from /lobby and connect to /game)

Each client joining /game:
  | connect({ auth: { playerId, roomId } })            |                    |
  |--------------------------------------------------→ |                    |
  |                                                     | validate vs        |
  |                                                     |   GameState in Redis
  |                                                     | client.join(roomId)|
  |                                                     | client.join(playerId)
  |                                                     | SET session:...    |
  |  game:reconnected { gameState, yourPlayerId }       |                    |
  |←--------------------------------------------------- |                    |
```

`game:reconnected` gives every client a full state snapshot, so it doesn't matter whether they connect before or after the dealing loop completes.

---

### 4. Player Turn

```
Active player                GameGateway        GameService
  | emit game:hit              |                   |
  |  { roomId }                |                   |
  |---------------------------→ |                   |
  |                             | WsPlayerGuard:    |
  |                             |   GET session:... |
  |                             |   → client.data   |
  |                             | handleHit(        |
  |                             |   roomId,         |
  |                             |   playerId) ---→  |
  |                             |                   | GET game:{roomId}
  |                             |                   | validate phase +
  |                             |                   |   activePlayer
  |                             |                   | cancelTurnTimeout
  |                             |                   | engine.applyHit()
  |                             |                   | SET game:{roomId}
  |                             |                   | to(roomId).emit(
  |                             |                   |   game:state_update)
  |                             |                   |
  |                             |                   | ─── result branch ───
  |                             |                   |
  |                             |                   | number_ok / modifier:
  |                             |                   |   notifyActivePlayer
  |                             |                   |   (same player if
  |                             |                   |   round not over)
  |                             |                   |
  |                             |                   | bust:
  |                             |                   |   to(playerId).emit(
  |                             |                   |     game:bust_warning)
  |                             |                   |   setTimeout 5s →
  |                             |                   |     confirmBust
  |                             |                   |
  |                             |                   | action_target_needed:
  |                             |                   |   to(playerId).emit(
  |                             |                   |     game:select_target)
  |                             |                   |   enqueue action-timeout
  |                             |                   |
  |                             |                   | flip7:
  |                             |                   |   handleRoundEnd
```

---

### 5. Action Card Flow

```
Active player (A)            GameService               Target player (B)
  | game:select_action_target |                           |
  |  { targetPlayerId: B }    |                           |
  |------------------------→  |                           |
  |                           | cancelActionTimeout       |
  |                           | engine.applyActionTarget()|
  |                           |                           |
  |                           | ── Freeze ──              |
  |                           | B.status = frozen         |
  |                           | to(roomId).emit(          |
  |                           |   state_update)           |
  |                           | A continues turn          |
  |                           |   (action ≠ end of turn)  |
  |                           |                           |
  |                           | ── Flip Three ──          |
  |                           | B.flipThreeRemaining = 3  |
  |                           | activePlayerIndex → B     |
  |                           | phase → flip_three        |
  |                           | to(B).emit(your_turn) --- |---→
  |                           |   (B must hit 3 times)    |
  |                           |                           |
  |                           | ── Second Chance ──       |
  |                           | B.hasSecondChance = true  |
  |                           | A continues turn          |
```

**Deferred actions during Flip Three:** if a Freeze/Flip Three/SC is drawn _during_ a Flip Three sequence, it goes into `deferredActions`. After the sequence ends (or each card after), `action_pending` prompts resolve them one at a time in order.

---

### 6. Round End & Next Round

```
GameService
  |
  | applyRoundScores(state)
  |   → adds roundScore to cumulativeScores per player
  |   → sets winnerId if any player ≥ 200
  |
  | emit game:round_end { roundScores, cumulativeScores, flip7PlayerId }
  |
  | ── winner? ──────────────────────────────────────────────────────────
  |   emit game:over { winnerId, finalScores }
  |   UPDATE rooms SET status=finished, finishedAt=now
  |   BullMQ: room-cleanup job (delay 20 min)
  |
  | ── no winner? ───────────────────────────────────────────────────────
  |   setTimeout(ROUND_END_PAUSE_MS = 5s)
  |   initRound(round+1, dealerIndex+1, same cumulativeScores)
  |   dealing loop → notifyActivePlayer
```

---

## Game State Machine

`GameEngineService` is **pure** — every method is `(state, input) → newState` with no I/O. All Redis reads/writes and socket emissions are in `GameService`.

### Phase transitions

```
dealing
  └→ player_turn         (after last card dealt, advanceTurn called internally)

player_turn
  ├→ bust_pending        (duplicate number drawn)
  ├→ action_pending      (Freeze / Flip Three / SC drawn)
  ├→ flip_three          (after applyActionTarget with flip_three)
  └→ round_end           (all players stayed/busted/frozen/flip7)

bust_pending
  ├→ player_turn         (applySecondChance used)
  └→ player_turn         (confirmBust — 5s window expired)

action_pending
  ├→ player_turn         (applyActionTarget — Freeze or SC)
  ├→ flip_three          (applyActionTarget — Flip Three)
  └→ action_pending      (deferred actions remain)

flip_three
  ├→ bust_pending        (duplicate drawn, no SC)
  ├→ player_turn         (bust + SC auto-consumed, continue)
  ├→ action_pending      (sequence done, deferred actions)
  └→ player_turn         (sequence done, no deferred actions)

round_end
  └→ dealing             (next round init)

round_end → game_over    (winnerId set)
```

### Score computation (ScoringService)

```
roundScore = numberSum × (hasTimesTwo ? 2 : 1) + flatBonuses
```

`addCardToPlayer` is called on every card draw to keep `roundScore` live. `applyRoundScores` settles at round end — busted players contribute 0.

---

## Key Design Decisions

### Pure game engine
`GameEngineService` has no NestJS decorators, no async, no Redis. It can be unit-tested as plain TypeScript. `GameService` is the only place with I/O.

### Two Socket.IO namespaces
`/lobby` handles everything pre-game (join, leave, start). `/game` handles everything in-game. Clients switch namespaces when the game starts. This gives a clean reconnect model: a client connecting to `/game` always gets a full state snapshot via `game:reconnected`.

### Session model
`session:{socketId}` in Redis maps a socket to `{ playerId, roomId }`. There are two separate session spaces — one per namespace (different socket IDs). `WsPlayerGuard` reads this on every guarded event and attaches to `client.data`, eliminating per-handler session lookups. Clients authenticate to `/game` via `socket({ auth: { playerId, roomId } })`.

### Personal socket rooms
On connect to `/game`, each client joins a room named after their `playerId` (in addition to the game room). This lets `GameService` send targeted events (`game:your_turn`, `game:bust_warning`, `game:select_target`) without knowing socket IDs: `server.to(playerId).emit(...)`.

### Deterministic BullMQ job IDs
Turn timeout: `turn-{roomId}-{round}-{turnIndex}`
Action timeout: `action-{roomId}-{round}-{turnIndex}`
Room cleanup: `cleanup-{roomId}`

Deterministic IDs mean jobs can be cancelled by ID without storing them separately. Stale-job guards (`state.round === job.data.round && state.activePlayerIndex === job.data.turnIndex`) prevent late-firing jobs from acting on a state that has moved on.

### Reconnect/disconnect handling
- **Lobby disconnect:** player marked `isConnected=false`, slot reserved. Rejoining with the same display name reconnects the existing player record.
- **Game disconnect:** if it's the disconnected player's turn, they are auto-stayed. Turn timeout BullMQ job is the backstop for unresponsive players regardless of disconnect.

### Host transfer
On both explicit leave and disconnect, if the departing player is the host, the room's `hostPlayerId` is immediately transferred to the next player by `seatIndex`.
