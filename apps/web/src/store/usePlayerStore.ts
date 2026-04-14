import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PlayerState {
  playerId: string | null;
  roomId: string | null;
  roomCode: string | null;
  displayName: string | null;
  setIdentity: (playerId: string, roomId: string, roomCode: string, displayName: string) => void;
  clearIdentity: () => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      playerId: null,
      roomId: null,
      roomCode: null,
      displayName: null,
      setIdentity: (playerId, roomId, roomCode, displayName) =>
        set({ playerId, roomId, roomCode, displayName }),
      clearIdentity: () =>
        set({ playerId: null, roomId: null, roomCode: null, displayName: null }),
    }),
    {
      name: 'flip7-player',
    },
  ),
);
