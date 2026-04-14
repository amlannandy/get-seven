import { create } from 'zustand';
import type { PublicGameState, Card, ActionKind } from '@flip7/shared';

interface BustWarning {
  duplicateCard: Card;
  hasSecondChance: boolean;
  windowMs: number;
}

interface SelectTargetPrompt {
  action: ActionKind;
  validTargetIds: string[];
  expiresAt: number;
}

interface RoundEndSummary {
  roundNumber: number;
  roundScores: Record<string, number>;
  cumulativeScores: Record<string, number>;
  flip7PlayerId: string | null;
}

interface GameOver {
  winnerId: string;
  winnerName: string;
  finalScores: Record<string, number>;
}

interface GameState {
  gameState: PublicGameState | null;
  yourPlayerId: string | null;

  // from game:your_turn
  turnExpiresAt: number | null;

  // from game:bust_warning
  bustWarning: BustWarning | null;

  // from game:select_target
  selectTargetPrompt: SelectTargetPrompt | null;

  // from game:round_end
  lastRoundEnd: RoundEndSummary | null;

  // from game:over
  gameOver: GameOver | null;

  // actions
  setGameState: (gameState: PublicGameState, yourPlayerId: string) => void;
  updateGameState: (gameState: PublicGameState) => void;
  setTurnExpiry: (expiresAt: number) => void;
  clearTurnExpiry: () => void;
  setBustWarning: (warning: BustWarning) => void;
  clearBustWarning: () => void;
  setSelectTargetPrompt: (prompt: SelectTargetPrompt) => void;
  clearSelectTargetPrompt: () => void;
  setRoundEnd: (summary: RoundEndSummary) => void;
  clearRoundEnd: () => void;
  setGameOver: (result: GameOver) => void;
  resetGame: () => void;
}

export const useGameStore = create<GameState>()((set) => ({
  gameState: null,
  yourPlayerId: null,
  turnExpiresAt: null,
  bustWarning: null,
  selectTargetPrompt: null,
  lastRoundEnd: null,
  gameOver: null,

  setGameState: (gameState, yourPlayerId) =>
    set({ gameState, yourPlayerId }),

  updateGameState: (gameState) =>
    set({ gameState }),

  setTurnExpiry: (expiresAt) =>
    set({ turnExpiresAt: expiresAt }),

  clearTurnExpiry: () =>
    set({ turnExpiresAt: null }),

  setBustWarning: (warning) =>
    set({ bustWarning: warning }),

  clearBustWarning: () =>
    set({ bustWarning: null }),

  setSelectTargetPrompt: (prompt) =>
    set({ selectTargetPrompt: prompt }),

  clearSelectTargetPrompt: () =>
    set({ selectTargetPrompt: null }),

  setRoundEnd: (summary) =>
    set({ lastRoundEnd: summary }),

  clearRoundEnd: () =>
    set({ lastRoundEnd: null }),

  setGameOver: (result) =>
    set({ gameOver: result }),

  resetGame: () =>
    set({
      gameState: null,
      yourPlayerId: null,
      turnExpiresAt: null,
      bustWarning: null,
      selectTargetPrompt: null,
      lastRoundEnd: null,
      gameOver: null,
    }),
}));
