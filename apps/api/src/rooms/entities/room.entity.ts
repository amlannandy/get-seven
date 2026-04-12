import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { RoomPlayer } from './room-player.entity';

export type RoomStatus = 'waiting' | 'in_progress' | 'finished';

@Entity('rooms')
export class Room {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 6, unique: true })
  code: string;

  @Column({ type: 'varchar', default: 'waiting' })
  status: RoomStatus;

  @Column({ nullable: true, type: 'uuid' })
  hostPlayerId: string | null;

  @Column({ default: 18 })
  maxPlayers: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true, type: 'timestamptz' })
  finishedAt: Date | null;

  @OneToMany(() => RoomPlayer, (rp) => rp.room, { cascade: true })
  players: RoomPlayer[];
}
