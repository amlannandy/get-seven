import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Card } from '@flip7/shared';
import { getGameSocket } from '../../lib/socket';
import { useGameStore } from '../../store/useGameStore';
import CardComponent from './CardComponent';

interface Props {
  duplicateCard: Card;
  hasSecondChance: boolean;
  windowMs: number;
  roomId: string;
}

export default function BustWarningModal({ duplicateCard, hasSecondChance, windowMs, roomId }: Props) {
  const clearBustWarning = useGameStore((s) => s.clearBustWarning);
  const [remaining, setRemaining] = useState(windowMs);

  useEffect(() => {
    const tick = setInterval(() => {
      setRemaining((r) => {
        if (r <= 100) {
          clearInterval(tick);
          clearBustWarning();
          return 0;
        }
        return r - 100;
      });
    }, 100);
    return () => clearInterval(tick);
  }, [windowMs, clearBustWarning]);

  function handleUseSecondChance() {
    getGameSocket('', '').emit('game:use_second_chance', { roomId });
    clearBustWarning();
  }

  const pct = (remaining / windowMs) * 100;
  const secs = Math.ceil(remaining / 1000);

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      className="absolute inset-0 flex items-center justify-center z-20 p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-xs rounded-2xl p-6 flex flex-col gap-5 items-center text-center"
        style={{
          background: 'var(--color-panel-bg)',
          border: '1px solid var(--color-danger)',
          boxShadow: '0 0 32px rgba(239,68,68,0.3)',
        }}
      >
        <p
          className="text-2xl font-bold"
          style={{ fontFamily: 'var(--font-fredoka)', color: 'var(--color-danger)' }}
        >
          💥 BUST!
        </p>

        <p className="text-sm text-slate-400">You drew a duplicate</p>

        <CardComponent card={duplicateCard} size="lg" />

        {/* Timer bar */}
        <div className="w-full flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <div
              className="h-full rounded-full transition-all timer-urgent"
              style={{ width: `${pct}%`, background: 'var(--color-danger)', transition: 'width 0.1s linear' }}
            />
          </div>
          <span className="text-xs font-bold" style={{ fontFamily: 'var(--font-fredoka)', color: 'var(--color-danger)' }}>
            {secs}s
          </span>
        </div>

        {hasSecondChance ? (
          <button
            onClick={handleUseSecondChance}
            className="w-full rounded-xl py-3 font-bold text-base transition-all active:scale-95"
            style={{
              fontFamily: 'var(--font-fredoka)',
              background: '#86efac',
              color: '#1a1a1a',
            }}
          >
            ✦ Use Second Chance
          </button>
        ) : (
          <p className="text-sm text-slate-500">No Second Chance card held</p>
        )}
      </div>
    </motion.div>
  );
}
