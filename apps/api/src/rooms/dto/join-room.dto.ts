import { IsString, Length, MaxLength, MinLength } from 'class-validator';

export class JoinRoomDto {
  @IsString()
  @Length(6, 6)
  roomCode: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  displayName: string;
}
