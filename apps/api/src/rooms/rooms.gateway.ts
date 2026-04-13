import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Inject } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import type Redis from 'ioredis';
import { MIN_PLAYERS_TO_START, SESSION_TTL_SECONDS } from '@flip7/shared';
import type { RoomPlayer as RoomPlayerDto } from '@flip7/shared';
import { REDIS_CLIENT } from '../redis/redis.module';
import { RoomsService } from './rooms.service';
import type { Room } from './entities/room.entity';
import type { RoomPlayer } from './entities/room-player.entity';

interface SessionData {
  playerId: string;
  roomId: string;
}

@WebSocketGateway({ namespace: '/lobby' })
export class RoomsGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly roomsService: RoomsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

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

  // ── DTO helpers ─────────────────────────────────────────────────────────────

  private toPlayerDto(
    player: RoomPlayer,
    hostPlayerId: string | null,
  ): RoomPlayerDto {
    return {
      id: player.id,
      displayName: player.displayName,
      isHost: player.id === hostPlayerId,
      isConnected: player.isConnected,
      totalScore: player.totalScore,
      seatIndex: player.seatIndex,
    };
  }

  private toLobbyState(room: Room) {
    const players = room.players
      .sort((a, b) => a.seatIndex - b.seatIndex)
      .map((p) => this.toPlayerDto(p, room.hostPlayerId));

    return {
      roomId: room.id,
      roomCode: room.code,
      maxPlayers: room.maxPlayers,
      players,
      canStart:
        room.status === 'waiting' && players.length >= MIN_PLAYERS_TO_START,
    };
  }

  // ── Event handlers ──────────────────────────────────────────────────────────

  @SubscribeMessage('lobby:join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomCode: string; displayName: string },
  ): Promise<void> {
    const { roomCode, displayName } = payload;

    const room = await this.roomsService.findByCode(roomCode);
    if (!room) {
      client.emit('lobby:error', {
        code: 'ROOM_NOT_FOUND',
        message: 'Room not found',
      });
      return;
    }

    if (room.status !== 'waiting') {
      client.emit('lobby:error', {
        code: 'GAME_ALREADY_STARTED',
        message: 'Game has already started',
      });
      return;
    }

    // NAME_TAKEN only applies to currently connected players (not disconnected ones
    // who might be reconnecting with their own name).
    const takenByConnected = room.players.some(
      (p) =>
        p.isConnected &&
        p.displayName.toLowerCase() === displayName.toLowerCase(),
    );
    if (takenByConnected) {
      client.emit('lobby:error', {
        code: 'NAME_TAKEN',
        message: 'Display name already taken',
      });
      return;
    }

    // Check capacity — only count non-reconnecting slots
    const isReconnect = room.players.some(
      (p) => p.displayName.toLowerCase() === displayName.toLowerCase(),
    );
    if (!isReconnect && room.players.length >= room.maxPlayers) {
      client.emit('lobby:error', {
        code: 'ROOM_FULL',
        message: 'Room is full',
      });
      return;
    }

    const { player } = await this.roomsService.addOrReconnectPlayer(
      room,
      displayName,
      client.id,
    );

    await client.join(room.id);
    await this.saveSession(client.id, { playerId: player.id, roomId: room.id });

    const updatedRoom = await this.roomsService.findById(room.id);
    if (!updatedRoom) return;

    // Confirm identity to the joining client
    client.emit('lobby:joined', { yourPlayerId: player.id, roomId: room.id });
    client.emit('lobby:state', this.toLobbyState(updatedRoom));

    // Notify everyone else in the room
    client.to(room.id).emit('lobby:player_joined', {
      player: this.toPlayerDto(player, updatedRoom.hostPlayerId),
    });
  }

  @SubscribeMessage('lobby:leave')
  async handleLeave(@ConnectedSocket() client: Socket): Promise<void> {
    const session = await this.getSession(client.id);
    if (!session) return;

    const { playerId, roomId } = session;
    await this.deleteSession(client.id);

    const { newHostId } = await this.roomsService.removePlayer(playerId);
    await client.leave(roomId);

    this.server.to(roomId).emit('lobby:player_left', { playerId, newHostId });
  }

  @SubscribeMessage('lobby:start_game')
  async handleStartGame(@ConnectedSocket() client: Socket): Promise<void> {
    const session = await this.getSession(client.id);
    if (!session) return;

    const { playerId, roomId } = session;
    const room = await this.roomsService.findById(roomId);
    if (!room) return;

    if (room.hostPlayerId !== playerId) {
      client.emit('lobby:error', {
        code: 'NOT_HOST',
        message: 'Only the host can start the game',
      });
      return;
    }

    if (room.players.length < MIN_PLAYERS_TO_START) {
      client.emit('lobby:error', {
        code: 'NOT_ENOUGH_PLAYERS',
        message: `Need at least ${MIN_PLAYERS_TO_START} players to start`,
      });
      return;
    }

    await this.roomsService.updateRoomStatus(roomId, 'in_progress');
    this.server.to(roomId).emit('lobby:game_starting');

    // TODO: trigger GameService.startGame(roomId) — wired in GameModule phase
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const session = await this.getSession(client.id);
    if (!session) return;

    const { playerId, roomId } = session;
    await this.deleteSession(client.id);
    await this.roomsService.setPlayerConnected(playerId, null, false);

    // If the disconnected player was the host, transfer to the next connected player
    const room = await this.roomsService.findById(roomId);
    let newHostId: string | null = null;
    if (room && room.hostPlayerId === playerId) {
      const nextHost = room.players
        .filter((p) => p.id !== playerId && p.isConnected)
        .sort((a, b) => a.seatIndex - b.seatIndex)[0];

      if (nextHost) {
        await this.roomsService.transferHost(roomId, nextHost.id);
        newHostId = nextHost.id;
      }
    }

    this.server.to(roomId).emit('lobby:player_left', { playerId, newHostId });
  }
}
