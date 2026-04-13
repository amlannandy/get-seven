import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server } from 'socket.io';
import {
  ACTION_TARGET_TIMEOUT_MS,
  ROUND_END_PAUSE_MS,
  SECOND_CHANCE_WINDOW_MS,
  TURN_TIMEOUT_MS,
} from '@flip7/shared';
import type { GameState, PublicGameState, PublicPlayerState } from '@flip7/shared';
import { GameEngineService } from './game-engine.service';
import { ScoringService } from './scoring.service';
import { DeckService } from './deck.service';
import { GameStateService } from './game-state.service';
import { Room } from '../rooms/entities/room.entity';

@Injectable()
export class GameService {
  private server!: Server;

  constructor(
    private readonly engine: GameEngineService,
    private readonly scoringService: ScoringService,
    private readonly deckService: DeckService,
    private readonly gameStateService: GameStateService,
    @InjectRepository(Room) private readonly roomRepo: Repository<Room>,
  ) {}

  /** Called by GameGateway.afterInit so the service can emit events. */
  setServer(server: Server): void {
    this.server = server;
  }

  // ── Game lifecycle ──────────────────────────────────────────────────────────

  /**
   * Called from RoomsGateway when the host starts the game.
   * Initialises round 1, runs the dealing loop, then notifies the first active player.
   */
  async startGame(
    roomId: string,
    players: Array<{ id: string; displayName: string; seatIndex: number }>,
  ): Promise<void> {
    const displayNames: Record<string, string> = {};
    for (const p of players) displayNames[p.id] = p.displayName;
    await this.gameStateService.setDisplayNames(roomId, displayNames);

    const deck = this.deckService.buildShuffledDeck();
    const state = this.engine.initRound({
      roomId,
      round: 1,
      players,
      dealerIndex: 0,
      cumulativeScores: {},
      deck,
    });
    await this.gameStateService.setState(roomId, state);

    // Dealing loop — applyDeal handles action-card auto-apply and advances turn
    // on the final card. Clients that connect to /game while dealing is in progress
    // get a full snapshot via game:reconnected in GameGateway.handleConnection.
    let currentState = state;
    for (let i = 0; i < players.length; i++) {
      const { newState } = this.engine.applyDeal(currentState);
      currentState = newState;
      await this.gameStateService.setState(roomId, currentState);
      this.server.to(roomId).emit('game:state_update', {
        gameState: this.toPublicGameState(currentState, displayNames),
        action: currentState.lastAction ?? { type: 'card_dealt', playerId: '' },
      });
    }

    // After the last applyDeal the engine has already called advanceTurn internally,
    // so currentState.phase === 'player_turn' and activePlayerIndex is correct.
    await this.notifyActivePlayer(roomId, currentState);
  }

  // ── Turn actions ────────────────────────────────────────────────────────────

