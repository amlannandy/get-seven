import { Injectable } from '@nestjs/common';
import { MODIFIER_VALUES, WINNING_SCORE } from '@flip7/shared';
import type { Card, GameState, PlayerRoundState } from '@flip7/shared';

@Injectable()
export class ScoringService {
  /**
   * Apply round scores to all players in the state.
   * Mutates cumulativeScores and sets roundScore on each PlayerRoundState.
   * Sets winnerId if any player reaches WINNING_SCORE.
   * Returns the updated GameState (new object — does not mutate in place).
   */
  applyRoundScores(state: GameState): GameState {
    const updatedCumulativeScores = { ...state.cumulativeScores };
    for (const ps of state.playerStates) {
      updatedCumulativeScores[ps.playerId] =
        (updatedCumulativeScores[ps.playerId] ?? 0) + ps.roundScore;
    }

    // Determine winner: highest cumulative score at or above WINNING_SCORE.
    // If multiple players cross the threshold in the same round, the highest score wins.
    let winnerId: string | null = null;
    let highestScore = -Infinity;
    for (const [playerId, score] of Object.entries(updatedCumulativeScores)) {
      if (score >= WINNING_SCORE && score > highestScore) {
        highestScore = score;
        winnerId = playerId;
      }
    }

    return {
      ...state,
      cumulativeScores: updatedCumulativeScores,
      winnerId,
    };
  }

  /**
   * Add a card to a player's hand and recompute their live round score.
   * Tracks numberSum, hasTimesTwo, and flatBonuses so the score stays in sync
   * with every card drawn.
   */
  addCardToPlayer(player: PlayerRoundState, card: Card): PlayerRoundState {
    const newHand = [...player.hand, card];
    let { numberSum, hasTimesTwo, flatBonuses } = player;

    if (card.type === 'number') {
      numberSum += card.value;
    } else if (card.type === 'modifier') {
      if (card.modifier === 'times2') {
        hasTimesTwo = true;
      } else {
        flatBonuses += MODIFIER_VALUES[card.modifier];
      }
    }

    const roundScore = numberSum * (hasTimesTwo ? 2 : 1) + flatBonuses;

    return {
      ...player,
      hand: newHand,
      numberSum,
      hasTimesTwo,
      flatBonuses,
      roundScore,
    };
  }
}
