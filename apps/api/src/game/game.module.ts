import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Room } from '../rooms/entities/room.entity';
import { DeckService } from './deck.service';
import { ScoringService } from './scoring.service';
import { GameEngineService } from './game-engine.service';
import { GameStateService } from './game-state.service';
import { GameService } from './game.service';
import { GameGateway } from './game.gateway';

@Module({
  imports: [TypeOrmModule.forFeature([Room])],
  providers: [
    DeckService,
    ScoringService,
    GameEngineService,
    GameStateService,
    GameService,
    GameGateway,
  ],
  exports: [GameService, GameStateService],
})
export class GameModule {}
