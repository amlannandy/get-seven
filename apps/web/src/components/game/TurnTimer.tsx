import { useEffect, useState } from 'react';

interface Props {
  expiresAt: number;
}

export default function TurnTimer({ expiresAt }: Props) {
  const [remaining, setRemaining] = useState(Math.max(0, expiresAt - Date.now()));

  useEffect(() => {
    const tick = () => {
      setRemaining(Math.max(0, expiresAt - Date.now()));
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [expiresAt]);

  const total = expiresAt - (expiresAt - 30_000); // approximate 30s window
  const pct = Math.min(100, (remaining / 30_000) * 100);
  const secs = Math.ceil(remaining / 1000);
  const isUrgent = secs <= 5;

  return (
    <div className="flex items-center gap-2 w-full">
      {/* Bar */}
      <div
        className="flex-1 h-1.5 rounded-full overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.1)' }}
      >
        <div
          className={`h-full rounded-full transition-all ${isUrgent ? 'timer-urgent' : ''}`}
          style={{
            width: `${pct}%`,
            background: isUrgent ? 'var(--color-danger)' : 'var(--color-primary)',
            transition: 'width 0.1s linear',
          }}
        />
      </div>

      {/* Countdown */}
      <span
        className={`text-xs font-bold w-6 text-right flex-shrink-0 ${isUrgent ? 'timer-urgent' : ''}`}
        style={{
          fontFamily: 'var(--font-fredoka)',
          color: isUrgent ? 'var(--color-danger)' : '#94a3b8',
        }}
      >
        {secs}s
      </span>
    </div>
  );
}
