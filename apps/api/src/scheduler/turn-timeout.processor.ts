import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { GameService } from '../game/game.service';
import { GameStateService } from '../game/game-state.service';

export interface TurnTimeoutJobData {
  roomId: string;
  playerId: string;
  round: number;
  turnIndex: number;
}

export interface ActionTimeoutJobData {
  roomId: string;
  playerId: string; // the acting player (who must select a target)
  round: number;
  turnIndex: number;
}

@Processor('turn-timeout')
export class TurnTimeoutProcessor extends WorkerHost {
  constructor(
    private readonly gameService: GameService,
    private readonly gameStateService: GameStateService,
  ) {
    super();
  }

  async process(
    job: Job<TurnTimeoutJobData | ActionTimeoutJobData>,
  ): Promise<void> {
    if (job.name === 'turn-timeout') {
      await this.handleTurnTimeout(job as Job<TurnTimeoutJobData>);
    } else if (job.name === 'action-timeout') {
      await this.handleActionTimeout(job as Job<ActionTimeoutJobData>);
    }
  }

  private async handleTurnTimeout(job: Job<TurnTimeoutJobData>): Promise<void> {
    const { roomId, playerId, round, turnIndex } = job.data;
    const state = await this.gameStateService.getState(roomId);
    if (!state) return;

    // Stale-job guard: ignore if the round or turn has already advanced
    if (
      state.round !== round ||
      state.activePlayerIndex !== turnIndex ||
      (state.phase !== 'player_turn' && state.phase !== 'flip_three')
    ) {
      return;
    }

    await this.gameService.handleStay(roomId, playerId);
  }

  private async handleActionTimeout(
    job: Job<ActionTimeoutJobData>,
  ): Promise<void> {
    const { roomId, playerId, round, turnIndex } = job.data;
    const state = await this.gameStateService.getState(roomId);
    if (!state) return;

    // Stale-job guard: ignore if the state has moved on
    if (
      state.round !== round ||
      state.activePlayerIndex !== turnIndex ||
      state.phase !== 'action_pending'
    ) {
      return;
    }

    // Auto-target self — handles all three action card types gracefully
    await this.gameService.handleActionTarget(roomId, playerId, playerId);
  }
}
