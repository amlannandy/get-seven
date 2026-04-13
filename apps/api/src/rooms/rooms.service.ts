import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { customAlphabet } from 'nanoid';
import { Room } from './entities/room.entity';
import { RoomPlayer } from './entities/room-player.entity';
import type { RoomStatus } from './entities/room.entity';

const generateCode = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 6);

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(Room) private readonly roomRepo: Repository<Room>,
    @InjectRepository(RoomPlayer) private readonly playerRepo: Repository<RoomPlayer>,
  ) {}

  /**
   * Create a room and its host player (created via HTTP before WS join).
   * The host player starts disconnected — their socketId is set when they
   * connect via lobby:join.
   */
  async createRoom(
    displayName: string,
    maxPlayers: number,
  ): Promise<{ room: Room; hostPlayer: RoomPlayer }> {
    const code = generateCode();

    const room = this.roomRepo.create({
      code,
      maxPlayers,
      status: 'waiting',
      hostPlayerId: null,
    });
    await this.roomRepo.save(room);

    const hostPlayer = this.playerRepo.create({
      roomId: room.id,
      displayName,
      seatIndex: 0,
      socketId: null,
      isConnected: false,
      totalScore: 0,
    });
    await this.playerRepo.save(hostPlayer);

    room.hostPlayerId = hostPlayer.id;
    await this.roomRepo.save(room);

    room.players = [hostPlayer];
    return { room, hostPlayer };
  }

  async findByCode(code: string): Promise<Room | null> {
    return this.roomRepo.findOne({
      where: { code: code.toUpperCase() },
      relations: ['players'],
    });
  }

  async findById(roomId: string): Promise<Room | null> {
    return this.roomRepo.findOne({
      where: { id: roomId },
      relations: ['players'],
    });
  }

  /**
   * Create a new player or reconnect an existing disconnected player with the
   * same display name. Used for both initial join and reconnect flows.
   */
  async addOrReconnectPlayer(
    room: Room,
    displayName: string,
    socketId: string,
  ): Promise<{ player: RoomPlayer; isReconnect: boolean }> {
    const existing = room.players.find(
      (p) => p.displayName.toLowerCase() === displayName.toLowerCase(),
    );

    if (existing) {
      existing.socketId = socketId;
      existing.isConnected = true;
      const updated = await this.playerRepo.save(existing);
      return { player: updated, isReconnect: true };
    }

    const player = this.playerRepo.create({
      roomId: room.id,
      displayName,
      seatIndex: room.players.length,
      socketId,
      isConnected: true,
      totalScore: 0,
    });
    const saved = await this.playerRepo.save(player);
    return { player: saved, isReconnect: false };
  }

  /**
   * Remove a player from the room. If they were the host, transfers host to the
   * remaining player with the lowest seatIndex. Returns the new hostId (if
   * transferred) and the roomId.
   */
  async removePlayer(
    playerId: string,
  ): Promise<{ newHostId: string | null; roomId: string }> {
    const player = await this.playerRepo.findOne({ where: { id: playerId } });
    if (!player) return { newHostId: null, roomId: '' };

    const { roomId } = player;
    await this.playerRepo.delete(playerId);

    const room = await this.roomRepo.findOne({
      where: { id: roomId },
      relations: ['players'],
    });
    if (!room || room.players.length === 0) return { newHostId: null, roomId };

    if (room.hostPlayerId === playerId) {
      const next = room.players.sort((a, b) => a.seatIndex - b.seatIndex)[0];
      room.hostPlayerId = next.id;
      await this.roomRepo.save(room);
      return { newHostId: next.id, roomId };
    }

    return { newHostId: null, roomId };
  }

  async setPlayerConnected(
    playerId: string,
    socketId: string | null,
    isConnected: boolean,
  ): Promise<void> {
    await this.playerRepo.update(playerId, { socketId, isConnected });
  }

  async transferHost(roomId: string, newHostId: string): Promise<void> {
    await this.roomRepo.update(roomId, { hostPlayerId: newHostId });
  }

  async updateRoomStatus(roomId: string, status: RoomStatus): Promise<void> {
    await this.roomRepo.update(roomId, { status });
  }
}
