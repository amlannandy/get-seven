import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MAX_PLAYERS, MIN_PLAYERS_TO_START } from '@flip7/shared';

export class CreateRoomDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  displayName: string;

  @IsOptional()
  @IsInt()
  @Min(MIN_PLAYERS_TO_START)
  @Max(MAX_PLAYERS)
  maxPlayers?: number;
}
