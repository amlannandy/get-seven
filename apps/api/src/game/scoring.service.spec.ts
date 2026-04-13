import { Test } from '@nestjs/testing';
import { WINNING_SCORE } from '@flip7/shared';
import type { GameState, PlayerRoundState } from '@flip7/shared';

import { ScoringService } from './scoring.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePlayer(
  overrides: Partial<PlayerRoundState> = {},
): PlayerRoundState {
  return {
    playerId: 'p1',
    hand: [],
    numberSum: 0,
    hasTimesTwo: false,
    flatBonuses: 0,
    hasSecondChance: false,
    status: 'stayed',
    roundScore: 0,
    flipThreeRemaining: 0,
    deferredActions: [],
    ...overrides,
  };
}

function makeState(
  players: PlayerRoundState[],
  cumulativeScores: Record<string, number> = {},
): GameState {
  return {
    roomId: 'room1',
    phase: 'round_end',
    round: 1,
    deck: [],
    discardPile: [],
    playerStates: players,
    playerOrder: players.map((p) => p.playerId),
    activePlayerIndex: 0,
    dealerIndex: 0,
    dealProgress: players.length,
    bustPendingPlayerId: null,
    bustDuplicateCard: null,
    pendingActionCard: null,
    cumulativeScores,
    winnerId: null,
    lastAction: null,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ScoringService', () => {
  let service: ScoringService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ScoringService],
    }).compile();
    service = module.get(ScoringService);
  });

  // ── applyRoundScores ───────────────────────────────────────────────────────

  describe('applyRoundScores', () => {
    it('adds each player roundScore to cumulativeScores', () => {
      const players = [
        makePlayer({ playerId: 'p1', roundScore: 10 }),
        makePlayer({ playerId: 'p2', roundScore: 8 }),
      ];
      const result = service.applyRoundScores(
        makeState(players, { p1: 50, p2: 30 }),
      );
      expect(result.cumulativeScores['p1']).toBe(60);
      expect(result.cumulativeScores['p2']).toBe(38);
    });

    it('initialises from 0 when player has no prior cumulative score', () => {
      const players = [makePlayer({ playerId: 'p1', roundScore: 15 })];
      const result = service.applyRoundScores(makeState(players));
      expect(result.cumulativeScores['p1']).toBe(15);
    });

    it('busted player contributes 0 (roundScore already 0 from engine)', () => {
      const players = [
        makePlayer({ playerId: 'p1', status: 'stayed', roundScore: 12 }),
        makePlayer({ playerId: 'p2', status: 'busted', roundScore: 0 }),
      ];
      const result = service.applyRoundScores(makeState(players));
      expect(result.cumulativeScores['p1']).toBe(12);
      expect(result.cumulativeScores['p2']).toBe(0);
    });

    it('sets winnerId when a player reaches WINNING_SCORE', () => {
      const players = [makePlayer({ playerId: 'p1', roundScore: 50 })];
      const state = makeState(players, { p1: WINNING_SCORE - 50 });
      const result = service.applyRoundScores(state);
      expect(result.winnerId).toBe('p1');
    });

    it('does not set winnerId when no player reaches WINNING_SCORE', () => {
      const players = [makePlayer({ playerId: 'p1', roundScore: 10 })];
      const result = service.applyRoundScores(makeState(players, { p1: 0 }));
      expect(result.winnerId).toBeNull();
    });

    it('picks the highest scorer when multiple players cross WINNING_SCORE in the same round', () => {
      const players = [
        makePlayer({ playerId: 'p1', roundScore: 100 }),
        makePlayer({ playerId: 'p2', roundScore: 80 }),
      ];
      // p1 → 260, p2 → 220 — both over 200, p1 wins
      const result = service.applyRoundScores(
        makeState(players, { p1: 160, p2: 140 }),
      );
      expect(result.winnerId).toBe('p1');
    });

    it('does not mutate the original state', () => {
      const players = [makePlayer({ playerId: 'p1', roundScore: 20 })];
      const original = makeState(players, { p1: 0 });
      const result = service.applyRoundScores(original);
      expect(original.cumulativeScores['p1']).toBe(0);
      expect(result).not.toBe(original);
    });
  });
});
