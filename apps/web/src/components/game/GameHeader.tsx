import type { GamePhase } from '@flip7/shared';

interface Props {
  round: number;
  deckSize: number;
  phase: GamePhase;
}

const phaseLabel: Record<GamePhase, string> = {
  dealing: 'Dealing',
  player_turn: 'In Play',
  bust_pending: 'Bust!',
  action_pending: 'Action',
  flip_three: 'Flip Three',
  round_end: 'Round Over',
  game_over: 'Game Over',
};

const phaseDot: Record<GamePhase, string> = {
  dealing: '#94a3b8',
  player_turn: '#4ade80',
  bust_pending: '#ef4444',
  action_pending: '#f59e0b',
  flip_three: '#fb923c',
  round_end: '#818cf8',
  game_over: '#fbbf24',
};

export default function GameHeader({ round, deckSize, phase }: Props) {
  return (
    <header
      className="flex items-center justify-between px-4 py-3 sticky top-0 z-10"
      style={{
        background: 'var(--color-panel-bg)',
        borderBottom: '1px solid var(--color-panel-border)',
      }}
    >
      {/* Logo / Round */}
      <div className="flex items-center gap-3">
        <span
          className="text-xl font-bold"
          style={{ fontFamily: 'var(--font-fredoka)', color: 'var(--color-flip7-gold)' }}
        >
          FLIP 7
        </span>
        <span
          className="text-sm font-medium px-2.5 py-0.5 rounded-full"
          style={{
            background: 'rgba(255,255,255,0.08)',
            color: '#94a3b8',
            fontFamily: 'var(--font-fredoka)',
          }}
        >
          Round {round}
        </span>
      </div>

      {/* Deck + Phase */}
      <div className="flex items-center gap-4">
        <span className="text-sm text-slate-400">
          🃏 <span style={{ fontFamily: 'var(--font-fredoka)' }}>{deckSize}</span>
        </span>
        <div className="flex items-center gap-1.5">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: phaseDot[phase] }}
          />
          <span
            className="text-sm hidden sm:inline"
            style={{ color: phaseDot[phase], fontFamily: 'var(--font-fredoka)' }}
          >
            {phaseLabel[phase]}
          </span>
        </div>
      </div>
    </header>
  );
}
