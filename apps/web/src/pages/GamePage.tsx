import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { usePlayerStore } from '../store/usePlayerStore';
import { useGameStore } from '../store/useGameStore';
import { getGameSocket, disconnectGameSocket } from '../lib/socket';
import { useGameEvents } from '../hooks/useGameEvents';
import GameHeader from '../components/game/GameHeader';
import OpponentPanel from '../components/game/OpponentPanel';
import SelfPanel from '../components/game/SelfPanel';
import BustWarningModal from '../components/game/BustWarningModal';
import SelectTargetModal from '../components/game/SelectTargetModal';
import RoundEndOverlay from '../components/game/RoundEndOverlay';
import GameOverScreen from '../components/game/GameOverScreen';

export default function GamePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { playerId, displayName } = usePlayerStore();
  const {
    gameState,
    yourPlayerId,
    turnExpiresAt,
    bustWarning,
    selectTargetPrompt,
    lastRoundEnd,
    gameOver,
    resetGame,
  } = useGameStore();

  // Create the singleton with correct auth synchronously during render,
  // before useGameEvents' useEffect runs and calls getGameSocket('', '').
  if (playerId && roomId) {
    getGameSocket(playerId, roomId);
  }

  useGameEvents();

  useEffect(() => {
    if (!playerId || !roomId) return;
    const socket = getGameSocket(playerId, roomId);
    if (!socket.connected) socket.connect();

    return () => {
      disconnectGameSocket();
      resetGame();
    };
  }, [playerId, roomId, resetGame]);

  // Derive ranks from cumulative scores
  function getRanks(playerStates: NonNullable<typeof gameState>['playerStates']): Record<string, number> {
    const sorted = [...playerStates].sort((a, b) => b.totalScore - a.totalScore);
    const ranks: Record<string, number> = {};
    sorted.forEach((p, i) => { ranks[p.playerId] = i + 1; });
    return ranks;
  }

  // Build display name map from current playerStates
  function getPlayerNames(): Record<string, string> {
    if (!gameState) return {};
    return Object.fromEntries(gameState.playerStates.map((p) => [p.playerId, p.displayName]));
  }

  if (!gameState) {
    return (
      <div className="flex h-dvh items-center justify-center" style={{ background: 'var(--color-table-bg)' }}>
        <p className="text-slate-400" style={{ fontFamily: 'var(--font-fredoka)' }}>Connecting...</p>
      </div>
    );
  }

  const selfPlayer = gameState.playerStates.find((p) => p.playerId === yourPlayerId);
  const opponents = gameState.playerStates.filter((p) => p.playerId !== yourPlayerId);
  const ranks = getRanks(gameState.playerStates);
  const playerNames = getPlayerNames();

  const isYourTurn = gameState.activePlayerId === yourPlayerId;
  const isFlipThree = gameState.phase === 'flip_three' && isYourTurn;

  return (
    <main
      className="flex flex-col h-dvh overflow-hidden relative"
      style={{ background: 'var(--color-table-bg)' }}
    >
      {/* Sticky header */}
      <GameHeader
        round={gameState.round}
        deckSize={gameState.deckSize}
        phase={gameState.phase}
      />

      {/* Scrollable opponents column */}
      <div className="flex-1 overflow-y-auto opponents-scroll px-3 py-3 flex flex-col gap-2">
        {opponents.map((player) => (
          <OpponentPanel
            key={player.playerId}
            player={player}
            rank={ranks[player.playerId] ?? 0}
            isActive={gameState.activePlayerId === player.playerId}
          />
        ))}
      </div>

      {/* Sticky self panel */}
      {selfPlayer && (
        <SelfPanel
          player={selfPlayer}
          rank={ranks[selfPlayer.playerId] ?? 0}
          roomId={roomId!}
          isYourTurn={isYourTurn}
          isFlipThree={isFlipThree}
          turnExpiresAt={isYourTurn ? turnExpiresAt : null}
        />
      )}

      {/* Overlays */}
      <AnimatePresence>
        {bustWarning && selfPlayer && (
          <BustWarningModal
            key="bust"
            duplicateCard={bustWarning.duplicateCard}
            hasSecondChance={bustWarning.hasSecondChance}
            windowMs={bustWarning.windowMs}
            roomId={roomId!}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectTargetPrompt && (
          <SelectTargetModal
            key="target"
            action={selectTargetPrompt.action}
            validTargetIds={selectTargetPrompt.validTargetIds}
            expiresAt={selectTargetPrompt.expiresAt}
            roomId={roomId!}
            players={gameState.playerStates}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lastRoundEnd && (
          <RoundEndOverlay
            key="round-end"
            roundNumber={lastRoundEnd.roundNumber}
            roundScores={lastRoundEnd.roundScores}
            cumulativeScores={lastRoundEnd.cumulativeScores}
            flip7PlayerId={lastRoundEnd.flip7PlayerId}
            playerNames={playerNames}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {gameOver && (
          <GameOverScreen
            key="game-over"
            winnerId={gameOver.winnerId}
            winnerName={gameOver.winnerName}
            finalScores={gameOver.finalScores}
            playerNames={playerNames}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
