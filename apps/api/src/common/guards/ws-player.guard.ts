import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import type { Socket } from 'socket.io';
import { REDIS_CLIENT } from '../../redis/redis.module';

@Injectable()
export class WsPlayerGuard implements CanActivate {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();
    const raw = await this.redis.get(`session:${client.id}`);

    if (!raw) {
      client.emit('game:error', {
        code: 'NOT_YOUR_TURN',
        message: 'Session not found — reconnect to /game first',
      });
      return false;
    }

    // Attach session to socket.data so handlers can read it without a Redis round-trip
    client.data = JSON.parse(raw) as { playerId: string; roomId: string };
    return true;
  }
}
