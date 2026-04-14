import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getLobbySocket, disconnectLobbySocket } from '../lib/socket';
import { useRoomStore } from '../store/useRoomStore';

export function useLobbyEvents(roomId: string) {
  const navigate = useNavigate();
  const { setRoom, addPlayer, removePlayer, setCanStart } = useRoomStore();

  useEffect(() => {
    const socket = getLobbySocket();

    socket.on('lobby:state', (payload) => {
      setRoom(payload);
    });

    socket.on('lobby:player_joined', ({ player }) => {
      addPlayer(player);
    });

    socket.on('lobby:player_left', ({ playerId, newHostId }) => {
      removePlayer(playerId, newHostId);
    });

    socket.on('lobby:game_starting', () => {
      disconnectLobbySocket();
      navigate(`/game/${roomId}`);
    });

    socket.on('lobby:error', ({ message }) => {
      toast.error(message);
    });

    return () => {
      socket.off('lobby:state');
      socket.off('lobby:player_joined');
      socket.off('lobby:player_left');
      socket.off('lobby:game_starting');
      socket.off('lobby:error');
    };
  }, [roomId, navigate, setRoom, addPlayer, removePlayer, setCanStart]);
}
