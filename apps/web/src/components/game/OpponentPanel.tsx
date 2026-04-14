import type { PublicPlayerState } from '@flip7/shared';
import type { Card } from '@flip7/shared';
import PanelHeader from './PanelHeader';
import CardRow from './CardRow';

interface Props {
  player: PublicPlayerState;
  rank: number;
  isActive: boolean;
}

function splitHand(hand: Card[]): { actionMod: Card[]; numbers: Card[] } {
  const actionMod = hand.filter((c) => c.type === 'action' || c.type === 'modifier');
  const numbers = hand.filter((c) => c.type === 'number');
  return { actionMod, numbers };
}

export default function OpponentPanel({ player, rank, isActive }: Props) {
  const { actionMod, numbers } = splitHand(player.hand);
  const isBusted = player.status === 'busted';
  const isFlip7 = player.status === 'flip7';

  let panelClass = '';
  if (isActive) panelClass = 'panel-active';
  if (isFlip7) panelClass = 'panel-flip7';

  return (
    <div
      className={`rounded-xl p-3 flex flex-col gap-2 ${panelClass}`}
      style={{
        background: 'var(--color-panel-bg)',
        border: `1px solid ${isActive ? 'var(--color-primary)' : 'var(--color-panel-border)'}`,
        opacity: isBusted ? 0.6 : 1,
        transition: 'border-color 0.2s, opacity 0.2s',
      }}
    >
      <PanelHeader
        rank={rank}
        displayName={player.displayName}
        status={player.status}
        roundScore={player.roundScore}
        totalScore={player.totalScore}
        flipThreeRemaining={player.flipThreeRemaining}
      />

      {/* Card rows — only shown if player has cards */}
      {(actionMod.length > 0 || numbers.length > 0) && (
        <div className="flex flex-col gap-1.5 pl-8">
          <CardRow
            cards={actionMod}
            size="sm"
            dimmed={isBusted}
            idPrefix={`opp-${player.playerId}-am`}
          />
          <CardRow
            cards={numbers}
            size="sm"
            dimmed={isBusted}
            idPrefix={`opp-${player.playerId}-num`}
          />
        </div>
      )}
    </div>
  );
}
