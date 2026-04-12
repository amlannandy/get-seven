export const WINNING_SCORE = 200;
export const FLIP7_BONUS = 15;
export const FLIP7_UNIQUE_CARDS_NEEDED = 7;
export const TURN_TIMEOUT_MS = 30_000;
export const SECOND_CHANCE_WINDOW_MS = 5_000;
export const ROUND_END_PAUSE_MS = 5_000;
export const MIN_PLAYERS_TO_START = 2;
export const MAX_PLAYERS = 18;
export const ROOM_CODE_LENGTH = 6;
export const GAME_STATE_TTL_SECONDS = 7_200; // 2 hours
export const SESSION_TTL_SECONDS = 1_800; // 30 minutes
export const ROOM_CLEANUP_DELAY_MS = 20 * 60 * 1_000; // 20 minutes

// Deck composition
export const DECK_TOTAL = 94;

export const NUMBER_CARD_COUNTS: Record<number, number> = {
  0: 1,
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  10: 10,
  11: 11,
  12: 12,
};

export const MODIFIER_CARD_COUNTS = {
  plus2: 1,
  plus4: 1,
  plus6: 1,
  plus8: 1,
  plus10: 1,
  times2: 1,
} as const;

export const ACTION_CARD_COUNTS = {
  freeze: 3,
  flip_three: 3,
  second_chance: 3,
} as const;
