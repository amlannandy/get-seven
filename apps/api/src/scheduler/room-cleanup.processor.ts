import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { Room } from '../rooms/entities/room.entity';
import { GameStateService } from '../game/game-state.service';

export interface RoomCleanupJobData {
  roomId: string;
}

@Processor('room-cleanup')
export class RoomCleanupProcessor extends WorkerHost {
  constructor(
    @InjectRepository(Room) private readonly roomRepo: Repository<Room>,
    private readonly gameStateService: GameStateService,
  ) {
    super();
  }

  async process(job: Job<RoomCleanupJobData>): Promise<void> {
    const { roomId } = job.data;

    // Delete room + players (cascade) from Postgres
    await this.roomRepo.delete(roomId);

    // Delete game state and display-names keys from Redis
    await this.gameStateService.deleteState(roomId);
    await this.gameStateService.deleteDisplayNames(roomId);
  }
}
