import { useEffect } from "react";
import { getGameSocket } from "../lib/socket";
import { useGameStore } from "../store/useGameStore";

export function useGameEvents(playerId: string | null, roomId: string | null) {
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
    if (!playerId || !roomId) return;
    // Always call with real credentials so the singleton is created correctly
    // even if Strict Mode teardown destroyed the previous instance.
    const socket = getGameSocket(playerId, roomId);

    socket.on("game:reconnected", ({ gameState, yourPlayerId }) => {
      console.log("Reconnected to game, syncing state", {
        gameState,
        yourPlayerId,
      });
      setGameState(gameState, yourPlayerId);
    });

    socket.on("game:started", ({ gameState, yourPlayerId }) => {
      console.log("Game started", { gameState, yourPlayerId });
      setGameState(gameState, yourPlayerId);
    });

    socket.on("game:state_update", ({ gameState }) => {
      updateGameState(gameState);
    });

    socket.on("game:your_turn", ({ expiresAt }) => {
      setTurnExpiry(expiresAt);
    });

    socket.on("game:bust_warning", (payload) => {
      setBustWarning(payload);
    });

    socket.on("game:select_target", ({ action, validTargetIds, expiresAt }) => {
      setSelectTargetPrompt({ action, validTargetIds, expiresAt });
    });

    socket.on("game:round_end", (payload) => {
      setRoundEnd(payload);
    });

    socket.on("game:over", (payload) => {
      setGameOver(payload);
    });

    return () => {
      socket.off("game:reconnected");
      socket.off("game:started");
      socket.off("game:state_update");
      socket.off("game:your_turn");
      socket.off("game:bust_warning");
      socket.off("game:select_target");
      socket.off("game:round_end");
      socket.off("game:over");
    };
  }, [
    playerId,
    roomId,
    setGameState,
    updateGameState,
    setTurnExpiry,
    setBustWarning,
    setSelectTargetPrompt,
    setRoundEnd,
    setGameOver,
  ]);
}
