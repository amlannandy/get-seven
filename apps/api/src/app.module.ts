import { Module } from '@nestjs/common';

import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RedisModule,
    // RoomsModule, GameModule, SchedulerModule — added in later phases
  ],
})
export class AppModule {}
