import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useGameStore } from "../../store/useGameStore";

interface Props {
  roundNumber: number;
  roundScores: Record<string, number>;
  cumulativeScores: Record<string, number>;
  flip7PlayerId: string | null;
  playerNames: Record<string, string>;
}

export default function RoundEndOverlay({
  roundNumber,
  roundScores,
  cumulativeScores,
  flip7PlayerId,
  playerNames,
}: Props) {
  const clearRoundEnd = useGameStore((s) => s.clearRoundEnd);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(id);
          clearRoundEnd();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [clearRoundEnd]);

  const sorted = Object.entries(cumulativeScores).sort(([, a], [, b]) => b - a);

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      className="absolute inset-0 z-30 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-5 flex flex-col gap-4"
        style={{
          background: "var(--color-panel-bg)",
          border: "1px solid var(--color-panel-border)",
          boxShadow: "0 8px 48px rgba(0,0,0,0.5)",
        }}
      >
        <div className="text-center">
          <p
            className="text-2xl font-bold"
            style={{
              fontFamily: "var(--font-fredoka)",
              color: "var(--color-flip7-gold)",
            }}
          >
            Round {roundNumber} Over
          </p>
          {flip7PlayerId && (
            <p className="text-sm text-amber-400 mt-1">
              ★ {playerNames[flip7PlayerId] ?? "Someone"} got Flip 7!
            </p>
          )}
        </div>

        {/* Score table */}
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-3 text-xs text-slate-500 uppercase tracking-wider px-2">
            <span>Player</span>
            <span className="text-right">This Round</span>
            <span className="text-right">Total</span>
          </div>
          {sorted.map(([pid, total], i) => {
            const round = roundScores[pid] ?? 0;
            return (
              <div
                key={pid}
                className="grid grid-cols-3 items-center px-2 py-1.5 rounded-lg"
                style={{
                  background:
                    i === 0
                      ? "rgba(251,191,36,0.08)"
                      : "rgba(255,255,255,0.03)",
                }}
              >
                <span
                  className="text-sm font-medium truncate"
                  style={{
                    fontFamily: "var(--font-fredoka)",
                    color: i === 0 ? "var(--color-flip7-gold)" : "#f1f5f9",
                  }}
                >
                  {i === 0 ? "★ " : ""}
                  {playerNames[pid] ?? pid}
                </span>
                <span
                  className="text-sm text-right"
                  style={{
                    fontFamily: "var(--font-fredoka)",
                    color: round === 0 ? "#6b7280" : "#4ade80",
                  }}
                >
                  +{round}
                </span>
                <span
                  className="text-sm text-right font-bold"
                  style={{
                    fontFamily: "var(--font-fredoka)",
                    color: "#f1f5f9",
                  }}
                >
                  {total}
                </span>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-slate-500">
          Next round in {countdown}s...
        </p>
      </div>
    </motion.div>
  );
}
