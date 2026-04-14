import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { usePlayerStore } from '../store/usePlayerStore';
import { useRoomStore } from '../store/useRoomStore';
import { getLobbySocket, disconnectLobbySocket } from '../lib/socket';

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const setIdentity = usePlayerStore((s) => s.setIdentity);
  const setRoom = useRoomStore((s) => s.setRoom);

  const [displayName, setDisplayName] = useState(searchParams.get('name') ?? '');
  const [roomCode, setRoomCode] = useState(code ?? '');
  const [loading, setLoading] = useState(false);
  const joined = useRef(false);

  useEffect(() => {
    return () => {
      if (!joined.current) disconnectLobbySocket();
    };
  }, []);

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const name = displayName.trim();
    const codeVal = roomCode.trim().toUpperCase();
    if (!name || !codeVal || loading) return;

    setLoading(true);
    const socket = getLobbySocket();

    socket.once('lobby:joined', ({ yourPlayerId, roomId }) => {
      joined.current = true;
      setIdentity(yourPlayerId, roomId, codeVal, name);
    });

    socket.once('lobby:state', (payload) => {
      setRoom(payload);
      navigate(`/lobby/${payload.roomId}`);
    });

    socket.once('lobby:error', ({ message }) => {
      toast.error(message);
      setLoading(false);
      socket.disconnect();
    });

    socket.connect();
    socket.emit('lobby:join', { roomCode: codeVal, displayName: name });
  }

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center gap-8 px-4"
      style={{ background: 'var(--color-table-bg)' }}
    >
      <div className="text-center">
        <h1
          className="text-6xl font-bold"
          style={{ fontFamily: 'var(--font-fredoka)', color: 'var(--color-flip7-gold)' }}
        >
          FLIP 7
        </h1>
        <p className="text-slate-400 mt-1 text-sm">Join a room</p>
      </div>

      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{
          background: 'var(--color-panel-bg)',
          border: '1px solid var(--color-panel-border)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        <form onSubmit={handleJoin} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-slate-400 uppercase tracking-wider">
              Your Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter display name"
              maxLength={20}
              required
              className="w-full rounded-xl px-4 py-3 text-sm outline-none"
              style={{
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid var(--color-panel-border)',
                color: '#f1f5f9',
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-slate-400 uppercase tracking-wider">
              Room Code
            </label>
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="e.g. XK72MA"
              maxLength={6}
              required
              className="w-full rounded-xl px-4 py-3 text-sm uppercase tracking-widest outline-none"
              style={{
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid var(--color-panel-border)',
                color: '#f1f5f9',
                fontFamily: 'var(--font-fredoka)',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl py-3 font-bold text-base mt-1 transition-all active:scale-95 disabled:opacity-50"
            style={{
              fontFamily: 'var(--font-fredoka)',
              background: 'var(--color-primary)',
              color: '#1a1a1a',
            }}
          >
            {loading ? 'Joining...' : 'Join Room'}
          </button>
        </form>
      </div>
    </div>
  );
}
