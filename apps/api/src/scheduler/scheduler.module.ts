import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Room } from '../rooms/entities/room.entity';
import { GameModule } from '../game/game.module';
import { TurnTimeoutProcessor } from './turn-timeout.processor';
import { RoomCleanupProcessor } from './room-cleanup.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'turn-timeout' }, { name: 'room-cleanup' }),
    TypeOrmModule.forFeature([Room]),
    GameModule,
  ],
  providers: [TurnTimeoutProcessor, RoomCleanupProcessor],
})
export class SchedulerModule {}
