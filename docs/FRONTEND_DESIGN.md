# Frontend Design — Flip 7 Online

## Table of Contents
1. [Tech Stack](#tech-stack)
2. [Visual Design Language](#visual-design-language)
3. [Page Routing](#page-routing)
4. [Layout Architecture](#layout-architecture)
5. [Component Tree](#component-tree)
6. [Game Phase → UI State Map](#game-phase--ui-state-map)
7. [Zustand Stores](#zustand-stores)
8. [Socket Architecture](#socket-architecture)
9. [Animation Plan](#animation-plan)
10. [Mobile Responsiveness](#mobile-responsiveness)
11. [File Structure](#file-structure)
12. [Build Order](#build-order)

---

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | React 19 + Vite 6 |
| Routing | react-router-dom v6 |
| Styling | Tailwind CSS v4 + custom CSS variables |
| Animation | Framer Motion |
| State | Zustand (three stores) |
| Sockets | socket.io-client (two managed instances) |
| Fonts | Fredoka (headings, card values, scores) + Inter (UI text) via Google Fonts |
| Icons | Lucide React |

---

## Visual Design Language

### Aesthetic
Bright arcade table game — BGA Flip 7 meets Colonist. Green baize table feel, chunky UI chrome, bold card faces.

### Color Palette

```
Background (page):    #1a472a  (deep poker-table green)
Table felt:           #2d6a4f  (mid green — main content area)
Card face:            #fefce8  (warm off-white)
Primary / CTA:        #f59e0b  (amber — buttons, active highlights)
Danger / bust:        #ef4444  (red)
Safe / stayed:        #6b7280  (gray)
Flip 7 gold:          #fbbf24  (gold shimmer)
Frozen:               #93c5fd  (ice blue)
Panel background:     #1e3a2f  (dark card/panel fill)
Panel border:         #2d5a3d  (subtle green border)
```

### Card Color Coding (by number value)

| Value | Color | Hex |
|---|---|---|
| 0 | Slate | `#94a3b8` |
| 1–3 | Green | `#4ade80` |
| 4–6 | Yellow | `#facc15` |
| 7 | Orange (the magic number) | `#f97316` |
| 8–10 | Coral | `#f87171` |
| 11–12 | Purple | `#c084fc` |
| Modifier (+N / ×2) | Indigo | `#818cf8` |
| Action — Freeze | Cyan | `#67e8f9` |
| Action — Flip Three | Orange-red | `#fb923c` |
| Action — Second Chance | Mint | `#86efac` |

### Typography
- **Fredoka Bold** — card values, scores, player names, big labels
- **Inter** — all other UI text
- Rounded corners everywhere (`rounded-2xl`, `rounded-full`)
- Thick outlines on cards via `box-shadow` or border
- Drop shadows for depth on interactive/elevated elements

### Player Status Chip Styles

| Status | Style |
|---|---|
| `active` | Amber dot + pulse animation |
| `frozen` | Ice-blue chip, ❄ icon |
| `stayed` | Gray chip, ✓ icon |
| `busted` | Red chip, 💥 icon, panel dims slightly |
| `flip_three` | Orange chip, 🔥 icon + "X left" counter |
| `flip7` | Gold chip, ★ icon, panel glows |

---

## Page Routing

```
/                    →  HomePage
/join/:code          →  JoinPage   (code pre-filled from URL param)
/lobby/:roomId       →  LobbyPage
/game/:roomId        →  GamePage
```

**Identity persistence:** `localStorage` stores `{ playerId, roomId, displayName }` so a page refresh reconnects cleanly without going through the lobby again.

---

## Layout Architecture

### Page-Level CSS Structure

```
html, body  →  height: 100dvh; overflow: hidden
  <main>    →  display: flex; flex-direction: column; height: 100dvh
    <Header>       →  flex-shrink: 0; position: sticky; top: 0; z-index: 10
    <OpponentCol>  →  flex: 1; overflow-y: auto; overscroll-behavior: contain
    <SelfPanel>    →  flex-shrink: 0; position: sticky; bottom: 0; z-index: 10
```

The header is always visible at the top. The self panel is always visible at the bottom. The opponents column fills all remaining space and scrolls independently.

### Visual Wireframe (Game Page)

```
┌──────────────────────────────────────────────────┐  ← sticky top
│  HEADER                                          │    ~56px fixed height
│  Round 2  │  Deck: 47  │  ● PLAYER_TURN         │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐  ← flex-1, scrollable
│  OPPONENTS COLUMN                                │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ #2  Alice    ● ACTIVE   +21 pts │ 145 tot  │  │
│  │  row 1: [ ❄ Freeze ] [ ×2 ]               │  │
│  │  row 2: [ 3 ] [ 5 ] [ 7 ] [ 9 ]           │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ #1  Bob      ❄ FROZEN    +0 pts │ 132 tot  │  │
│  │  row 1: (empty)                            │  │
│  │  row 2: [ 2 ] [ 8 ]                        │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ #3  Carol    ✓ STAYED   +31 pts │  98 tot  │  │
│  │  row 1: [ +2 ]                             │  │
│  │  row 2: [ 4 ] [ 6 ] [ 9 ] [ 11 ]          │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│          ...more opponents...                    │
│                                                  │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐  ← sticky bottom
│  SELF PANEL                                      │    ~200px fixed height
│  #4  YOU — Dave  ▶ YOUR TURN   +21 pts │ 87 tot │
│  ──────────── ████████████████░░░░  22s ──────── │
│                                                  │
│  row 1: [ ❄ Freeze ] [ +4 ]                     │
│  row 2: [ 4 ] [ 8 ]                             │
│                                                  │
│               [ HIT ]       [ STAY ]            │
└──────────────────────────────────────────────────┘
```

---

### Opponent Panel Detail

```
┌──────────────────────────────────────────────────────────────────┐
│  #2  Alice                ● ACTIVE       +21 pts  │  145 total  │
│  ──────────────────────────────────────────────────────────────  │
│  row 1:  [ ❄ Freeze ] [ ×2 ]         ← action + modifier cards  │
│  row 2:  [ 3 ] [ 5 ] [ 7 ] [ 9 ]    ← number cards              │
└──────────────────────────────────────────────────────────────────┘
```

- **Rank badge** (`#2`) — recalculates live as round scores change
- **Name** — truncated with ellipsis if too long
- **Status chip** — color-coded, see status chip table above
- **Round score** — live running total (e.g. `+21 pts`)
- **Total score** — cumulative across all rounds, separated by a subtle `│` divider
- **Row 1** — action and modifier cards (smaller size: ~36×50px on desktop)
- **Row 2** — number cards (same size as row 1)
- Row 1 is hidden/collapsed if the player has no action or modifier cards in hand

### Self Panel Detail

Same two-row card layout. Additional elements:
- **Turn timer** — progress bar between header row and card rows, only visible on `player_turn` when it's your turn. Pulses red under 5s.
- **HIT / STAY buttons** — full pill buttons, only shown when it's your turn and phase is `player_turn` or `flip_three`
- **Waiting state** — when not your turn, shows `○ Waiting for [ActivePlayerName]...`

Cards in self panel are slightly larger (~44×60px desktop) to distinguish your area visually.

---

## Component Tree

```
GamePage
├── GameHeader
│     — Round #, deck size, phase badge
│
├── OpponentColumn  (scrollable wrapper)
│   └── OpponentPanel × N  (one per opponent)
│         ├── PanelHeader  — rank, name, status chip, round score, total score
│         ├── CardRow      — action + modifier cards  (hidden if empty)
│         └── CardRow      — number cards
│
├── SelfPanel  (sticky bottom)
│     ├── PanelHeader   — rank, name, status chip, round score, total score
│     ├── TurnTimer     — progress bar (visible only on your turn)
│     ├── CardRow       — action + modifier cards
│     ├── CardRow       — number cards
│     └── ActionBar     — HIT / STAY buttons (visible only on your turn)
│
├── BustWarningModal
│     — overlays self panel; USE SECOND CHANCE + Accept Bust; 5s countdown
│
├── SelectTargetModal
│     — overlays above self panel; grid of target player tiles; 15s countdown
│
├── RoundEndOverlay
│     — full-screen slide-up; per-player round scores + cumulative; auto-dismiss 5s
│
├── GameOverScreen
│     — replaces everything; winner name + final scores; return to lobby option
│
└── CardComponent  (shared leaf)
      — renders NumberCard, ModifierCard, or ActionCard
      — color-coded face, value label, rounded corners, drop shadow
```

### Lobby Components

```
LobbyPage
├── LobbyHeader     — room code, share link button
├── PlayerGrid      — wrapping grid of PlayerTile, animates in/out
│   └── PlayerTile  — name, host crown, connected indicator
└── StartButton     — host only; disabled if < 2 players; "Waiting for host..." for others
```

---

## Game Phase → UI State Map

| Phase | Opponent panels | Self panel | Overlays |
|---|---|---|---|
| `dealing` | Cards animate in one by one; no status chips yet | No action buttons; "Dealing..." label | — |
| `player_turn` (your turn) | Normal display | ActionBar visible, timer ticking | — |
| `player_turn` (other's turn) | Active player panel pulses amber | "Waiting for Alice..." | — |
| `bust_pending` | Normal | Dimmed | `BustWarningModal` over self panel |
| `action_pending` | Normal | Dimmed | `SelectTargetModal` above self panel |
| `flip_three` | Active player shows 🔥 chip + "X left" | If you're the flip_three target: ActionBar with HIT only | — |
| `round_end` | Frozen | Frozen | `RoundEndOverlay` (full screen) |
| `game_over` | — | — | `GameOverScreen` (replaces page) |

---

## Zustand Stores

### `usePlayerStore` — local identity, persisted to `localStorage`
```ts
{
  playerId: string | null
  roomId: string | null
  displayName: string | null
  setIdentity: (playerId, roomId, displayName) => void
  clearIdentity: () => void
}
```

### `useRoomStore` — lobby state
```ts
{
  roomId: string | null
  roomCode: string | null
  maxPlayers: number
  players: RoomPlayer[]
  hostPlayerId: string | null
  // actions populated by useLobbyEvents hook
}
```

### `useGameStore` — game state + per-event UI triggers
```ts
{
  gameState: PublicGameState | null
  yourPlayerId: string | null

  // from game:your_turn
  turnExpiresAt: number | null

  // from game:bust_warning
  bustWarning: {
    duplicateCard: Card
    hasSecondChance: boolean
    windowMs: number
  } | null

  // from game:select_target
  selectTargetPrompt: {
    action: ActionKind
    validTargetIds: string[]
    expiresAt: number
  } | null

  // from game:round_end (shown in RoundEndOverlay, cleared after dismiss)
  lastRoundEnd: {
    roundNumber: number
    roundScores: Record<string, number>
    cumulativeScores: Record<string, number>
    flip7PlayerId: string | null
  } | null

  // from game:over
  gameOver: {
    winnerId: string
    winnerName: string
    finalScores: Record<string, number>
  } | null
}
```

---

## Socket Architecture

### Two singleton socket instances (`src/lib/socket.ts`)

```ts
lobbySocket  // connects to /lobby namespace
gameSocket   // connects to /game namespace, auth: { playerId, roomId }
```

Both are created lazily — only when the relevant page mounts. Disconnected on unmount (or when transitioning between namespaces).

### Event hooks

- **`useLobbyEvents()`** — called in `LobbyPage`. Binds all `lobby:*` events to `useRoomStore`. On `lobby:game_starting`, disconnects lobby socket and redirects to `/game/[roomId]`.
- **`useGameEvents()`** — called in `GamePage`. Binds all `game:*` events to `useGameStore`.

### Namespace transition

```
LobbyPage mounts  →  lobbySocket.connect()
                      emit lobby:join
                      listen for lobby:game_starting
                        → lobbySocket.disconnect()
                        → router.push('/game/[roomId]')

GamePage mounts   →  gameSocket.connect({ auth: { playerId, roomId } })
                      listen for game:reconnected  →  hydrate store
```

---

## Animation Plan

| Interaction | Animation |
|---|---|
| Card dealt to player | Card slides + flips from a central deck zone into the player's card row |
| Hit — new card arrives | Card flips in from top, lands in your number row |
| Bust | Self panel shakes (wiggle keyframe), red flash overlay on panel |
| Flip 7 | Gold particles burst from the panel, panel border glows gold |
| Freeze applied | Ice-blue sweep animation over target's panel |
| Player joins/leaves lobby | `AnimatePresence` scale+fade on `PlayerTile` |
| Round end overlay | Slides up from bottom, score numbers count up with staggered delay |
| Turn timer | CSS progress bar; turns red + pulses when under 5s |
| Phase badge in header | Cross-fade between phase labels |
| BustWarningModal | Scale-in from center over self panel |
| SelectTargetModal | Slide up from bottom edge |

Cards use Framer Motion `layoutId` so the engine can animate them moving from the deck indicator into the correct card row.

---

## Mobile Responsiveness

The single-column layout (header → scroll → self panel) is inherently mobile-friendly. The only adjustments at `< 640px`:

| Element | Desktop | Mobile (`< 640px`) |
|---|---|---|
| Header labels | "Round 2", "Deck: 47", phase text | "Rd 2", "47 🃏", phase dot only |
| Opponent panel scores | `+21 pts │ 145 total` | `21 │ 145` (drop "pts"/"total" labels) |
| Card size (opponent) | ~40×56px | ~32×44px |
| Card size (self) | ~44×60px | ~36×50px |
| Action buttons | Large pill, side by side | Full-width, side by side |
| Self panel height | ~200px | ~180px |
| SelectTargetModal | Centered grid of tiles | Full-width stacked list |

No layout restructuring at any breakpoint — just tighter spacing and smaller cards.

---

## File Structure

```
apps/web/
├── index.html
├── vite.config.ts
├── src/
│   ├── main.tsx                        →  ReactDOM.createRoot, <RouterProvider>
│   ├── router.tsx                      →  createBrowserRouter, all routes defined here
│   ├── pages/
│   │   ├── HomePage.tsx
│   │   ├── JoinPage.tsx
│   │   ├── LobbyPage.tsx
│   │   └── GamePage.tsx
│   │
│   ├── components/
│   │   ├── lobby/
│   │   │   ├── PlayerTile.tsx
│   │   │   └── ShareLink.tsx
│   │   └── game/
│   │       ├── GameHeader.tsx
│   │       ├── OpponentPanel.tsx
│   │       ├── SelfPanel.tsx
│   │       ├── CardComponent.tsx       ←  shared leaf component
│   │       ├── CardRow.tsx             ←  single row of cards (action/mod or number)
│   │       ├── PanelHeader.tsx         ←  rank + name + status + scores row
│   │       ├── TurnTimer.tsx
│   │       ├── ActionBar.tsx
│   │       ├── BustWarningModal.tsx
│   │       ├── SelectTargetModal.tsx
│   │       ├── RoundEndOverlay.tsx
│   │       └── GameOverScreen.tsx
│   │
│   ├── store/
│   │   ├── usePlayerStore.ts
│   │   ├── useRoomStore.ts
│   │   └── useGameStore.ts
│   │
│   ├── hooks/
│   │   ├── useLobbyEvents.ts
│   │   └── useGameEvents.ts
│   │
│   └── lib/
│       ├── socket.ts                   ←  lobbySocket + gameSocket singletons
│       └── cardColors.ts              ←  card value/type → color/label mapping
```

---

## Build Order

1. Scaffold React + Vite app — Tailwind, Framer Motion, Zustand, react-router-dom, socket.io-client, Google Fonts
2. Global CSS — CSS variables for the color palette, felt texture, Fredoka font
3. `CardComponent` + `CardRow` — pure visual, no data, test all card types and colors
4. `HomePage` — create room form (HTTP) + join form (redirect)
5. `JoinPage` — display name + code input, redirects to lobby
6. `LobbyPage` — socket connect, `useLobbyEvents`, `PlayerTile` grid, share link, start button
7. `useGameStore` + `useGameEvents` — full socket wiring, all event handlers
8. `GamePage` shell — sticky header + scrollable opponent column + sticky self panel (layout only)
9. `OpponentPanel` + `SelfPanel` — `PanelHeader`, `CardRow`, scores, status chips
10. `ActionBar` + `TurnTimer` — HIT/STAY, countdown, your-turn state
11. `BustWarningModal` + `SelectTargetModal` — overlays with timers
12. `RoundEndOverlay` + `GameOverScreen`
13. Animations pass — dealing, card flip, bust shake, Flip 7 glow, overlay transitions
