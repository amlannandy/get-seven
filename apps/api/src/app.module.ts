import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { RoomsModule } from './rooms/rooms.module';
import { GameModule } from './game/game.module';
import { SchedulerModule } from './scheduler/scheduler.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RedisModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
    RoomsModule,
    GameModule,
    SchedulerModule,
  ],
})
export class AppModule {}