  async handleHit(roomId: string, playerId: string): Promise<void> {
    const state = await this.gameStateService.getState(roomId);
    if (!state) return;

    if (state.phase !== 'player_turn' && state.phase !== 'flip_three') {
      this.emitPlayerError(playerId, 'INVALID_ACTION', 'Cannot hit in current phase');
      return;
    }

    const activePlayerId = state.playerOrder[state.activePlayerIndex];
    if (activePlayerId !== playerId) {
      this.emitPlayerError(playerId, 'NOT_YOUR_TURN', 'It is not your turn');
      return;
    }

    const drawnCard = state.deck[0];
    if (!drawnCard) return; // should not happen — engine rebuilds on applyDeal

    const result = this.engine.applyHit(state, drawnCard);
    await this.gameStateService.setState(roomId, result.newState);

    const displayNames = await this.gameStateService.getDisplayNames(roomId);
    this.server.to(roomId).emit('game:state_update', {
      gameState: this.toPublicGameState(result.newState, displayNames),
      action: result.newState.lastAction ?? { type: 'hit', playerId },
    });

    switch (result.event) {
      case 'number_ok':
      case 'modifier_added':
      case 'second_chance_received':
        await this.advanceOrEndRound(roomId, result.newState);
        break;

      case 'flip7':
        await this.handleRoundEnd(roomId, result.newState);
        break;

      case 'bust':
        // Give the player SECOND_CHANCE_WINDOW_MS to use their SC card.
        this.server.to(playerId).emit('game:bust_warning', {
          duplicateCard: result.newState.bustDuplicateCard!,
          hasSecondChance: result.hasSecondChance,
          windowMs: SECOND_CHANCE_WINDOW_MS,
        });
        // TODO Phase 5: replace with BullMQ job for reliability across restarts
        setTimeout(
          () => void this.confirmBustIfPending(roomId, playerId),
          SECOND_CHANCE_WINDOW_MS,
        );
        break;

      case 'flip_three_card':
        // Player still in flip-three sequence — they draw again
        await this.notifyActivePlayer(roomId, result.newState);
        break;

      case 'flip_three_done': {
        // Sequence complete. Advance turn away from the flip-three player.
        const advanced = this.engine.advanceTurn(result.newState);
        await this.gameStateService.setState(roomId, advanced);
        if (advanced.phase === 'round_end') {
          await this.handleRoundEnd(roomId, advanced);
        } else {
          await this.notifyActivePlayer(roomId, advanced);
        }
        break;
      }

      case 'action_target_needed':
        await this.notifyActionTarget(roomId, result.newState, result.validTargets);
        break;
    }
  }

  async handleStay(roomId: string, playerId: string): Promise<void> {
    const state = await this.gameStateService.getState(roomId);
    if (!state) return;

    if (state.phase !== 'player_turn') {
      this.emitPlayerError(playerId, 'INVALID_ACTION', 'Cannot stay in current phase');
      return;
    }

    const activePlayerId = state.playerOrder[state.activePlayerIndex];
    if (activePlayerId !== playerId) {
      this.emitPlayerError(playerId, 'NOT_YOUR_TURN', 'It is not your turn');
      return;
    }

    const stayedState = this.engine.applyStay(state);
    const displayNames = await this.gameStateService.getDisplayNames(roomId);

    const advanced = this.engine.advanceTurn(stayedState);
    await this.gameStateService.setState(roomId, advanced);
    this.server.to(roomId).emit('game:state_update', {
      gameState: this.toPublicGameState(advanced, displayNames),
      action: stayedState.lastAction!,
    });

    if (advanced.phase === 'round_end') {
      await this.handleRoundEnd(roomId, advanced);
    } else {
      await this.notifyActivePlayer(roomId, advanced);
    }
  }

  async handleSecondChance(roomId: string, playerId: string): Promise<void> {
    const state = await this.gameStateService.getState(roomId);
    if (!state) return;

    if (state.phase !== 'bust_pending' || state.bustPendingPlayerId !== playerId) {
      this.emitPlayerError(playerId, 'INVALID_ACTION', 'No bust pending for you');
      return;
    }

    const newState = this.engine.applySecondChance(state);
    await this.gameStateService.setState(roomId, newState);

    const displayNames = await this.gameStateService.getDisplayNames(roomId);
    this.server.to(roomId).emit('game:state_update', {
      gameState: this.toPublicGameState(newState, displayNames),
      action: newState.lastAction!,
    });

    await this.notifyActivePlayer(roomId, newState);
  }

