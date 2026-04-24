import type { PlayerStatus } from "@flip7/shared";

interface Props {
  rank: number;
  displayName: string;
  status: PlayerStatus;
  roundScore: number;
  totalScore: number;
  flipThreeRemaining?: number;
  isYou?: boolean;
}

const statusConfig: Record<
  PlayerStatus,
  { label: string; color: string; icon: string }
> = {
  active: { label: "Active", color: "#f59e0b", icon: "●" },
  stayed: { label: "Stayed", color: "#6b7280", icon: "✓" },
  busted: { label: "Busted", color: "#ef4444", icon: "💥" },
  frozen: { label: "Frozen", color: "#93c5fd", icon: "❄" },
  flip7: { label: "Flip 7!", color: "#fbbf24", icon: "★" },
};

export default function PanelHeader({
  rank,
  displayName,
  status,
  roundScore,
  totalScore,
  flipThreeRemaining,
  isYou = false,
}: Props) {
  const cfg = statusConfig[status];
  const isFlipThree =
    status === "active" &&
    flipThreeRemaining !== undefined &&
    flipThreeRemaining > 0;

  return (
    <div className="flex items-center gap-2 min-w-0">
      {/* Rank */}
      <span
        className="text-xs font-bold w-6 text-center flex-shrink-0"
        style={{ fontFamily: "var(--font-fredoka)", color: "#6b7280" }}
      >
        #{rank}
      </span>

      {/* Name */}
      <span
        className="flex-1 text-sm font-semibold truncate min-w-0"
        style={{
          fontFamily: "var(--font-fredoka)",
          color: isYou ? "var(--color-primary)" : "#f1f5f9",
        }}
      >
        {displayName}
        {isYou && <span className="ml-1 text-xs opacity-50">(you)</span>}
      </span>

      {/* Status chip */}
      <span
        className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 hidden sm:inline-flex items-center gap-1"
        style={{
          background: `${cfg.color}22`,
          color: cfg.color,
          border: `1px solid ${cfg.color}44`,
          fontFamily: "var(--font-fredoka)",
        }}
      >
        {cfg.icon}
        {isFlipThree ? `Flip Three (${flipThreeRemaining})` : cfg.label}
      </span>

      {/* Scores */}
      <div className="flex items-center gap-1 flex-shrink-0 text-right">
        <span
          className="text-sm font-bold"
          style={{ fontFamily: "var(--font-fredoka)", color: "#f1f5f9" }}
        >
          {roundScore}
        </span>
        <span className="text-slate-600 text-xs">│</span>
        <span
          className="text-sm"
          style={{ fontFamily: "var(--font-fredoka)", color: "#94a3b8" }}
        >
          {totalScore}
        </span>
      </div>
    </div>
  );
}
