# Get Seven Online

A real-time multiplayer card game built on the popular press-your-luck card game. Players join a shared game room and compete to be the first to reach 200 cumulative points.

---

## Tech Stack

**Monorepo** managed with [pnpm workspaces](https://pnpm.io/workspaces).

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, Zustand, Framer Motion |
| Backend | NestJS 11, TypeScript, Socket.IO |
| Database | PostgreSQL 16 (TypeORM) |
| Cache / State | Redis 7 (ioredis, BullMQ) |
| Shared types | Zod |
| Infrastructure | Docker Compose |

---

## Local Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 8+
- [Docker](https://www.docker.com/) (for Postgres and Redis)

### 1. Clone and install

```bash
git clone https://github.com/amlannandy/get-seven.git
cd get-seven
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

The defaults in `.env.example` match the Docker Compose configuration and work out of the box for local development.

### 3. Start infrastructure

```bash
docker compose up -d
```

This starts Postgres on port `5432` and Redis on `6379`.

### 4. Run database migrations

```bash
pnpm --filter @flip7/api migration:run
```

### 5. Start the development servers

```bash
# In one terminal — API (http://localhost:3000)
pnpm dev:api

# In another terminal — Web (http://localhost:5173)
pnpm dev:web
```

Open [http://localhost:5173](http://localhost:5173) to play.

---

## Recording

https://github.com/user-attachments/assets/flip-7-demo

> **Note:** Replace the URL above with the actual uploaded asset URL after uploading `recordings/Flip 7.mov` to the GitHub release or issue.

---

## Game Rules

### Objective

Be the first player to accumulate **200 or more points** across multiple rounds.

### The Deck

94 cards total:

| Type | Cards |
|---|---|
| Number cards | 0–12 (N copies of each number N — so one 1, two 2s, three 3s, etc.) |
| Modifier cards | +2, +3, +4, +5, +6, +7, +8, +9, +10, ×2 (3 of each) |
| Action cards | Freeze, Flip Three, Second Chance (3 of each) |

### Round Flow

1. The dealer deals one card to each player. Action cards resolve immediately.
2. Players take turns in seat order choosing to **Hit** (draw a card) or **Stay** (bank their score).
3. The round ends when all players have either stayed or busted.

### Busting

Drawing a **duplicate number card** causes a bust — the player scores **0** for that round.

### Flip 7 Bonus

Collecting **7 unique number cards** in a single round triggers Flip 7: the player earns a **+15 point bonus** and the round ends immediately for all players.

### Scoring

```
score = sum(number cards) × (×2 modifier ? 2 : 1) + flat modifiers + (Flip 7 ? 15 : 0)
```

### Action Cards

| Card | Effect |
|---|---|
| **Freeze** | Target player is forced to stay immediately |
| **Flip Three** | Target player must draw exactly 3 cards |
| **Second Chance** | Saved in hand; automatically negates one bust (including during Flip Three) |

---