  async handleActionTarget(
    roomId: string,
    playerId: string,
    targetPlayerId: string,
  ): Promise<void> {
    const state = await this.gameStateService.getState(roomId);
    if (!state) return;

    if (state.phase !== 'action_pending') {
      this.emitPlayerError(playerId, 'INVALID_ACTION', 'No action pending');
      return;
    }

    const activePlayerId = state.playerOrder[state.activePlayerIndex];
    if (activePlayerId !== playerId) {
      this.emitPlayerError(playerId, 'NOT_YOUR_TURN', 'It is not your turn');
      return;
    }

    const actionCard = state.pendingActionCard!;
    const validTargets =
      actionCard.action === 'second_chance'
        ? state.playerStates.filter((ps) => !ps.hasSecondChance).map((ps) => ps.playerId)
        : state.playerStates
            .filter((ps) => ps.status === 'active')
            .map((ps) => ps.playerId);

    if (!validTargets.includes(targetPlayerId)) {
      this.emitPlayerError(playerId, 'INVALID_TARGET', 'Invalid target player');
      return;
    }

    const newState = this.engine.applyActionTarget(state, targetPlayerId);
    await this.gameStateService.setState(roomId, newState);

    const displayNames = await this.gameStateService.getDisplayNames(roomId);
    this.server.to(roomId).emit('game:state_update', {
      gameState: this.toPublicGameState(newState, displayNames),
      action: newState.lastAction!,
    });

    if (newState.phase === 'action_pending') {
      // More deferred actions to resolve
      const nextCard = newState.pendingActionCard!;
      const nextTargets =
        nextCard.action === 'second_chance'
          ? newState.playerStates.filter((ps) => !ps.hasSecondChance).map((ps) => ps.playerId)
          : newState.playerStates
              .filter((ps) => ps.status === 'active')
              .map((ps) => ps.playerId);
      await this.notifyActionTarget(roomId, newState, nextTargets);
    } else if (newState.phase === 'flip_three') {
      // Flip-three target now draws
      await this.notifyActivePlayer(roomId, newState);
    } else {
      // player_turn — the acting player continues their turn (action card ≠ end of turn)
      await this.advanceOrEndRound(roomId, newState);
    }
  }

  async handlePlayerDisconnect(roomId: string, playerId: string): Promise<void> {
    const state = await this.gameStateService.getState(roomId);
    if (!state) return;

    const activePlayerId = state.playerOrder[state.activePlayerIndex];
    if (
      activePlayerId === playerId &&
      (state.phase === 'player_turn' || state.phase === 'flip_three')
    ) {
      await this.handleStay(roomId, playerId);
    }
  }

  // ── Public helper ───────────────────────────────────────────────────────────

