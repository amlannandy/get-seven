import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import type { RoomPlayer } from "@flip7/shared";

interface Props {
  player: RoomPlayer;
  isHost: boolean;
  isYou: boolean;
}

export default function PlayerTile({ player, isHost, isYou }: Props) {
  return (
    <motion.div
      layout
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{
        background: isYou ? "rgba(245,158,11,0.12)" : "rgba(0,0,0,0.2)",
        border: `1px solid ${isYou ? "rgba(245,158,11,0.4)" : "var(--color-panel-border)"}`,
      }}
    >
      {/* Avatar circle */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
        style={{
          background: isYou
            ? "var(--color-primary)"
            : "var(--color-table-felt)",
          color: isYou ? "#1a1a1a" : "#f1f5f9",
          fontFamily: "var(--font-fredoka)",
        }}
      >
        {player.displayName[0].toUpperCase()}
      </div>

      {/* Name */}
      <span
        className="flex-1 text-sm font-medium truncate"
        style={{
          fontFamily: "var(--font-fredoka)",
          color: isYou ? "var(--color-primary)" : "#f1f5f9",
        }}
      >
        {player.displayName}
        {isYou && <span className="ml-1 text-xs opacity-60">(you)</span>}
      </span>

      {/* Host crown */}
      {isHost && (
        <Crown
          size={16}
          style={{ color: "var(--color-flip7-gold)", flexShrink: 0 }}
        />
      )}

      {/* Connection dot */}
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: player.isConnected ? "#4ade80" : "#6b7280" }}
      />
    </motion.div>
  );
}
