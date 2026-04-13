import { Module } from '@nestjs/common';

import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { RoomsModule } from './rooms/rooms.module';
import { GameModule } from './game/game.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RedisModule,
    RoomsModule,
    GameModule,
    // SchedulerModule — added in later phase
  ],
})
export class AppModule {}
