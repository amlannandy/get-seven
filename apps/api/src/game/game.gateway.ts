import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Inject, UseFilters, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import type Redis from 'ioredis';
import { SESSION_TTL_SECONDS } from '@flip7/shared';
import { REDIS_CLIENT } from '../redis/redis.module';
import { WsPlayerGuard } from '../common/guards/ws-player.guard';
import { WsExceptionFilter } from '../common/filters/ws-exception.filter';
import { GameService } from './game.service';
import { GameStateService } from './game-state.service';

interface SessionData {
  playerId: string;
  roomId: string;
}

@UseFilters(WsExceptionFilter)
@WebSocketGateway({ namespace: '/game' })
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly gameService: GameService,
    private readonly gameStateService: GameStateService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  afterInit(server: Server): void {
    this.gameService.setServer(server);
  }

  // ── Connection lifecycle ────────────────────────────────────────────────────

  /**
   * Client connects with socket({ auth: { playerId, roomId } }).
   * Validates against the game state in Redis, joins socket rooms, and sends
   * a full state snapshot so the client can restore its view from any point.
   */
  async handleConnection(client: Socket): Promise<void> {
    const { playerId, roomId } = (client.handshake.auth ?? {}) as {
      playerId?: string;
      roomId?: string;
    };

    if (!playerId || !roomId) {
      client.disconnect();
      return;
    }

    const state = await this.gameStateService.getState(roomId);
    if (!state || !state.playerOrder.includes(playerId)) {
      client.disconnect();
      return;
    }

    await client.join(roomId);
    await client.join(playerId); // personal room for game:your_turn, game:bust_warning, etc.
    await this.redis.set(
      `session:${client.id}`,
      JSON.stringify({ playerId, roomId } satisfies SessionData),
      'EX',
      SESSION_TTL_SECONDS,
    );

    const displayNames = await this.gameStateService.getDisplayNames(roomId);
    client.emit('game:reconnected', {
      gameState: this.gameService.toPublicGameState(state, displayNames),
      yourPlayerId: playerId,
    });
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const raw = await this.redis.get(`session:${client.id}`);
    if (!raw) return;
    await this.redis.del(`session:${client.id}`);
    const { playerId, roomId } = JSON.parse(raw) as SessionData;
    await this.gameService.handlePlayerDisconnect(roomId, playerId);
  }

  // ── Game events — guarded by WsPlayerGuard ──────────────────────────────────

  @UseGuards(WsPlayerGuard)
  @SubscribeMessage('game:hit')
  async handleHit(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ): Promise<void> {
    const { playerId, roomId } = client.data as SessionData;
    if (roomId !== payload.roomId) return;
    await this.gameService.handleHit(roomId, playerId);
  }

  @UseGuards(WsPlayerGuard)
  @SubscribeMessage('game:stay')
  async handleStay(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ): Promise<void> {
    const { playerId, roomId } = client.data as SessionData;
    if (roomId !== payload.roomId) return;
    await this.gameService.handleStay(roomId, playerId);
  }

  @UseGuards(WsPlayerGuard)
  @SubscribeMessage('game:use_second_chance')
  async handleUseSecondChance(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ): Promise<void> {
    const { playerId, roomId } = client.data as SessionData;
    if (roomId !== payload.roomId) return;
    await this.gameService.handleSecondChance(roomId, playerId);
  }

  @UseGuards(WsPlayerGuard)
  @SubscribeMessage('game:select_action_target')
  async handleSelectActionTarget(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; targetPlayerId: string },
  ): Promise<void> {
    const { playerId, roomId } = client.data as SessionData;
    if (roomId !== payload.roomId) return;
    await this.gameService.handleActionTarget(
      roomId,
      playerId,
      payload.targetPlayerId,
    );
  }
}
