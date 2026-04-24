import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@flip7/shared";

const SERVER_URL = import.meta.env.VITE_API_URL ?? "";

type LobbySocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let _lobbySocket: LobbySocket | null = null;
let _gameSocket: GameSocket | null = null;

export function getLobbySocket(): LobbySocket {
  if (!_lobbySocket) {
    _lobbySocket = io(`${SERVER_URL}/lobby`, {
      autoConnect: false,
      transports: ["websocket"],
    });
  }
  return _lobbySocket;
}

export function getGameSocket(playerId: string, roomId: string): GameSocket {
  if (!_gameSocket) {
    _gameSocket = io(`${SERVER_URL}/game`, {
      autoConnect: false,
      transports: ["websocket"],
      auth: { playerId, roomId },
    });
  }
  return _gameSocket;
}

export function disconnectLobbySocket(): void {
  _lobbySocket?.disconnect();
  _lobbySocket = null;
}

export function disconnectGameSocket(): void {
  _gameSocket?.disconnect();
  _gameSocket = null;
}