  toPublicGameState(
    state: GameState,
    displayNames: Record<string, string>,
  ): PublicGameState {
    const activeInTurn =
      state.phase === 'player_turn' ||
      state.phase === 'flip_three' ||
      state.phase === 'action_pending' ||
      state.phase === 'bust_pending';

    const playerStates: PublicPlayerState[] = state.playerStates.map((ps) => ({
      playerId: ps.playerId,
      displayName: displayNames[ps.playerId] ?? ps.playerId,
      hand: ps.hand,
      status: ps.status,
      roundScore: ps.roundScore,
      totalScore: state.cumulativeScores[ps.playerId] ?? 0,
      flipThreeRemaining: ps.flipThreeRemaining,
    }));

    return {
      phase: state.phase,
      round: state.round,
      deckSize: state.deck.length,
      activePlayerId: activeInTurn ? state.playerOrder[state.activePlayerIndex] : null,
      bustPendingPlayerId: state.bustPendingPlayerId,
      pendingActionCard: state.pendingActionCard,
      playerStates,
      lastAction: state.lastAction,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async advanceOrEndRound(roomId: string, state: GameState): Promise<void> {
    if (this.engine.isRoundOver(state)) {
      await this.handleRoundEnd(roomId, state);
    } else {
      await this.notifyActivePlayer(roomId, state);
    }
  }

  private async confirmBustIfPending(roomId: string, playerId: string): Promise<void> {
    const state = await this.gameStateService.getState(roomId);
    if (!state || state.phase !== 'bust_pending' || state.bustPendingPlayerId !== playerId) return;

    const newState = this.engine.confirmBust(state);
    await this.gameStateService.setState(roomId, newState);

    const displayNames = await this.gameStateService.getDisplayNames(roomId);
    this.server.to(roomId).emit('game:state_update', {
      gameState: this.toPublicGameState(newState, displayNames),
      action: newState.lastAction!,
    });

    const advanced = this.engine.advanceTurn(newState);
    await this.gameStateService.setState(roomId, advanced);
    if (advanced.phase === 'round_end') {
      await this.handleRoundEnd(roomId, advanced);
    } else {
      await this.notifyActivePlayer(roomId, advanced);
    }
  }

  private async handleRoundEnd(roomId: string, state: GameState): Promise<void> {
    const scoredState = this.scoringService.applyRoundScores(state);
    await this.gameStateService.setState(roomId, scoredState);

    const roundScores: Record<string, number> = {};
    for (const ps of scoredState.playerStates) roundScores[ps.playerId] = ps.roundScore;

    this.server.to(roomId).emit('game:round_end', {
      roundNumber: scoredState.round,
      roundScores,
      cumulativeScores: scoredState.cumulativeScores,
      flip7PlayerId:
        scoredState.playerStates.find((ps) => ps.status === 'flip7')?.playerId ?? null,
    });

    if (scoredState.winnerId) {
      const displayNames = await this.gameStateService.getDisplayNames(roomId);
      this.server.to(roomId).emit('game:over', {
        winnerId: scoredState.winnerId,
        winnerName: displayNames[scoredState.winnerId] ?? 'Unknown',
        finalScores: scoredState.cumulativeScores,
      });
      await this.roomRepo.update(roomId, { status: 'finished', finishedAt: new Date() });
      // TODO Phase 5: enqueue room-cleanup BullMQ job
      return;
    }

    // TODO Phase 5: replace with BullMQ delayed job for reliability
    setTimeout(() => void this.startNextRound(roomId, scoredState), ROUND_END_PAUSE_MS);
  }

  private async startNextRound(roomId: string, prevState: GameState): Promise<void> {
    const displayNames = await this.gameStateService.getDisplayNames(roomId);
    const players = prevState.playerOrder.map((id, idx) => ({
      id,
      displayName: displayNames[id] ?? '',
      seatIndex: idx,
    }));

    const nextState = this.engine.initRound({
      roomId,
      round: prevState.round + 1,
      players,
      dealerIndex: (prevState.dealerIndex + 1) % players.length,
      cumulativeScores: prevState.cumulativeScores,
      deck: this.deckService.buildShuffledDeck(),
    });
    await this.gameStateService.setState(roomId, nextState);

    this.server.to(roomId).emit('game:state_update', {
      gameState: this.toPublicGameState(nextState, displayNames),
      action: { type: 'round_start', playerId: '', payload: { round: nextState.round } },
    });

    let currentState = nextState;
    for (let i = 0; i < players.length; i++) {
      const { newState } = this.engine.applyDeal(currentState);
      currentState = newState;
      await this.gameStateService.setState(roomId, currentState);
      this.server.to(roomId).emit('game:state_update', {
        gameState: this.toPublicGameState(currentState, displayNames),
        action: currentState.lastAction ?? { type: 'card_dealt', playerId: '' },
      });
    }

    await this.notifyActivePlayer(roomId, currentState);
  }

  private async notifyActivePlayer(roomId: string, state: GameState): Promise<void> {
    const activePlayerId = state.playerOrder[state.activePlayerIndex];
    const now = Date.now();
    this.server.to(activePlayerId).emit('game:your_turn', {
      timeoutMs: TURN_TIMEOUT_MS,
      expiresAt: now + TURN_TIMEOUT_MS,
    });
    // TODO Phase 5: enqueue BullMQ turn-timeout job
  }

  private async notifyActionTarget(
    roomId: string,
    state: GameState,
    validTargets: string[],
  ): Promise<void> {
    const activePlayerId = state.playerOrder[state.activePlayerIndex];
    const now = Date.now();
    this.server.to(activePlayerId).emit('game:select_target', {
      action: state.pendingActionCard!.action,
      validTargetIds: validTargets,
      timeoutMs: ACTION_TARGET_TIMEOUT_MS,
      expiresAt: now + ACTION_TARGET_TIMEOUT_MS,
    });
    // TODO Phase 5: enqueue BullMQ action-timeout job
  }

  private emitPlayerError(
    playerId: string,
    code: string,
    message: string,
  ): void {
    this.server.to(playerId).emit('game:error', { code, message });
  }
}
