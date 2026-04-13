import { Injectable } from '@nestjs/common';
import {
  ACTION_CARD_COUNTS,
  ActionCard,
  ActionKind,
  Card,
  DECK_TOTAL,
  MODIFIER_CARD_COUNTS,
  ModifierCard,
  ModifierKind,
  NUMBER_CARD_COUNTS,
  NumberCard,
} from '@flip7/shared';

@Injectable()
export class DeckService {
  /**
   * Build the full deck with stable, unique IDs per card instance.
   */
  buildDeck(): Card[] {
    const cards: Card[] = [];

    for (const [valueStr, count] of Object.entries(NUMBER_CARD_COUNTS)) {
      const value = Number(valueStr);
      for (let i = 0; i < count; i++) {
        cards.push({
          id: `num_${value}_${i}`,
          type: 'number',
          value,
        } satisfies NumberCard);
      }
    }

    for (const [modifierStr, count] of Object.entries(MODIFIER_CARD_COUNTS)) {
      const modifier = modifierStr as ModifierKind;
      for (let i = 0; i < count; i++) {
        cards.push({
          id: `mod_${modifier}_${i}`,
          type: 'modifier',
          modifier,
        } satisfies ModifierCard);
      }
    }

    for (const [actionStr, count] of Object.entries(ACTION_CARD_COUNTS)) {
      const action = actionStr as ActionKind;
      for (let i = 0; i < count; i++) {
        cards.push({
          id: `act_${action}_${i}`,
          type: 'action',
          action,
        } satisfies ActionCard);
      }
    }

    if (cards.length !== DECK_TOTAL) {
      throw new Error(
        `Deck size mismatch: expected ${DECK_TOTAL}, got ${cards.length}`,
      );
    }

    return cards;
  }

  /**
   * Fisher-Yates in-place shuffle.
   * Accepts an optional RNG so tests can pass a seeded function for determinism.
   */
  shuffle(deck: Card[], rng: () => number = Math.random): Card[] {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  /** Build and shuffle in one call */
  buildShuffledDeck(): Card[] {
    return this.shuffle(this.buildDeck());
  }

  /**
   * Rebuild a shuffled deck excluding cards that are already in play.
   * Pass the IDs of all cards currently held in hands or the discard pile.
   */
  rebuildDeck(excludeIds: Set<string>): Card[] {
    return this.shuffle(this.buildDeck().filter((c) => !excludeIds.has(c.id)));
  }
}
