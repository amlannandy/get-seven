export type RoomStatus = 'waiting' | 'in_progress' | 'finished';

export interface RoomPlayer {
  id: string;
  displayName: string;
  isHost: boolean;
  isConnected: boolean;
  totalScore: number;
  seatIndex: number;
}

export interface Room {
  id: string;
  code: string;
  status: RoomStatus;
  maxPlayers: number;
  players: RoomPlayer[];
}
