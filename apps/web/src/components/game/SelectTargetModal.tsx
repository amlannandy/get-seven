import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { ActionKind, PublicPlayerState } from "@flip7/shared";
import { getGameSocket } from "../../lib/socket";
import { useGameStore } from "../../store/useGameStore";

interface Props {
  action: ActionKind;
  validTargetIds: string[];
  expiresAt: number;
  roomId: string;
  players: PublicPlayerState[];
}

const actionLabel: Record<ActionKind, string> = {
  freeze: "❄ Freeze",
  flip_three: "🔥 Flip Three",
  second_chance: "✦ Second Chance",
};

const actionColor: Record<ActionKind, string> = {
  freeze: "#67e8f9",
  flip_three: "#fb923c",
  second_chance: "#86efac",
};

export default function SelectTargetModal({
  action,
  validTargetIds,
  expiresAt,
  roomId,
  players,
}: Props) {
  const clearSelectTargetPrompt = useGameStore(
    (s) => s.clearSelectTargetPrompt,
  );
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, expiresAt - Date.now()),
  );

  useEffect(() => {
    const tick = setInterval(() => {
      const r = Math.max(0, expiresAt - Date.now());
      setRemaining(r);
      if (r === 0) {
        clearInterval(tick);
        clearSelectTargetPrompt();
      }
    }, 100);
    return () => clearInterval(tick);
  }, [expiresAt, clearSelectTargetPrompt]);

  function handleSelect(targetPlayerId: string) {
    getGameSocket("", "").emit("game:select_action_target", {
      roomId,
      targetPlayerId,
    });
    clearSelectTargetPrompt();
  }

  const total = 15_000;
  const pct = (remaining / total) * 100;
  const secs = Math.ceil(remaining / 1000);
  const validTargets = players.filter((p) =>
    validTargetIds.includes(p.playerId),
  );

  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      className="absolute inset-x-0 bottom-0 z-20 p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="w-full max-w-md mx-auto rounded-2xl p-5 flex flex-col gap-4"
        style={{
          background: "var(--color-panel-bg)",
          border: `1px solid ${actionColor[action]}`,
          boxShadow: `0 0 24px ${actionColor[action]}44`,
        }}
      >
        {/* Title + timer */}
        <div className="flex items-center justify-between">
          <p
            className="text-lg font-bold"
            style={{
              fontFamily: "var(--font-fredoka)",
              color: actionColor[action],
            }}
          >
            {actionLabel[action]} — Choose a target
          </p>
          <span
            className="text-sm font-bold"
            style={{ fontFamily: "var(--font-fredoka)", color: "#94a3b8" }}
          >
            {secs}s
          </span>
        </div>

        {/* Timer bar */}
        <div
          className="h-1 rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.1)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: actionColor[action],
              transition: "width 0.1s linear",
            }}
          />
        </div>

        {/* Target grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {validTargets.map((p) => (
            <button
              key={p.playerId}
              onClick={() => handleSelect(p.playerId)}
              className="rounded-xl py-3 px-2 flex flex-col items-center gap-1 transition-all active:scale-95"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--color-panel-border)",
                color: "#f1f5f9",
              }}
            >
              <span
                className="text-sm font-bold truncate w-full text-center"
                style={{ fontFamily: "var(--font-fredoka)" }}
              >
                {p.displayName}
              </span>
              <span className="text-xs text-slate-400">{p.totalScore} pts</span>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
