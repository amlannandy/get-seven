import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useGameStore } from "../../store/useGameStore";
import { usePlayerStore } from "../../store/usePlayerStore";
import { disconnectGameSocket } from "../../lib/socket";

interface Props {
  winnerId: string;
  winnerName: string;
  finalScores: Record<string, number>;
  playerNames: Record<string, string>;
}

export default function GameOverScreen({
  winnerId,
  winnerName,
  finalScores,
  playerNames,
}: Props) {
  const navigate = useNavigate();
  const resetGame = useGameStore((s) => s.resetGame);
  const clearIdentity = usePlayerStore((s) => s.clearIdentity);

  const sorted = Object.entries(finalScores).sort(([, a], [, b]) => b - a);

  function handlePlayAgain() {
    resetGame();
    clearIdentity();
    disconnectGameSocket();
    navigate("/");
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-8 p-4"
      style={{ background: "var(--color-table-bg)" }}
    >
      {/* Winner announcement */}
      <div className="text-center flex flex-col gap-2">
        <p
          className="text-5xl font-bold"
          style={{
            fontFamily: "var(--font-fredoka)",
            color: "var(--color-flip7-gold)",
          }}
        >
          🏆
        </p>
        <p
          className="text-3xl font-bold"
          style={{
            fontFamily: "var(--font-fredoka)",
            color: "var(--color-flip7-gold)",
          }}
        >
          {winnerName} wins!
        </p>
        <p className="text-sm text-slate-400">
          Final score: {finalScores[winnerId]} pts
        </p>
      </div>

      {/* Final leaderboard */}
      <div
        className="w-full max-w-xs rounded-2xl p-4 flex flex-col gap-2"
        style={{
          background: "var(--color-panel-bg)",
          border: "1px solid var(--color-panel-border)",
        }}
      >
        <p
          className="text-xs text-slate-400 uppercase tracking-wider mb-1"
          style={{ fontFamily: "var(--font-fredoka)" }}
        >
          Final Standings
        </p>
        {sorted.map(([pid, score], i) => (
          <div
            key={pid}
            className="flex items-center gap-3 px-2 py-1.5 rounded-lg"
            style={{
              background:
                pid === winnerId ? "rgba(251,191,36,0.1)" : "transparent",
            }}
          >
            <span
              className="text-sm w-5 text-center"
              style={{ fontFamily: "var(--font-fredoka)", color: "#6b7280" }}
            >
              {i + 1}.
            </span>
            <span
              className="flex-1 text-sm font-medium"
              style={{
                fontFamily: "var(--font-fredoka)",
                color: pid === winnerId ? "var(--color-flip7-gold)" : "#f1f5f9",
              }}
            >
              {playerNames[pid] ?? pid}
            </span>
            <span
              className="text-sm font-bold"
              style={{ fontFamily: "var(--font-fredoka)", color: "#f1f5f9" }}
            >
              {score}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={handlePlayAgain}
        className="rounded-xl px-8 py-3 font-bold text-base transition-all active:scale-95"
        style={{
          fontFamily: "var(--font-fredoka)",
          background: "var(--color-primary)",
          color: "#1a1a1a",
        }}
      >
        Play Again
      </button>
    </motion.div>
  );
}
