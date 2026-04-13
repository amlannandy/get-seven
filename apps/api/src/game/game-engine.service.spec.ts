import { Test } from '@nestjs/testing';
import type {
  ActionCard,
  Card,
  GameState,
  ModifierCard,
  NumberCard,
  PlayerRoundState,
} from '@flip7/shared';

import { GameEngineService } from './game-engine.service';
import { DeckService } from './deck.service';
import { ScoringService } from './scoring.service';

// ─── Card factories ───────────────────────────────────────────────────────────

function num(value: number, copy = 0): NumberCard {
  return { id: `num_${value}_${copy}`, type: 'number', value };
}

function mod(modifier: ModifierCard['modifier'], copy = 0): ModifierCard {
  return { id: `mod_${modifier}_${copy}`, type: 'modifier', modifier };
}

function act(action: ActionCard['action'], copy = 0): ActionCard {
  return { id: `act_${action}_${copy}`, type: 'action', action };
}

// ─── State factory ────────────────────────────────────────────────────────────

function makePlayer(
  id: string,
  overrides: Partial<PlayerRoundState> = {},
): PlayerRoundState {
  return {
    playerId: id,
    hand: [],
    numberSum: 0,
    hasTimesTwo: false,
    flatBonuses: 0,
    hasSecondChance: false,
    status: 'active',
    roundScore: 0,
    flipThreeRemaining: 0,
    deferredActions: [],
    ...overrides,
  };
}

