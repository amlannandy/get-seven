import { Injectable } from '@nestjs/common';
import { FLIP7_BONUS, FLIP7_UNIQUE_CARDS_NEEDED } from '@flip7/shared';
import type { Card, GameState, PlayerRoundState } from '@flip7/shared';
import { DeckService } from './deck.service';
import { ScoringService } from './scoring.service';

// ─── HitResult discriminated union ───────────────────────────────────────────

export type HitResult =
  | { event: 'number_ok'; newState: GameState }
  | { event: 'flip7'; newState: GameState }
  | { event: 'bust'; newState: GameState; hasSecondChance: boolean }
  | { event: 'modifier_added'; newState: GameState }
  | {
      event: 'action_target_needed';
      newState: GameState;
      validTargets: string[];
    }
  | { event: 'second_chance_received'; newState: GameState }
  | { event: 'flip_three_card'; newState: GameState; remaining: number }
  | { event: 'flip_three_done'; newState: GameState };

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class GameEngineService {
  constructor(
    private readonly deckService: DeckService,
    private readonly scoringService: ScoringService,
  ) {}
  // ── Round init ─────────────────────────────────────────────────────────────

  /**
   * Initialise a brand-new round. Called by GameService at the start of every
   * round (including the very first).
   */
  initRound(params: {
    roomId: string;
    round: number;
    players: Array<{ id: string; displayName: string; seatIndex: number }>;
    dealerIndex: number;
    cumulativeScores: Record<string, number>;
    deck: Card[];
  }): GameState {
    // Sort by seatIndex so playerOrder is always deterministic
    const sorted = [...params.players].sort(
      (a, b) => a.seatIndex - b.seatIndex,
    );

    const playerStates: PlayerRoundState[] = sorted.map((p) => ({
      playerId: p.id,
      hand: [],
      numberSum: 0,
      hasTimesTwo: false,
      flatBonuses: 0,
      hasSecondChance: false,
      status: 'active',
      roundScore: 0,
      flipThreeRemaining: 0,
      deferredActions: [],
    }));

    return {
      roomId: params.roomId,
      phase: 'dealing',
      round: params.round,
      deck: params.deck,
      discardPile: [],
      playerStates,
      playerOrder: sorted.map((p) => p.id),
      activePlayerIndex: 0,
      dealerIndex: params.dealerIndex,
      dealProgress: 0,
      bustPendingPlayerId: null,
      bustDuplicateCard: null,
      pendingActionCard: null,
      cumulativeScores: { ...params.cumulativeScores },
      winnerId: null,
      lastAction: null,
    };
  }

  // ── Dealing phase ──────────────────────────────────────────────────────────

  /**
   * Deal the top card of the deck to the next player in deal order.
   * Dealing starts from the seat after the dealer and wraps around.
   *
   * During dealing:
   *  - number / modifier cards are added to the recipient's hand normally
   *  - action cards (Freeze / Flip Three) are auto-applied to the recipient
   *  - Second Chance is given to the recipient
   *
   * Returns the new state, the dealt card, and the target player ID.
   */
  applyDeal(state: GameState): {
    newState: GameState;
    card: Card;
    targetPlayerId: string;
  } {
    let currentState = state;
    if (currentState.deck.length === 0) {
      currentState = { ...currentState, deck: this.rebuildDeck(currentState) };
    }

    const playerCount = currentState.playerOrder.length;
    // Deal order starts from the seat immediately after the dealer
    const dealTargetIndex =
      (currentState.dealerIndex + 1 + currentState.dealProgress) % playerCount;
    const targetPlayerId = currentState.playerOrder[dealTargetIndex];

    const [card, ...remainingDeck] = currentState.deck;

    let newState: GameState = {
      ...currentState,
      deck: remainingDeck,
      dealProgress: currentState.dealProgress + 1,
    };

    newState = this.applyCardToPlayer(newState, card, targetPlayerId, true);

    // After last deal, transition to player_turn
    if (newState.dealProgress === playerCount) {
      newState = this.advanceTurn({
        ...newState,
        phase: 'player_turn',
        dealProgress: playerCount,
      });
    }

    return { newState, card, targetPlayerId };
  }

  // ── Hit ───────────────────────────────────────────────────────────────────

  /**
   * Active player draws the top card of the deck.
   * The caller (GameService) passes the card in (already popped from deck).
   */
  applyHit(state: GameState, drawnCard: Card): HitResult {
    const activePlayerId = state.playerOrder[state.activePlayerIndex];
    const playerState = this.getPlayer(state, activePlayerId);
    const inFlipThree = state.phase === 'flip_three';

    // ── Number card ────────────────────────────────────────────────────────
    if (drawnCard.type === 'number') {
      const hasDuplicate = playerState.hand.some(
        (c) => c.type === 'number' && c.value === drawnCard.value,
      );

      if (hasDuplicate) {
        // Mid flip-three bust: SC is auto-consumed so the sequence continues
        if (inFlipThree && playerState.hasSecondChance) {
          const newHand = playerState.hand.filter(
            (c) => !(c.type === 'action' && c.action === 'second_chance'),
          );
          const updatedPlayer: PlayerRoundState = {
            ...playerState,
            hand: newHand,
            hasSecondChance: false,
          };
          let newState = this.replacePlayer(state, updatedPlayer);
          newState = {
            ...newState,
            deck: state.deck.filter((c) => c.id !== drawnCard.id),
            discardPile: [...newState.discardPile, drawnCard],
            lastAction: {
              type: 'second_chance_auto_used',
              playerId: activePlayerId,
              card: drawnCard,
            },
          };
          return this.handleFlipThreeProgress(
            newState,
            activePlayerId,
            drawnCard,
          );
        }

        const newState: GameState = {
          ...state,
          deck: state.deck.filter((c) => c.id !== drawnCard.id),
          bustPendingPlayerId: activePlayerId,
          bustDuplicateCard: drawnCard,
          phase: 'bust_pending',
          lastAction: {
            type: 'bust_pending',
            playerId: activePlayerId,
            card: drawnCard,
          },
        };
        return {
          event: 'bust',
          newState,
          hasSecondChance: playerState.hasSecondChance,
        };
      }

      // Unique number — add to hand
      const updatedPlayer = this.scoringService.addCardToPlayer(
        playerState,
        drawnCard,
      );
      let newState = this.replacePlayer(state, updatedPlayer);
      newState = {
        ...newState,
        deck: state.deck.filter((c) => c.id !== drawnCard.id),
      };

      // Check for Flip 7
      const uniqueNumbers = this.countUniqueNumbers(updatedPlayer);
      if (uniqueNumbers === FLIP7_UNIQUE_CARDS_NEEDED) {
        const flip7State: GameState = {
          ...newState,
          lastAction: {
            type: 'flip7',
            playerId: activePlayerId,
            card: drawnCard,
          },
        };
        return {
          event: 'flip7',
          newState: this.markPlayerFlip7(flip7State, activePlayerId),
        };
      }

      if (inFlipThree) {
        return this.handleFlipThreeProgress(
          newState,
          activePlayerId,
          drawnCard,
        );
      }

      return {
        event: 'number_ok',
        newState: {
          ...newState,
          lastAction: {
            type: 'number_ok',
            playerId: activePlayerId,
            card: drawnCard,
          },
        },
      };
    }

    // ── Modifier card ──────────────────────────────────────────────────────
    if (drawnCard.type === 'modifier') {
      const updatedPlayer = this.scoringService.addCardToPlayer(
        playerState,
        drawnCard,
      );
      let newState = this.replacePlayer(state, updatedPlayer);
      newState = {
        ...newState,
        deck: state.deck.filter((c) => c.id !== drawnCard.id),
        lastAction: {
          type: 'modifier_added',
          playerId: activePlayerId,
          card: drawnCard,
        },
      };

      if (inFlipThree) {
        return this.handleFlipThreeProgress(
          newState,
          activePlayerId,
          drawnCard,
        );
      }

      return { event: 'modifier_added', newState };
    }

    // ── Action card ────────────────────────────────────────────────────────
    const actionCard = drawnCard;
    let newState: GameState = {
      ...state,
      deck: state.deck.filter((c) => c.id !== drawnCard.id),
    };

    if (actionCard.action === 'second_chance') {
      const validTargets = this.getValidSecondChanceTargets(newState);

      if (inFlipThree) {
        if (validTargets.length === 0) {
          // No valid targets — discard and continue flip three
          newState = {
            ...newState,
            discardPile: [...newState.discardPile, actionCard],
            lastAction: {
              type: 'second_chance_discarded',
              playerId: activePlayerId,
              card: actionCard,
            },
          };
        } else {
          // Defer until flip three ends
          const player = this.getPlayer(newState, activePlayerId);
          const updatedPlayer: PlayerRoundState = {
            ...player,
            deferredActions: [
              ...player.deferredActions,
              { card: actionCard, appliedToSelf: false },
            ],
          };
          newState = this.replacePlayer(newState, updatedPlayer);
        }
        return this.handleFlipThreeProgress(
          newState,
          activePlayerId,
          actionCard,
        );
      }

      if (validTargets.length === 0) {
        // No valid targets — discard
        newState = {
          ...newState,
          discardPile: [...newState.discardPile, actionCard],
          lastAction: {
            type: 'second_chance_discarded',
            playerId: activePlayerId,
            card: actionCard,
          },
        };
        return { event: 'second_chance_received', newState };
      }

      // Prompt for target (self or another player)
      newState = {
        ...newState,
        phase: 'action_pending',
        pendingActionCard: actionCard,
        lastAction: {
          type: 'action_card_drawn',
          playerId: activePlayerId,
          card: actionCard,
        },
      };
      return { event: 'action_target_needed', newState, validTargets };
    }

    // Freeze or Flip Three — need a target (or defer during flip_three)
    if (inFlipThree) {
      // Defer action — will be resolved after the flip three sequence completes
      const updatedPlayer: PlayerRoundState = {
        ...this.getPlayer(newState, activePlayerId),
        deferredActions: [
          ...this.getPlayer(newState, activePlayerId).deferredActions,
          { card: actionCard, appliedToSelf: false },
        ],
      };
      newState = this.replacePlayer(newState, updatedPlayer);
      return this.handleFlipThreeProgress(newState, activePlayerId, actionCard);
    }

    // Normal turn: emit action_pending, wait for target selection
    newState = {
      ...newState,
      phase: 'action_pending',
      pendingActionCard: actionCard,
      lastAction: {
        type: 'action_card_drawn',
        playerId: activePlayerId,
        card: actionCard,
      },
    };
    const validTargets = this.getValidActionTargets(newState);
    return { event: 'action_target_needed', newState, validTargets };
  }

  // ── Stay ──────────────────────────────────────────────────────────────────

  applyStay(state: GameState): GameState {
    const activePlayerId = state.playerOrder[state.activePlayerIndex];
    const playerState = this.getPlayer(state, activePlayerId);
    const updatedPlayer: PlayerRoundState = {
      ...playerState,
      status: 'stayed',
    };
    const newState = this.replacePlayer(state, updatedPlayer);
    return {
      ...newState,
      lastAction: { type: 'stayed', playerId: activePlayerId },
    };
  }

  // ── Action target ──────────────────────────────────────────────────────────

  /**
   * Active player selects a target for a pending Freeze or Flip Three card.
   */
  applyActionTarget(state: GameState, targetPlayerId: string): GameState {
    if (!state.pendingActionCard) {
      throw new Error('No pending action card');
    }
    const actionCard = state.pendingActionCard;
    const actingPlayerId = state.playerOrder[state.activePlayerIndex];

    let newState: GameState = {
      ...state,
      phase: 'player_turn',
      pendingActionCard: null,
    };

    if (actionCard.action === 'freeze') {
      const target = this.getPlayer(newState, targetPlayerId);
      const updatedTarget: PlayerRoundState = {
        ...target,
        hand: [...target.hand, actionCard],
        status: 'frozen',
      };
      newState = this.replacePlayer(newState, updatedTarget);
      newState = {
        ...newState,
        lastAction: {
          type: 'freeze_applied',
          playerId: actingPlayerId,
          card: actionCard,
          targetPlayerId,
        },
      };
    } else if (actionCard.action === 'flip_three') {
      const target = this.getPlayer(newState, targetPlayerId);
      const updatedTarget: PlayerRoundState = {
        ...target,
        hand: [...target.hand, actionCard],
        flipThreeRemaining: 3,
      };
      newState = this.replacePlayer(newState, updatedTarget);
      // Change active player to the target so they draw next
      const targetIndex = newState.playerOrder.indexOf(targetPlayerId);
      newState = {
        ...newState,
        activePlayerIndex: targetIndex,
        phase: 'flip_three',
        lastAction: {
          type: 'flip_three_applied',
          playerId: actingPlayerId,
          card: actionCard,
          targetPlayerId,
        },
      };
    } else if (actionCard.action === 'second_chance') {
      const target = this.getPlayer(newState, targetPlayerId);
      const updatedTarget: PlayerRoundState = {
        ...target,
        hand: [...target.hand, actionCard],
        hasSecondChance: true,
      };
      newState = this.replacePlayer(newState, updatedTarget);
      newState = {
        ...newState,
        lastAction: {
          type: 'second_chance_given',
          playerId: actingPlayerId,
          card: actionCard,
          targetPlayerId,
        },
      };
    }

    // Chain any remaining deferred actions on the acting player
    const actingPlayer = this.getPlayer(newState, actingPlayerId);
    if (actingPlayer.deferredActions.length > 0) {
      const [next, ...rest] = actingPlayer.deferredActions;
      const updatedActing: PlayerRoundState = {
        ...actingPlayer,
        deferredActions: rest,
      };
      newState = this.replacePlayer(newState, updatedActing);
      newState = {
        ...newState,
        phase: 'action_pending',
        pendingActionCard: next.card,
        lastAction: {
          type: 'action_card_drawn',
          playerId: actingPlayerId,
          card: next.card,
        },
      };
    }

    return newState;
  }

  // ── Second Chance ──────────────────────────────────────────────────────────

  /**
   * Player uses their Second Chance card to avoid the pending bust.
   * Discards both the SC card and the duplicate number card.
   */
  applySecondChance(state: GameState): GameState {
    if (!state.bustPendingPlayerId || !state.bustDuplicateCard) {
      throw new Error('No bust pending');
    }
    const playerId = state.bustPendingPlayerId;
    const playerState = this.getPlayer(state, playerId);

    // Remove the Second Chance card from hand
    const newHand = playerState.hand.filter(
      (c) => !(c.type === 'action' && c.action === 'second_chance'),
    );
    const updatedPlayer: PlayerRoundState = {
      ...playerState,
      hand: newHand,
      hasSecondChance: false,
    };

    return {
      ...this.replacePlayer(state, updatedPlayer),
      phase: 'player_turn',
      bustPendingPlayerId: null,
      bustDuplicateCard: null,
      discardPile: [...state.discardPile, state.bustDuplicateCard],
      lastAction: { type: 'second_chance_used', playerId },
    };
  }

  // ── Confirm bust ──────────────────────────────────────────────────────────

  /**
   * Bust confirmed — player either had no Second Chance or let the window expire.
   */
  confirmBust(state: GameState): GameState {
    if (!state.bustPendingPlayerId || !state.bustDuplicateCard) {
      throw new Error('No bust pending');
    }
    const playerId = state.bustPendingPlayerId;
    const playerState = this.getPlayer(state, playerId);
    const updatedPlayer: PlayerRoundState = {
      ...playerState,
      hand: [...playerState.hand, state.bustDuplicateCard],
      status: 'busted',
      roundScore: 0,
      flipThreeRemaining: 0,
    };

    return {
      ...this.replacePlayer(state, updatedPlayer),
      phase: 'player_turn',
      bustPendingPlayerId: null,
      bustDuplicateCard: null,
      lastAction: { type: 'busted', playerId, card: state.bustDuplicateCard },
    };
  }

  // ── Advance turn ──────────────────────────────────────────────────────────

  /**
   * Move to the next active player.  Skips stayed / busted / frozen / flip7.
   * If nobody is left active, transitions to round_end.
   */
  advanceTurn(state: GameState): GameState {
    if (this.isRoundOver(state)) {
      return { ...state, phase: 'round_end' };
    }

    const playerCount = state.playerOrder.length;
    let nextIndex = (state.activePlayerIndex + 1) % playerCount;

    // Find the next active player
    for (let i = 0; i < playerCount; i++) {
      const candidate = this.getPlayerByIndex(state, nextIndex);
      if (candidate.status === 'active') {
        return { ...state, phase: 'player_turn', activePlayerIndex: nextIndex };
      }
      nextIndex = (nextIndex + 1) % playerCount;
    }

    // All players done
    return { ...state, phase: 'round_end' };
  }

  // ── Round over check ──────────────────────────────────────────────────────

  isRoundOver(state: GameState): boolean {
    return state.playerStates.every(
      (ps) =>
        ps.status === 'stayed' ||
        ps.status === 'busted' ||
        ps.status === 'frozen' ||
        ps.status === 'flip7',
    );
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private getPlayer(state: GameState, playerId: string): PlayerRoundState {
    const ps = state.playerStates.find((p) => p.playerId === playerId);
    if (!ps) throw new Error(`Player ${playerId} not found`);
    return ps;
  }

  private getPlayerByIndex(state: GameState, index: number): PlayerRoundState {
    return this.getPlayer(state, state.playerOrder[index]);
  }

  private replacePlayer(
    state: GameState,
    updated: PlayerRoundState,
  ): GameState {
    return {
      ...state,
      playerStates: state.playerStates.map((ps) =>
        ps.playerId === updated.playerId ? updated : ps,
      ),
    };
  }

  /**
   * Apply a card to a specific player during the dealing phase or as an
   * auto-target (action cards go straight to the recipient, no target prompt).
   */
  private applyCardToPlayer(
    state: GameState,
    card: Card,
    targetPlayerId: string,
    isDeal: boolean,
  ): GameState {
    const player = this.getPlayer(state, targetPlayerId);

    if (card.type === 'number' || card.type === 'modifier') {
      return this.replacePlayer(
        state,
        this.scoringService.addCardToPlayer(player, card),
      );
    }

    // Action cards during deal
    const actionCard = card;
    if (actionCard.action === 'second_chance') {
      if (player.hasSecondChance) {
        // Auto-discard duplicate
        return { ...state, discardPile: [...state.discardPile, actionCard] };
      }
      const updatedPlayer: PlayerRoundState = {
        ...player,
        hand: [...player.hand, actionCard],
        hasSecondChance: true,
      };
      return this.replacePlayer(state, updatedPlayer);
    }

    if (actionCard.action === 'freeze') {
      const updatedPlayer: PlayerRoundState = {
        ...player,
        hand: [...player.hand, actionCard],
        status: isDeal ? 'frozen' : player.status,
      };
      return this.replacePlayer(state, updatedPlayer);
    }

    if (actionCard.action === 'flip_three') {
      const updatedPlayer: PlayerRoundState = {
        ...player,
        hand: [...player.hand, actionCard],
        flipThreeRemaining: isDeal ? 3 : player.flipThreeRemaining,
      };
      return this.replacePlayer(state, updatedPlayer);
    }

    return state;
  }

  private countUniqueNumbers(player: PlayerRoundState): number {
    const values = new Set(
      player.hand
        .filter((c) => c.type === 'number')
        .map((c) => (c as { value: number }).value),
    );
    return values.size;
  }

  private markPlayerFlip7(state: GameState, playerId: string): GameState {
    const player = this.getPlayer(state, playerId);
    const updatedPlayer: PlayerRoundState = {
      ...player,
      status: 'flip7',
      roundScore: player.roundScore + FLIP7_BONUS,
    };
    return { ...this.replacePlayer(state, updatedPlayer), phase: 'round_end' };
  }

  /**
   * Handle card draw progress during a flip_three sequence.
   * Decrements flipThreeRemaining; when it hits 0 resolves deferred actions.
   */
  private handleFlipThreeProgress(
    state: GameState,
    playerId: string,
    drawnCard: Card,
  ): HitResult {
    const player = this.getPlayer(state, playerId);
    const remaining = player.flipThreeRemaining - 1;

    const updatedPlayer: PlayerRoundState = {
      ...player,
      flipThreeRemaining: remaining,
    };
    let newState = this.replacePlayer(state, updatedPlayer);
    newState = {
      ...newState,
      lastAction: { type: 'flip_three_card', playerId, card: drawnCard },
    };

    if (remaining > 0) {
      return { event: 'flip_three_card', newState, remaining };
    }

    // Flip Three sequence complete — check for deferred actions
    const donePlayer = this.getPlayer(newState, playerId);
    if (donePlayer.deferredActions.length > 0) {
      const [next, ...rest] = donePlayer.deferredActions;
      const updatedPlayer: PlayerRoundState = {
        ...donePlayer,
        deferredActions: rest,
      };
      newState = this.replacePlayer(newState, updatedPlayer);
      newState = {
        ...newState,
        phase: 'action_pending',
        pendingActionCard: next.card,
        lastAction: { type: 'action_card_drawn', playerId, card: next.card },
      };
      const validTargets =
        next.card.action === 'second_chance'
          ? this.getValidSecondChanceTargets(newState)
          : this.getValidActionTargets(newState);
      return { event: 'action_target_needed', newState, validTargets };
    }

    newState = { ...newState, phase: 'player_turn' };
    return { event: 'flip_three_done', newState };
  }

  /** Valid targets for Freeze and Flip Three: any active player. */
  private getValidActionTargets(state: GameState): string[] {
    return state.playerStates
      .filter((ps) => ps.status === 'active')
      .map((ps) => ps.playerId);
  }

  /** Valid targets for a Second Chance card: any player who does not already hold one. */
  private getValidSecondChanceTargets(state: GameState): string[] {
    return state.playerStates
      .filter((ps) => !ps.hasSecondChance)
      .map((ps) => ps.playerId);
  }

  /**
   * Rebuild and shuffle a fresh deck, excluding any cards currently held in
   * players' hands or in the discard pile so no ID is duplicated in play.
   */
  private rebuildDeck(state: GameState): Card[] {
    const inPlay = new Set<string>();
    // Add each player's hand to list of in-play cards
    for (const ps of state.playerStates) {
      for (const card of ps.hand) {
        inPlay.add(card.id);
      }
    }
    // Then add all cards from the discard pile
    for (const card of state.discardPile) {
      inPlay.add(card.id);
    }
    return this.deckService.rebuildDeck(inPlay);
  }
}
