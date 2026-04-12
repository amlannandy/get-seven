import type { ActionCard, Card } from './card.types';

export type GamePhase =
  | 'dealing' // server is dealing the initial card to each player
  | 'player_turn' // active player decides hit/stay
  | 'bust_pending' // duplicate drawn — waiting for second chance response (5s)
  | 'action_pending' // action card drawn — waiting for player to choose a target (15s)
  | 'flip_three' // active player is forced to draw 3 cards
  | 'round_end' // scores tallied, brief pause before next round
  | 'game_over'; // someone reached WINNING_SCORE

export type PlayerStatus =
  | 'active' // still in the round, can hit/stay
  | 'stayed' // chose to bank points
  | 'busted' // drew a duplicate number — scores 0 this round
  | 'frozen' // received a Freeze card — treated as stayed
  | 'flip7'; // collected 7 unique number cards — round over

export interface PlayerRoundState {
  playerId: string;
  hand: Card[]; // all cards visible in front of the player
  numberSum: number; // running sum of number cards only
  hasTimesTwo: boolean; // ×2 modifier is in hand
  flatBonuses: number; // sum of all +N modifier cards
  hasSecondChance: boolean; // unused Second Chance card held
  status: PlayerStatus;
  roundScore: number; // 0 until the player has a final score for the round
  flipThreeRemaining: number; // 0 normally; counts down (3→2→1→0) during flip_three
  deferredActions: Array<{ card: ActionCard; appliedToSelf: boolean }>; // resolved after flip_three
}

export interface GameState {
  roomId: string;
  phase: GamePhase;
  round: number;
  deck: Card[]; // server-only — never sent to clients
  discardPile: Card[];
  playerStates: PlayerRoundState[];
  playerOrder: string[]; // playerIds in seat/deal order
  activePlayerIndex: number; // index into playerOrder
  dealerIndex: number; // rotates each round (new dealer = next seat)
  dealProgress: number; // how many players have received their initial card
  bustPendingPlayerId: string | null; // set during bust_pending
  bustDuplicateCard: Card | null; // the duplicate that triggered the bust
  pendingActionCard: ActionCard | null; // set during action_pending
  cumulativeScores: Record<string, number>; // playerId → total across all rounds
  winnerId: string | null;
  lastAction: GameAction | null; // most recent action (for client animation cues)
}

export interface GameAction {
  type: string;
  playerId: string;
  card?: Card;
  targetPlayerId?: string;
  payload?: unknown;
}

// ─── Public (client-safe) view — deck contents never exposed ─────────────────

export interface PublicPlayerState {
  playerId: string;
  displayName: string;
  hand: Card[];
  status: PlayerStatus;
  roundScore: number;
  totalScore: number;
  flipThreeRemaining: number;
}

export interface PublicGameState {
  phase: GamePhase;
  round: number;
  deckSize: number; // count only — no peeking
  activePlayerId: string | null;
  bustPendingPlayerId: string | null;
  pendingActionCard: ActionCard | null; // clients see what card needs a target
  playerStates: PublicPlayerState[];
  lastAction: GameAction | null;
}