function makeState(
  players: PlayerRoundState[],
  deck: Card[] = [],
  overrides: Partial<GameState> = {},
): GameState {
  return {
    roomId: 'room1',
    phase: 'player_turn',
    round: 1,
    deck,
    discardPile: [],
    playerStates: players,
    playerOrder: players.map((p) => p.playerId),
    activePlayerIndex: 0,
    dealerIndex: 0,
    dealProgress: 0,
    bustPendingPlayerId: null,
    bustDuplicateCard: null,
    pendingActionCard: null,
    cumulativeScores: Object.fromEntries(players.map((p) => [p.playerId, 0])),
    winnerId: null,
    lastAction: null,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GameEngineService', () => {
  let engine: GameEngineService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [GameEngineService, DeckService, ScoringService],
    }).compile();
    engine = module.get(GameEngineService);
  });

  // ── initRound ───────────────────────────────────────────────────────────────

  describe('initRound', () => {
    it('creates player states for every player', () => {
      const state = engine.initRound({
        roomId: 'r1',
        round: 1,
        players: [
          { id: 'p1', displayName: 'Alice', seatIndex: 0 },
          { id: 'p2', displayName: 'Bob', seatIndex: 1 },
        ],
        dealerIndex: 0,
        cumulativeScores: { p1: 50, p2: 30 },
        deck: [],
      });
      expect(state.playerStates).toHaveLength(2);
      expect(state.playerOrder).toEqual(['p1', 'p2']);
    });

    it('sorts players by seatIndex', () => {
      const state = engine.initRound({
        roomId: 'r1',
        round: 1,
        players: [
          { id: 'p3', displayName: 'C', seatIndex: 2 },
          { id: 'p1', displayName: 'A', seatIndex: 0 },
          { id: 'p2', displayName: 'B', seatIndex: 1 },
        ],
        dealerIndex: 0,
        cumulativeScores: {},
        deck: [],
      });
      expect(state.playerOrder).toEqual(['p1', 'p2', 'p3']);
    });

    it('initialises every player as active with empty hand', () => {
      const state = engine.initRound({
        roomId: 'r1',
        round: 1,
        players: [{ id: 'p1', displayName: 'A', seatIndex: 0 }],
        dealerIndex: 0,
        cumulativeScores: {},
        deck: [],
      });
      const ps = state.playerStates[0];
      expect(ps.status).toBe('active');
      expect(ps.hand).toHaveLength(0);
      expect(ps.numberSum).toBe(0);
    });

    it('preserves cumulativeScores', () => {
      const state = engine.initRound({
        roomId: 'r1',
        round: 1,
        players: [{ id: 'p1', displayName: 'A', seatIndex: 0 }],
        dealerIndex: 0,
        cumulativeScores: { p1: 120 },
        deck: [],
      });
      expect(state.cumulativeScores['p1']).toBe(120);
    });

    it('starts in dealing phase', () => {
      const state = engine.initRound({
        roomId: 'r1',
        round: 1,
        players: [{ id: 'p1', displayName: 'A', seatIndex: 0 }],
        dealerIndex: 0,
        cumulativeScores: {},
        deck: [],
      });
      expect(state.phase).toBe('dealing');
    });
  });

  // ── applyDeal ───────────────────────────────────────────────────────────────

  describe('applyDeal', () => {
    it('deals top card to the player after the dealer', () => {
      const players = [makePlayer('p1'), makePlayer('p2'), makePlayer('p3')];
      // dealerIndex=0, so first deal target is index 1 (p2)
      const state = makeState(players, [num(5), num(3)], {
        phase: 'dealing',
        dealerIndex: 0,
        dealProgress: 0,
      });
      const { card, targetPlayerId } = engine.applyDeal(state);
      expect(targetPlayerId).toBe('p2');
      expect(card).toEqual(num(5));
    });

    it('increments dealProgress after each deal', () => {
      const players = [makePlayer('p1'), makePlayer('p2')];
      const state = makeState(players, [num(5), num(3)], {
        phase: 'dealing',
        dealerIndex: 0,
        dealProgress: 0,
      });
      const { newState } = engine.applyDeal(state);
      expect(newState.dealProgress).toBe(1);
    });

    it('transitions to player_turn after all players dealt', () => {
      const players = [makePlayer('p1'), makePlayer('p2')];
      // dealerIndex=1 means p1 gets dealt first (index (1+1+0)%2=0)
      let state = makeState(players, [num(5), num(3)], {
        phase: 'dealing',
        dealerIndex: 1,
        dealProgress: 0,
      });
      // Deal to p1
      ({ newState: state } = engine.applyDeal(state));
      // Deal to p2 — should trigger transition
      const { newState: finalState } = engine.applyDeal(state);
      expect(finalState.phase).toBe('player_turn');
    });

    it('auto-freezes recipient when dealt a Freeze card', () => {
      const players = [makePlayer('p1'), makePlayer('p2')];
      const state = makeState(players, [act('freeze')], {
        phase: 'dealing',
        dealerIndex: 0,
        dealProgress: 0,
      });
      const { newState } = engine.applyDeal(state);
      const target = newState.playerStates.find((p) => p.playerId === 'p2')!;
      expect(target.status).toBe('frozen');
    });

    it('gives Second Chance to recipient when dealt that card', () => {
      const players = [makePlayer('p1'), makePlayer('p2')];
      const state = makeState(players, [act('second_chance')], {
        phase: 'dealing',
        dealerIndex: 0,
        dealProgress: 0,
      });
      const { newState } = engine.applyDeal(state);
      const target = newState.playerStates.find((p) => p.playerId === 'p2')!;
      expect(target.hasSecondChance).toBe(true);
    });

    it('rebuilds and deals from a fresh deck when deck is empty', () => {
      // Empty deck, no discard pile, no cards in hand — rebuildDeck produces full deck
      const state = makeState([makePlayer('p1')], [], { phase: 'dealing' });
      const { newState, card } = engine.applyDeal(state);
      expect(card).toBeDefined();
      expect(newState.deck.length).toBeGreaterThan(0);
    });
  });

  // ── applyHit — number cards ─────────────────────────────────────────────────

  describe('applyHit — number cards', () => {
    it('returns number_ok and adds card to hand, updating live roundScore', () => {
      const state = makeState([makePlayer('p1')], [num(5)]);
      const result = engine.applyHit(state, num(5));
      expect(result.event).toBe('number_ok');
      const ps = result.newState.playerStates[0];
      expect(ps.hand).toContainEqual(num(5));
      expect(ps.numberSum).toBe(5);
      expect(ps.roundScore).toBe(5);
    });

    it('removes drawn card from deck', () => {
      const deck = [num(5), num(3)];
      const state = makeState([makePlayer('p1')], deck);
      const result = engine.applyHit(state, num(5));
      expect(result.newState.deck).not.toContainEqual(num(5));
      expect(result.newState.deck).toContainEqual(num(3));
    });

    it('returns bust when a duplicate number is drawn', () => {
      const player = makePlayer('p1', { hand: [num(5)], numberSum: 5 });
      const state = makeState([player]);
      const result = engine.applyHit(state, num(5, 1));
      expect(result.event).toBe('bust');
      if (result.event === 'bust') {
        expect(result.hasSecondChance).toBe(false);
        expect(result.newState.bustPendingPlayerId).toBe('p1');
        expect(result.newState.phase).toBe('bust_pending');
      }
    });

    it('bust result includes hasSecondChance=true when player holds SC', () => {
      const scCard = act('second_chance');
      const player = makePlayer('p1', {
        hand: [num(5), scCard],
        numberSum: 5,
        hasSecondChance: true,
      });
      const state = makeState([player]);
      const result = engine.applyHit(state, num(5, 1));
      expect(result.event).toBe('bust');
      if (result.event === 'bust') {
        expect(result.hasSecondChance).toBe(true);
      }
    });

    it('returns flip7 when player draws their 7th unique number, roundScore includes bonus', () => {
      const hand: Card[] = [num(1), num(2), num(3), num(4), num(5), num(6)];
      const player = makePlayer('p1', { hand, numberSum: 21, roundScore: 21 });
      const state = makeState([player]);
      const result = engine.applyHit(state, num(7));
      expect(result.event).toBe('flip7');
      if (result.event === 'flip7') {
        const ps = result.newState.playerStates[0];
        expect(ps.status).toBe('flip7');
        expect(result.newState.phase).toBe('round_end');
        expect(ps.roundScore).toBe(21 + 7 + 15); // 1+2+3+4+5+6+7 + FLIP7_BONUS
      }
    });

    it('counts unique numbers correctly — duplicate values do not count twice', () => {
      // p1 already has 6 unique numbers, one of which is a second copy of 3
      const hand: Card[] = [num(1), num(2), num(3), num(3, 1), num(5), num(6)];
      const player = makePlayer('p1', { hand, numberSum: 20 });
      const state = makeState([player]);
      // Drawing num(4) — only 5 unique so far (1,2,3,5,6), so total becomes 6 unique — NOT flip7 yet
      const result = engine.applyHit(state, num(4));
      expect(result.event).toBe('number_ok');
    });
  });

  // ── applyHit — modifier cards ───────────────────────────────────────────────

  describe('applyHit — modifier cards', () => {
    it('adds flat bonus modifier to player totals', () => {
      const state = makeState([makePlayer('p1')]);
      const result = engine.applyHit(state, mod('plus6'));
      expect(result.event).toBe('modifier_added');
      const ps = result.newState.playerStates[0];
      expect(ps.flatBonuses).toBe(6);
      expect(ps.hand).toContainEqual(mod('plus6'));
    });

    it('sets hasTimesTwo for ×2 modifier and doubles live roundScore', () => {
      const player = makePlayer('p1', { numberSum: 10, roundScore: 10 });
      const state = makeState([player]);
      const result = engine.applyHit(state, mod('times2'));
      expect(result.event).toBe('modifier_added');
      const ps = result.newState.playerStates[0];
      expect(ps.hasTimesTwo).toBe(true);
      expect(ps.roundScore).toBe(20); // 10 * 2
    });
  });

  // ── applyHit — action cards ─────────────────────────────────────────────────

  describe('applyHit — action cards', () => {
    it('prompts for target when second_chance is drawn and valid targets exist', () => {
      // p1 does not have a SC — they are a valid target for themselves
      const state = makeState([makePlayer('p1')]);
      const result = engine.applyHit(state, act('second_chance'));
      expect(result.event).toBe('action_target_needed');
      if (result.event !== 'action_target_needed') return;
      expect(result.validTargets).toContain('p1');
      expect(result.newState.phase).toBe('action_pending');
    });

    it('auto-discards second_chance when player already has one', () => {
      const player = makePlayer('p1', {
        hand: [act('second_chance')],
        hasSecondChance: true,
      });
      const state = makeState([player]);
      const result = engine.applyHit(state, act('second_chance', 1));
      expect(result.event).toBe('second_chance_received');
      // Card goes to discard, not hand
      expect(result.newState.discardPile).toContainEqual(
        act('second_chance', 1),
      );
      expect(result.newState.playerStates[0].hasSecondChance).toBe(true);
    });

    it('returns action_target_needed for freeze card', () => {
      const players = [makePlayer('p1'), makePlayer('p2')];
      const state = makeState(players);
      const result = engine.applyHit(state, act('freeze'));
      expect(result.event).toBe('action_target_needed');
      if (result.event === 'action_target_needed') {
        expect(result.validTargets).toContain('p1');
        expect(result.validTargets).toContain('p2');
        expect(result.newState.phase).toBe('action_pending');
        expect(result.newState.pendingActionCard).toEqual(act('freeze'));
      }
    });

    it('returns action_target_needed for flip_three card', () => {
      const players = [makePlayer('p1'), makePlayer('p2')];
      const state = makeState(players);
      const result = engine.applyHit(state, act('flip_three'));
      expect(result.event).toBe('action_target_needed');
      if (result.event === 'action_target_needed') {
        expect(result.newState.pendingActionCard).toEqual(act('flip_three'));
      }
    });

    it('valid targets only includes active players', () => {
      const players = [
        makePlayer('p1'),
        makePlayer('p2', { status: 'stayed' }),
        makePlayer('p3'),
      ];
      const state = makeState(players);
      const result = engine.applyHit(state, act('freeze'));
      if (result.event === 'action_target_needed') {
        expect(result.validTargets).toContain('p1');
        expect(result.validTargets).not.toContain('p2');
        expect(result.validTargets).toContain('p3');
      }
    });
  });

  // ── applyStay ───────────────────────────────────────────────────────────────

  describe('applyStay', () => {
    it('marks active player as stayed', () => {
      const state = makeState([makePlayer('p1'), makePlayer('p2')]);
      const newState = engine.applyStay(state);
      expect(newState.playerStates[0].status).toBe('stayed');
    });

    it('does not affect other players', () => {
      const state = makeState([makePlayer('p1'), makePlayer('p2')]);
      const newState = engine.applyStay(state);
      expect(newState.playerStates[1].status).toBe('active');
    });
  });

  // ── applyActionTarget ───────────────────────────────────────────────────────

  describe('applyActionTarget', () => {
    it('freezes the target player', () => {
      const players = [makePlayer('p1'), makePlayer('p2')];
      const state = makeState(players, [], {
        phase: 'action_pending',
        pendingActionCard: act('freeze'),
      });
      const newState = engine.applyActionTarget(state, 'p2');
      const target = newState.playerStates.find((p) => p.playerId === 'p2')!;
      expect(target.status).toBe('frozen');
      expect(newState.phase).toBe('player_turn');
      expect(newState.pendingActionCard).toBeNull();
    });

    it('gives target player 3 flip_three cards to draw', () => {
      const players = [makePlayer('p1'), makePlayer('p2')];
      const state = makeState(players, [], {
        phase: 'action_pending',
        pendingActionCard: act('flip_three'),
        activePlayerIndex: 0,
      });
      const newState = engine.applyActionTarget(state, 'p2');
      const target = newState.playerStates.find((p) => p.playerId === 'p2')!;
      expect(target.flipThreeRemaining).toBe(3);
      expect(newState.phase).toBe('flip_three');
      // Active player becomes p2
      expect(newState.playerOrder[newState.activePlayerIndex]).toBe('p2');
    });

    it('throws when no pending action card', () => {
      const state = makeState([makePlayer('p1')]);
      expect(() => engine.applyActionTarget(state, 'p1')).toThrow();
    });
  });

  // ── applySecondChance ───────────────────────────────────────────────────────

  describe('applySecondChance', () => {
    it('clears bust pending and removes SC card from hand', () => {
      const scCard = act('second_chance');
      const dupCard = num(5, 1);
      const player = makePlayer('p1', {
        hand: [num(5), scCard],
        numberSum: 5,
        hasSecondChance: true,
      });
      const state = makeState([player], [], {
        phase: 'bust_pending',
        bustPendingPlayerId: 'p1',
        bustDuplicateCard: dupCard,
      });
      const newState = engine.applySecondChance(state);
      expect(newState.bustPendingPlayerId).toBeNull();
      expect(newState.bustDuplicateCard).toBeNull();
      expect(newState.phase).toBe('player_turn');
      const ps = newState.playerStates[0];
      expect(ps.hasSecondChance).toBe(false);
      expect(
        ps.hand.find(
          (c) => c.type === 'action' && c.action === 'second_chance',
        ),
      ).toBeUndefined();
    });

    it('sends duplicate card to discard pile', () => {
      const scCard = act('second_chance');
      const dupCard = num(5, 1);
      const player = makePlayer('p1', {
        hand: [num(5), scCard],
        numberSum: 5,
        hasSecondChance: true,
      });
      const state = makeState([player], [], {
        phase: 'bust_pending',
        bustPendingPlayerId: 'p1',
        bustDuplicateCard: dupCard,
      });
      const newState = engine.applySecondChance(state);
      expect(newState.discardPile).toContainEqual(dupCard);
    });

    it('throws when no bust is pending', () => {
      const state = makeState([makePlayer('p1')]);
      expect(() => engine.applySecondChance(state)).toThrow();
    });
  });

  // ── confirmBust ─────────────────────────────────────────────────────────────

  describe('confirmBust', () => {
    it('marks player as busted, clears bust pending, and zeroes roundScore', () => {
      const dupCard = num(5, 1);
      const player = makePlayer('p1', {
        hand: [num(5)],
        numberSum: 5,
        roundScore: 5,
      });
      const state = makeState([player], [], {
        phase: 'bust_pending',
        bustPendingPlayerId: 'p1',
        bustDuplicateCard: dupCard,
      });
      const newState = engine.confirmBust(state);
      expect(newState.playerStates[0].status).toBe('busted');
      expect(newState.playerStates[0].roundScore).toBe(0);
      expect(newState.bustPendingPlayerId).toBeNull();
      expect(newState.phase).toBe('player_turn');
    });

    it('throws when no bust is pending', () => {
      const state = makeState([makePlayer('p1')]);
      expect(() => engine.confirmBust(state)).toThrow();
    });
  });

  // ── advanceTurn ─────────────────────────────────────────────────────────────

  describe('advanceTurn', () => {
    it('moves to the next active player', () => {
      const players = [makePlayer('p1'), makePlayer('p2'), makePlayer('p3')];
      const state = makeState(players, [], { activePlayerIndex: 0 });
      const newState = engine.advanceTurn(state);
      expect(newState.activePlayerIndex).toBe(1);
    });

    it('skips stayed players', () => {
      const players = [
        makePlayer('p1'),
        makePlayer('p2', { status: 'stayed' }),
        makePlayer('p3'),
      ];
      const state = makeState(players, [], { activePlayerIndex: 0 });
      const newState = engine.advanceTurn(state);
      expect(newState.playerOrder[newState.activePlayerIndex]).toBe('p3');
    });

    it('skips busted, frozen, and flip7 players', () => {
      const players = [
        makePlayer('p1'),
        makePlayer('p2', { status: 'busted' }),
        makePlayer('p3', { status: 'frozen' }),
        makePlayer('p4', { status: 'flip7' }),
        makePlayer('p5'),
      ];
      const state = makeState(players, [], { activePlayerIndex: 0 });
      const newState = engine.advanceTurn(state);
      expect(newState.playerOrder[newState.activePlayerIndex]).toBe('p5');
    });

    it('wraps around the player list', () => {
      const players = [
        makePlayer('p1', { status: 'stayed' }),
        makePlayer('p2'),
        makePlayer('p3'),
      ];
      const state = makeState(players, [], { activePlayerIndex: 2 });
      const newState = engine.advanceTurn(state);
      expect(newState.playerOrder[newState.activePlayerIndex]).toBe('p2');
    });

    it('transitions to round_end when all players are done', () => {
      const players = [
        makePlayer('p1', { status: 'stayed' }),
        makePlayer('p2', { status: 'busted' }),
      ];
      const state = makeState(players, [], { activePlayerIndex: 0 });
      const newState = engine.advanceTurn(state);
      expect(newState.phase).toBe('round_end');
    });
  });

  // ── isRoundOver ─────────────────────────────────────────────────────────────

  describe('isRoundOver', () => {
    it('returns false while any player is active', () => {
      const players = [
        makePlayer('p1'),
        makePlayer('p2', { status: 'stayed' }),
      ];
      expect(engine.isRoundOver(makeState(players))).toBe(false);
    });

    it('returns true when all players are stayed/busted/frozen/flip7', () => {
      const players = [
        makePlayer('p1', { status: 'stayed' }),
        makePlayer('p2', { status: 'busted' }),
        makePlayer('p3', { status: 'frozen' }),
        makePlayer('p4', { status: 'flip7' }),
      ];
      expect(engine.isRoundOver(makeState(players))).toBe(true);
    });
  });

  // ── Flip Three sequence ─────────────────────────────────────────────────────

  describe('Flip Three sequence', () => {
    function stateInFlipThree(extraDeck: Card[] = []): GameState {
      const player = makePlayer('p1', { flipThreeRemaining: 3 });
      return makeState([player], extraDeck, { phase: 'flip_three' });
    }

    it('returns flip_three_card with remaining=2 after first card', () => {
      const state = stateInFlipThree();
      const result = engine.applyHit(state, num(3));
      expect(result.event).toBe('flip_three_card');
      if (result.event === 'flip_three_card') {
        expect(result.remaining).toBe(2);
        expect(result.newState.phase).toBe('flip_three');
      }
    });

    it('returns flip_three_done after third card', () => {
      let state = stateInFlipThree();
      // Draw 3 cards
      let result = engine.applyHit(state, num(1));
      expect(result.event).toBe('flip_three_card');
      state = result.newState;

      result = engine.applyHit(state, num(2));
      expect(result.event).toBe('flip_three_card');
      state = result.newState;

      result = engine.applyHit(state, num(3));
      expect(result.event).toBe('flip_three_done');
      expect(result.newState.phase).toBe('player_turn');
    });

    it('bust mid-sequence stops flip three', () => {
      const player = makePlayer('p1', {
        hand: [num(5)],
        numberSum: 5,
        flipThreeRemaining: 3,
      });
      const state = makeState([player], [], { phase: 'flip_three' });
      const result = engine.applyHit(state, num(5, 1));
      expect(result.event).toBe('bust');
    });

    it('flip7 mid-sequence ends round immediately', () => {
      const hand: Card[] = [num(1), num(2), num(3), num(4), num(5), num(6)];
      const player = makePlayer('p1', {
        hand,
        numberSum: 21,
        flipThreeRemaining: 2,
      });
      const state = makeState([player], [], { phase: 'flip_three' });
      const result = engine.applyHit(state, num(7));
      expect(result.event).toBe('flip7');
      expect(result.newState.phase).toBe('round_end');
    });

    it('defers Freeze card encountered mid-sequence and applies after completion', () => {
      const player = makePlayer('p1', { flipThreeRemaining: 3 });
      const state = makeState([player], [], { phase: 'flip_three' });

      // Card 1: number
      let result = engine.applyHit(state, num(1));
      expect(result.event).toBe('flip_three_card');
      let s = result.newState;

      // Card 2: freeze (should be deferred)
      result = engine.applyHit(s, act('freeze'));
      expect(result.event).toBe('flip_three_card');
      s = result.newState;
      const ps = s.playerStates[0];
      expect(ps.deferredActions).toHaveLength(1);
      expect(ps.deferredActions[0].card.action).toBe('freeze');

      // Card 3: number — sequence ends, deferred freeze prompts for target
      result = engine.applyHit(s, num(2));
      expect(result.event).toBe('action_target_needed');
      if (result.event !== 'action_target_needed') return;
      expect(result.newState.phase).toBe('action_pending');
      expect(result.newState.pendingActionCard?.action).toBe('freeze');
      // Deferred action consumed from the list
      expect(result.newState.playerStates[0].deferredActions).toHaveLength(0);
    });
  });

  // ── Full round mini-simulation ──────────────────────────────────────────────

  describe('full round mini-simulation', () => {
    it('two players: one stays, one busts — round ends', () => {
      const players = [makePlayer('p1'), makePlayer('p2')];
      let state = makeState(players, [], { activePlayerIndex: 0 });

      // p1 hits a 5, then stays
      state = engine.applyHit(state, num(5)).newState;
      state = engine.applyStay(state);
      state = engine.advanceTurn(state);

      // p2 hits a 3, then hits another 3 → bust
      state = engine.applyHit(state, num(3)).newState;
      const bustResult = engine.applyHit(state, num(3, 1));
      expect(bustResult.event).toBe('bust');
      state = engine.confirmBust(bustResult.newState);
      state = engine.advanceTurn(state);

      expect(state.phase).toBe('round_end');
      expect(state.playerStates.find((p) => p.playerId === 'p1')!.status).toBe(
        'stayed',
      );
      expect(state.playerStates.find((p) => p.playerId === 'p2')!.status).toBe(
        'busted',
      );
    });

    it('second chance saves a player from busting', () => {
      const scCard = act('second_chance');
      const player = makePlayer('p1', {
        hand: [num(5), scCard],
        numberSum: 5,
        hasSecondChance: true,
      });
      let state = makeState([player], [], {
        phase: 'player_turn',
        bustPendingPlayerId: null,
        bustDuplicateCard: null,
      });

      const bustResult = engine.applyHit(state, num(5, 1));
      expect(bustResult.event).toBe('bust');
      if (bustResult.event === 'bust') {
        expect(bustResult.hasSecondChance).toBe(true);
        state = engine.applySecondChance(bustResult.newState);
        expect(state.phase).toBe('player_turn');
        expect(state.playerStates[0].status).toBe('active');
        expect(state.playerStates[0].hasSecondChance).toBe(false);
      }
    });
  });
});
