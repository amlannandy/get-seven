import { create } from "zustand";
import type { RoomPlayer } from "@flip7/shared";

interface RoomState {
  roomId: string | null;
  roomCode: string | null;
  maxPlayers: number;
  players: RoomPlayer[];
  hostPlayerId: string | null;
  canStart: boolean;

  setRoom: (payload: {
    roomId: string;
    roomCode: string;
    maxPlayers: number;
    players: RoomPlayer[];
    canStart: boolean;
  }) => void;
  setPlayers: (players: RoomPlayer[]) => void;
  addPlayer: (player: RoomPlayer) => void;
  removePlayer: (playerId: string, newHostId: string | null) => void;
  setCanStart: (canStart: boolean) => void;
  clearRoom: () => void;
}

export const useRoomStore = create<RoomState>()((set) => ({
  roomId: null,
  roomCode: null,
  maxPlayers: 18,
  players: [],
  hostPlayerId: null,
  canStart: false,

  setRoom: ({ roomId, roomCode, maxPlayers, players, canStart }) =>
    set({
      roomId,
      roomCode,
      maxPlayers,
      players,
      canStart,
      hostPlayerId: players.find((p) => p.isConnected)?.id ?? null,
    }),

  setPlayers: (players) => set({ players }),

  addPlayer: (player) => set((s) => ({ players: [...s.players, player] })),

  removePlayer: (playerId, newHostId) =>
    set((s) => ({
      players: s.players.filter((p) => p.id !== playerId),
      hostPlayerId: newHostId ?? s.hostPlayerId,
    })),

  setCanStart: (canStart) => set({ canStart }),

  clearRoom: () =>
    set({
      roomId: null,
      roomCode: null,
      maxPlayers: 18,
      players: [],
      hostPlayerId: null,
      canStart: false,
    }),
}));
