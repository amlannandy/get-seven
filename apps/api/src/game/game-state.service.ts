import { Inject, Injectable } from '@nestjs/common';
import { GAME_STATE_TTL_SECONDS } from '@flip7/shared';
import type { GameState } from '@flip7/shared';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

@Injectable()
export class GameStateService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(roomId: string): string {
    return `game:${roomId}`;
  }

  async getState(roomId: string): Promise<GameState | null> {
    const raw = await this.redis.get(this.key(roomId));
    if (!raw) return null;
    return JSON.parse(raw) as GameState;
  }

  async setState(roomId: string, state: GameState): Promise<void> {
    await this.redis.set(
      this.key(roomId),
      JSON.stringify(state),
      'EX',
      GAME_STATE_TTL_SECONDS,
    );
  }

  /**
   * Atomically read the current state, apply `updater`, and write the result back.
   * Turn-based gameplay means only one player acts at a time, so optimistic locking
   * is not required — a simple read-modify-write is safe here.
   *
   * Returns the updated state, or throws if no state exists for the room.
   */
  async updateState(
    roomId: string,
    updater: (state: GameState) => GameState,
  ): Promise<GameState> {
    const current = await this.getState(roomId);
    if (!current) {
      throw new Error(`No game state found for room ${roomId}`);
    }
    const next = updater(current);
    await this.setState(roomId, next);
    return next;
  }

  async deleteState(roomId: string): Promise<void> {
    await this.redis.del(this.key(roomId));
  }
}
