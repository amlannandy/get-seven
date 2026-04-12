import { Card } from './card.types';

export type GamePhase =
  | 'dealing' // initial deal in progress
  | 'player_turn' // a player is deciding hit/stay
  | 'bust_pending' // duplicate drawn — waiting for second chance response
  | 'flip_three' // player is forced to draw 3 cards
  | 'round_end' // tallying scores, brief pause before next round
  | 'game_over'; // someone hit 200

export type PlayerStatus =
  | 'active' // still in the round, can hit/stay
  | 'stayed' // chose to bank points
  | 'busted' // drew a duplicate number
  | 'frozen' // received a Freeze card (counts as stayed)
  | 'flip7'; // collected 7 unique number cards

export interface PlayerRoundState {
  playerId: string;
  hand: Card[]; // all cards in front of the player
  numberSum: number; // sum of number cards only
  hasTimesTwo: boolean; // whether a ×2 modifier is in hand
  flatBonuses: number; // sum of all +N modifier cards
  hasSecondChance: boolean; // unused Second Chance card is held
  status: PlayerStatus;
  roundScore: number; // 0 until the player has a final score
  flipThreeRemaining: number; // 0 normally; 1–3 when forced to draw
}

export interface GameState {
  roomId: string;
  phase: GamePhase;
  round: number;
  deck: Card[]; // server-only; never sent to clients
  discardPile: Card[];
  playerStates: PlayerRoundState[];
  playerOrder: string[]; // playerIds in seat order
  activePlayerIndex: number; // index into playerOrder
  dealerIndex: number; // rotates each round
  bustPendingPlayerId: string | null; // set during bust_pending phase
  cumulativeScores: Record<string, number>; // playerId → total across rounds
  winnerId: string | null;
  lastAction: GameAction | null;
}

export interface GameAction {
  type: string;
  playerId: string;
  card?: Card;
  targetPlayerId?: string;
  payload?: unknown;
}

// ─── Public (client-safe) view of game state ────────────────────────────────

export interface PublicPlayerState {
  playerId: string;
  displayName: string;
  hand: Card[];
  status: PlayerStatus;
  roundScore: number;
  totalScore: number;
}

export interface PublicGameState {
  phase: GamePhase;
  round: number;
  deckSize: number; // count only — no peeking
  activePlayerId: string | null;
  bustPendingPlayerId: string | null;
  playerStates: PublicPlayerState[];
  lastAction: GameAction | null;
}
