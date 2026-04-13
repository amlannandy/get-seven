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
import { Inject } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import type Redis from 'ioredis';
import { SESSION_TTL_SECONDS } from '@flip7/shared';
import { REDIS_CLIENT } from '../redis/redis.module';
import { GameService } from './game.service';
import { GameStateService } from './game-state.service';

interface SessionData {
  playerId: string;
  roomId: string;
}

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
   * Validates against game state in Redis, joins the room socket and a
   * personal room (for direct messages), and sends a full state snapshot.
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
    await this.saveSession(client.id, { playerId, roomId });

    const displayNames = await this.gameStateService.getDisplayNames(roomId);
    client.emit('game:reconnected', {
      gameState: this.gameService.toPublicGameState(state, displayNames),
      yourPlayerId: playerId,
    });
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const session = await this.getSession(client.id);
    if (!session) return;
    await this.deleteSession(client.id);
    await this.gameService.handlePlayerDisconnect(
      session.roomId,
      session.playerId,
    );
  }

  // ── Game events ─────────────────────────────────────────────────────────────

  @SubscribeMessage('game:hit')
  async handleHit(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ): Promise<void> {
    const session = await this.getSession(client.id);
    if (!session || session.roomId !== payload.roomId) return;
    await this.gameService.handleHit(session.roomId, session.playerId);
  }

  @SubscribeMessage('game:stay')
  async handleStay(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ): Promise<void> {
    const session = await this.getSession(client.id);
    if (!session || session.roomId !== payload.roomId) return;
    await this.gameService.handleStay(session.roomId, session.playerId);
  }

  @SubscribeMessage('game:use_second_chance')
  async handleUseSecondChance(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ): Promise<void> {
    const session = await this.getSession(client.id);
    if (!session || session.roomId !== payload.roomId) return;
    await this.gameService.handleSecondChance(session.roomId, session.playerId);
  }

  @SubscribeMessage('game:select_action_target')
  async handleSelectActionTarget(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; targetPlayerId: string },
  ): Promise<void> {
    const session = await this.getSession(client.id);
    if (!session || session.roomId !== payload.roomId) return;
    await this.gameService.handleActionTarget(
      session.roomId,
      session.playerId,
      payload.targetPlayerId,
    );
  }

  // ── Session helpers ─────────────────────────────────────────────────────────

  private sessionKey(socketId: string): string {
    return `session:${socketId}`;
  }

  private async saveSession(
    socketId: string,
    data: SessionData,
  ): Promise<void> {
    await this.redis.set(
      this.sessionKey(socketId),
      JSON.stringify(data),
      'EX',
      SESSION_TTL_SECONDS,
    );
  }

  private async getSession(socketId: string): Promise<SessionData | null> {
    const raw = await this.redis.get(this.sessionKey(socketId));
    return raw ? (JSON.parse(raw) as SessionData) : null;
  }

  private async deleteSession(socketId: string): Promise<void> {
    await this.redis.del(this.sessionKey(socketId));
  }
}
