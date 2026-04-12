import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Room } from './room.entity';

@Entity('room_players')
export class RoomPlayer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  roomId: string;

  @Column({ length: 32 })
  displayName: string;

  @Column({ default: 0 })
  totalScore: number;

  @Column({ nullable: true, type: 'varchar' })
  socketId: string | null;

  @Column({ default: false })
  isConnected: boolean;

  @Column({ default: 0 })
  seatIndex: number;

  @CreateDateColumn()
  joinedAt: Date;

  @ManyToOne(() => Room, (room) => room.players, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roomId' })
  room: Room;
}
