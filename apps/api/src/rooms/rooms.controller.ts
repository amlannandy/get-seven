import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAX_PLAYERS } from '@flip7/shared';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';

@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly config: ConfigService,
  ) {}

  /** Create a room and its host player. Returns credentials for the host. */
  @Post()
  async createRoom(@Body() dto: CreateRoomDto) {
    const { room, hostPlayer } = await this.roomsService.createRoom(
      dto.displayName,
      dto.maxPlayers ?? MAX_PLAYERS,
    );

    const clientUrl = this.config.get<string>(
      'CLIENT_URL',
      'http://localhost:3000',
    );
    return {
      roomId: room.id,
      roomCode: room.code,
      playerId: hostPlayer.id,
      shareUrl: `${clientUrl}/join/${room.code}`,
    };
  }

  /** Pre-check before the join page: is this room joinable? */
  @Get(':code')
  async getRoomByCode(@Param('code') code: string) {
    const room = await this.roomsService.findByCode(code);
    if (!room) throw new NotFoundException('Room not found');

    return {
      roomId: room.id,
      roomCode: room.code,
      status: room.status,
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers,
    };
  }
}
