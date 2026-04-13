import { Test } from '@nestjs/testing';
import { GAME_STATE_TTL_SECONDS } from '@flip7/shared';
import type { GameState } from '@flip7/shared';

import { GameStateService } from './game-state.service';
import { REDIS_CLIENT } from '../redis/redis.module';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    roomId: 'room1',
    phase: 'player_turn',
    round: 1,
    deck: [],
    discardPile: [],
    playerStates: [],
    playerOrder: [],
    activePlayerIndex: 0,
    dealerIndex: 0,
    dealProgress: 0,
    bustPendingPlayerId: null,
    bustDuplicateCard: null,
    pendingActionCard: null,
    cumulativeScores: {},
    winnerId: null,
    lastAction: null,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GameStateService', () => {
  let service: GameStateService;
  let redisMock: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    redisMock = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    const module = await Test.createTestingModule({
      providers: [
        GameStateService,
        { provide: REDIS_CLIENT, useValue: redisMock },
      ],
    }).compile();

    service = module.get(GameStateService);
  });

  // ── getState ────────────────────────────────────────────────────────────────

  describe('getState', () => {
    it('returns null when the key does not exist', async () => {
      redisMock.get.mockResolvedValue(null);
      expect(await service.getState('room1')).toBeNull();
      expect(redisMock.get).toHaveBeenCalledWith('game:room1');
    });

    it('deserializes and returns the state when the key exists', async () => {
      const state = makeState({ roomId: 'room1', round: 3 });
      redisMock.get.mockResolvedValue(JSON.stringify(state));
      const result = await service.getState('room1');
      expect(result).toEqual(state);
    });
  });

  // ── setState ────────────────────────────────────────────────────────────────

  describe('setState', () => {
    it('serializes the state and writes it with the correct key and TTL', async () => {
      const state = makeState();
      await service.setState('room1', state);
      expect(redisMock.set).toHaveBeenCalledWith(
        'game:room1',
        JSON.stringify(state),
        'EX',
        GAME_STATE_TTL_SECONDS,
      );
    });
  });

  // ── updateState ─────────────────────────────────────────────────────────────

  describe('updateState', () => {
    it('applies the updater and writes back the result', async () => {
      const initial = makeState({ round: 1 });
      redisMock.get.mockResolvedValue(JSON.stringify(initial));

      const result = await service.updateState('room1', (s) => ({
        ...s,
        round: 2,
      }));

      expect(result.round).toBe(2);
      expect(redisMock.set).toHaveBeenCalledWith(
        'game:room1',
        JSON.stringify({ ...initial, round: 2 }),
        'EX',
        GAME_STATE_TTL_SECONDS,
      );
    });

    it('throws when no state exists for the room', async () => {
      redisMock.get.mockResolvedValue(null);
      await expect(service.updateState('room1', (s) => s)).rejects.toThrow(
        'No game state found for room room1',
      );
    });
  });

  // ── deleteState ─────────────────────────────────────────────────────────────

  describe('deleteState', () => {
    it('deletes the key for the given roomId', async () => {
      await service.deleteState('room1');
      expect(redisMock.del).toHaveBeenCalledWith('game:room1');
    });
  });
});
