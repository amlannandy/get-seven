import { Test } from '@nestjs/testing';
import {
  ACTION_CARD_COUNTS,
  ActionCard,
  DECK_TOTAL,
  MODIFIER_CARD_COUNTS,
  ModifierCard,
  NUMBER_CARD_COUNTS,
  NumberCard,
} from '@flip7/shared';

import { DeckService } from './deck.service';

describe('DeckService', () => {
  let service: DeckService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [DeckService],
    }).compile();
    service = module.get(DeckService);
  });

  describe('buildDeck', () => {
    it('produces exactly DECK_TOTAL cards', () => {
      expect(service.buildDeck()).toHaveLength(DECK_TOTAL);
    });

    it('produces the correct number of each number card', () => {
      const deck = service.buildDeck();
      const numberCards = deck.filter(
        (c): c is NumberCard => c.type === 'number',
      );

      for (const [valueStr, expectedCount] of Object.entries(
        NUMBER_CARD_COUNTS,
      )) {
        const value = Number(valueStr);
        const actual = numberCards.filter((c) => c.value === value).length;
        expect(actual).toBe(expectedCount);
      }
    });

    it('produces the correct number of each modifier card', () => {
      const deck = service.buildDeck();
      const modCards = deck.filter(
        (c): c is ModifierCard => c.type === 'modifier',
      );

      for (const [modifier, expectedCount] of Object.entries(
        MODIFIER_CARD_COUNTS,
      )) {
        const actual = modCards.filter((c) => c.modifier === modifier).length;
        expect(actual).toBe(expectedCount);
      }
    });

    it('produces the correct number of each action card', () => {
      const deck = service.buildDeck();
      const actionCards = deck.filter(
        (c): c is ActionCard => c.type === 'action',
      );

      for (const [action, expectedCount] of Object.entries(
        ACTION_CARD_COUNTS,
      )) {
        const actual = actionCards.filter((c) => c.action === action).length;
        expect(actual).toBe(expectedCount);
      }
    });

    it('gives every card a unique id', () => {
      const deck = service.buildDeck();
      const ids = deck.map((c) => c.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(deck.length);
    });

    it('is deterministic — same order every call', () => {
      const a = service.buildDeck();
      const b = service.buildDeck();
      expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    });
  });

  describe('shuffle', () => {
    it('keeps all cards — no additions or removals', () => {
      const deck = service.buildDeck();
      const before = new Set(deck.map((c) => c.id));
      service.shuffle(deck);
      const after = new Set(deck.map((c) => c.id));
      expect(after).toEqual(before);
    });

    it('produces a different order with a random RNG', () => {
      const a = service.buildDeck();
      const b = [...a]; // copy before mutating
      service.shuffle(a);
      // Statistically near-impossible for 94 cards to stay in identical order
      expect(a.map((c) => c.id)).not.toEqual(b.map((c) => c.id));
    });

    it('produces a deterministic order given a seeded RNG', () => {
      const seeded = mulberry32(42);
      const a = service.buildDeck();
      const b = service.buildDeck();
      service.shuffle(a, mulberry32(42));
      service.shuffle(b, seeded);
      expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    });
  });

  describe('buildShuffledDeck', () => {
    it('returns DECK_TOTAL cards', () => {
      expect(service.buildShuffledDeck()).toHaveLength(DECK_TOTAL);
    });

    it('contains all the same cards as buildDeck', () => {
      const base = new Set(service.buildDeck().map((c) => c.id));
      const shuffled = new Set(service.buildShuffledDeck().map((c) => c.id));
      expect(shuffled).toEqual(base);
    });
  });
});

// Simple seeded PRNG (mulberry32) for deterministic shuffle tests
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}
