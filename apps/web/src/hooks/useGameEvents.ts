import { useEffect } from 'react';
import { getGameSocket } from '../lib/socket';
import { useGameStore } from '../store/useGameStore';

export function useGameEvents() {
  const {
    setGameState,
    updateGameState,
    setTurnExpiry,
    setBustWarning,
    setSelectTargetPrompt,
    setRoundEnd,
    setGameOver,
  } = useGameStore();

  useEffect(() => {
    // Socket must already be initialized by GamePage before this effect runs.
    const socket = getGameSocket('', '');

    socket.on('game:reconnected', ({ gameState, yourPlayerId }) => {
      setGameState(gameState, yourPlayerId);
    });

    socket.on('game:started', ({ gameState, yourPlayerId }) => {
      setGameState(gameState, yourPlayerId);
    });

    socket.on('game:state_update', ({ gameState }) => {
      updateGameState(gameState);
    });

    socket.on('game:your_turn', ({ expiresAt }) => {
      setTurnExpiry(expiresAt);
    });

    socket.on('game:bust_warning', (payload) => {
      setBustWarning(payload);
    });

    socket.on('game:select_target', ({ action, validTargetIds, expiresAt }) => {
      setSelectTargetPrompt({ action, validTargetIds, expiresAt });
    });

    socket.on('game:round_end', (payload) => {
      setRoundEnd(payload);
    });

    socket.on('game:over', (payload) => {
      setGameOver(payload);
    });

    return () => {
      socket.off('game:reconnected');
      socket.off('game:started');
      socket.off('game:state_update');
      socket.off('game:your_turn');
      socket.off('game:bust_warning');
      socket.off('game:select_target');
      socket.off('game:round_end');
      socket.off('game:over');
    };
  }, [setGameState, updateGameState, setTurnExpiry, setBustWarning, setSelectTargetPrompt, setRoundEnd, setGameOver]);
}
