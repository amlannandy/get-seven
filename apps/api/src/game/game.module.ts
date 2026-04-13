import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Room } from '../rooms/entities/room.entity';
import { WsPlayerGuard } from '../common/guards/ws-player.guard';
import { WsExceptionFilter } from '../common/filters/ws-exception.filter';
import { DeckService } from './deck.service';
import { ScoringService } from './scoring.service';
import { GameEngineService } from './game-engine.service';
import { GameStateService } from './game-state.service';
import { GameService } from './game.service';
import { GameGateway } from './game.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([Room]),
    BullModule.registerQueue(
      { name: 'turn-timeout' },
      { name: 'room-cleanup' },
    ),
  ],
  providers: [
    DeckService,
    ScoringService,
    GameEngineService,
    GameStateService,
    GameService,
    GameGateway,
    WsPlayerGuard,
    WsExceptionFilter,
  ],
  exports: [GameService, GameStateService],
})
export class GameModule {}
