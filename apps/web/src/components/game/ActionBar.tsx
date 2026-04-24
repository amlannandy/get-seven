import { getGameSocket } from "../../lib/socket";

interface Props {
  roomId: string;
  isFlipThree?: boolean;
}

export default function ActionBar({ roomId, isFlipThree = false }: Props) {
  function handleHit() {
    getGameSocket("", "").emit("game:hit", { roomId });
  }

  function handleStay() {
    getGameSocket("", "").emit("game:stay", { roomId });
  }

  return (
    <div className="flex gap-3 w-full">
      <button
        onClick={handleHit}
        className="flex-1 rounded-xl py-3 font-bold text-base transition-all active:scale-95"
        style={{
          fontFamily: "var(--font-fredoka)",
          background: "var(--color-primary)",
          color: "#1a1a1a",
          boxShadow: "0 4px 12px rgba(245,158,11,0.3)",
        }}
      >
        HIT
      </button>

      {!isFlipThree && (
        <button
          onClick={handleStay}
          className="flex-1 rounded-xl py-3 font-bold text-base transition-all active:scale-95"
          style={{
            fontFamily: "var(--font-fredoka)",
            background: "rgba(255,255,255,0.08)",
            color: "#f1f5f9",
            border: "1px solid var(--color-panel-border)",
          }}
        >
          STAY
        </button>
      )}
    </div>
  );
}
