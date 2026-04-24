import type { PublicPlayerState, Card } from "@flip7/shared";
import PanelHeader from "./PanelHeader";
import CardRow from "./CardRow";
import TurnTimer from "./TurnTimer";
import ActionBar from "./ActionBar";

interface Props {
  player: PublicPlayerState;
  rank: number;
  roomId: string;
  isYourTurn: boolean;
  isFlipThree: boolean;
  turnExpiresAt: number | null;
}

function splitHand(hand: Card[]): { actionMod: Card[]; numbers: Card[] } {
  const actionMod = hand.filter(
    (c) => c.type === "action" || c.type === "modifier",
  );
  const numbers = hand.filter((c) => c.type === "number");
  return { actionMod, numbers };
}

export default function SelfPanel({
  player,
  rank,
  roomId,
  isYourTurn,
  isFlipThree,
  turnExpiresAt,
}: Props) {
  const { actionMod, numbers } = splitHand(player.hand);
  const isBusted = player.status === "busted";
  const showActions = isYourTurn && player.status === "active";

  return (
    <div
      className="flex flex-col gap-3 px-4 py-3"
      style={{
        background: "var(--color-panel-bg)",
        borderTop: "2px solid var(--color-panel-border)",
      }}
    >
      {/* Header row */}
      <PanelHeader
        rank={rank}
        displayName={player.displayName}
        status={player.status}
        roundScore={player.roundScore}
        totalScore={player.totalScore}
        flipThreeRemaining={player.flipThreeRemaining}
        isYou
      />

      {/* Turn status + timer */}
      {showActions && turnExpiresAt !== null ? (
        <TurnTimer expiresAt={turnExpiresAt} />
      ) : (
        <p
          className="text-xs text-slate-500"
          style={{ fontFamily: "var(--font-fredoka)" }}
        >
          {isBusted
            ? "You busted this round"
            : player.status === "stayed"
              ? "You stayed"
              : player.status === "frozen"
                ? "You are frozen"
                : "○ Waiting..."}
        </p>
      )}

      {/* Card rows */}
      <div className="flex flex-col gap-2">
        <CardRow
          cards={actionMod}
          size="md"
          dimmed={isBusted}
          idPrefix={`self-am`}
        />
        <CardRow
          cards={numbers}
          size="md"
          dimmed={isBusted}
          idPrefix={`self-num`}
        />
      </div>

      {/* Action buttons */}
      {showActions && <ActionBar roomId={roomId} isFlipThree={isFlipThree} />}
    </div>
  );
}
