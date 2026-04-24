import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Copy, LogOut, Play } from "lucide-react";
import toast from "react-hot-toast";
import { usePlayerStore } from "../store/usePlayerStore";
import { useRoomStore } from "../store/useRoomStore";
import { getLobbySocket, disconnectLobbySocket } from "../lib/socket";
import { useLobbyEvents } from "../hooks/useLobbyEvents";
import PlayerTile from "../components/lobby/PlayerTile";

export default function LobbyPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const { playerId, displayName, roomCode: storedRoomCode } = usePlayerStore();
  const {
    roomCode: socketRoomCode,
    players,
    hostPlayerId,
    clearRoom,
  } = useRoomStore();
  const canStart = players.filter((p) => p.isConnected).length >= 2;
  const roomCode = socketRoomCode ?? storedRoomCode;

  // Keep a ref so the connect callback always reads the latest roomCode
  // without adding it to the effect deps (which would trigger cleanup/re-run)
  const roomCodeRef = useRef(roomCode);
  useEffect(() => {
    roomCodeRef.current = roomCode;
  }, [roomCode]);

  useLobbyEvents(roomId!);

  useEffect(() => {
    if (!playerId || !displayName) return;

    const socket = getLobbySocket();

    const doJoin = () => {
      socket.emit("lobby:join", {
        roomCode: roomCodeRef.current ?? "",
        displayName,
      });
    };

    if (socket.connected) {
      // Joiner arriving from JoinPage — socket already open, re-emit join so
      // the server re-sends lobby:state and we get a fresh player list.
      doJoin();
    } else {
      socket.once("connect", doJoin);
      socket.connect();
    }

    return () => {
      disconnectLobbySocket();
      clearRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, displayName]); // intentionally excludes roomCode & clearRoom

  const isHost = playerId === hostPlayerId;
  const shareUrl = `${window.location.origin}/join/${roomCode}`;

  function handleCopyLink() {
    navigator.clipboard.writeText(shareUrl);
    toast.success("Link copied!");
  }

  function handleStartGame() {
    const socket = getLobbySocket();
    socket.emit("lobby:start_game");
  }

  function handleLeave() {
    const socket = getLobbySocket();
    socket.emit("lobby:leave");
    disconnectLobbySocket();
    clearRoom();
    navigate("/");
  }

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center gap-6 px-4 py-8"
      style={{ background: "var(--color-table-bg)" }}
    >
      {/* Header */}
      <div className="w-full max-w-md flex items-center justify-between">
        <div>
          <h1
            className="text-3xl font-bold"
            style={{
              fontFamily: "var(--font-fredoka)",
              color: "var(--color-flip7-gold)",
            }}
          >
            FLIP 7
          </h1>
          <p className="text-slate-400 text-sm">Waiting for players...</p>
        </div>
        <button
          onClick={handleLeave}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-400 transition-colors"
        >
          <LogOut size={14} />
          Leave
        </button>
      </div>

      {/* Room panel */}
      <div
        className="w-full max-w-md rounded-2xl p-5 flex flex-col gap-5"
        style={{
          background: "var(--color-panel-bg)",
          border: "1px solid var(--color-panel-border)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        {/* Room code + share */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">
              Room Code
            </p>
            <p
              className="text-2xl font-bold tracking-widest"
              style={{ fontFamily: "var(--font-fredoka)", color: "#f1f5f9" }}
            >
              {roomCode}
            </p>
          </div>
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all active:scale-95"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid var(--color-panel-border)",
              color: "#f1f5f9",
            }}
          >
            <Copy size={14} />
            Copy Link
          </button>
        </div>

        <div
          style={{ height: "1px", background: "var(--color-panel-border)" }}
        />

        {/* Player count */}
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span style={{ fontFamily: "var(--font-fredoka)" }}>Players</span>
          <span>{players.length} joined</span>
        </div>

        {/* Player list */}
        <div className="flex flex-col gap-2">
          <AnimatePresence>
            {players.map((p) => (
              <PlayerTile
                key={p.id}
                player={p}
                isHost={p.id === hostPlayerId}
                isYou={p.id === playerId}
              />
            ))}
          </AnimatePresence>
        </div>

        <div
          style={{ height: "1px", background: "var(--color-panel-border)" }}
        />

        {/* Start / waiting */}
        {isHost ? (
          <button
            onClick={handleStartGame}
            disabled={!canStart}
            className="w-full rounded-xl py-3 font-bold text-base flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40"
            style={{
              fontFamily: "var(--font-fredoka)",
              background: canStart
                ? "var(--color-primary)"
                : "rgba(255,255,255,0.08)",
              color: canStart ? "#1a1a1a" : "#6b7280",
            }}
          >
            <Play size={16} />
            Start Game
          </button>
        ) : (
          <p className="text-center text-sm text-slate-400">
            Waiting for host to start the game...
          </p>
        )}
      </div>
    </div>
  );
}
