import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { usePlayerStore } from "../store/usePlayerStore";

type Tab = "create" | "join";

export default function HomePage() {
  const navigate = useNavigate();
  const setIdentity = usePlayerStore((s) => s.setIdentity);

  const [tab, setTab] = useState<Tab>("create");
  const [displayName, setDisplayName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) return;

    setLoading(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Failed to create room");
      }

      const data = (await res.json()) as {
        roomId: string;
        roomCode: string;
        playerId: string;
      };

      setIdentity(data.playerId, data.roomId, data.roomCode, name);
      navigate(`/lobby/${data.roomId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const name = displayName.trim();
    const code = joinCode.trim().toUpperCase();
    if (!name || !code) return;
    navigate(`/join/${code}?name=${encodeURIComponent(name)}`);
  }

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center gap-8 px-4"
      style={{ background: "var(--color-table-bg)" }}
    >
      {/* Logo */}
      <div className="text-center">
        <h1
          className="text-6xl font-bold tracking-tight"
          style={{
            fontFamily: "var(--font-fredoka)",
            color: "var(--color-flip7-gold)",
          }}
        >
          FLIP 7
        </h1>
        <p className="text-slate-400 mt-1 text-sm">
          Real-time multiplayer card game
        </p>
      </div>

      {/* Card panel */}
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{
          background: "var(--color-panel-bg)",
          border: "1px solid var(--color-panel-border)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        {/* Tabs */}
        <div
          className="flex rounded-xl overflow-hidden mb-6"
          style={{ background: "rgba(0,0,0,0.2)" }}
        >
          {(["create", "join"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2 text-sm font-medium capitalize transition-colors"
              style={{
                fontFamily: "var(--font-fredoka)",
                background: tab === t ? "var(--color-primary)" : "transparent",
                color: tab === t ? "#1a1a1a" : "#94a3b8",
                borderRadius: tab === t ? "0.75rem" : undefined,
              }}
            >
              {t === "create" ? "Create Room" : "Join Room"}
            </button>
          ))}
        </div>

        <form
          onSubmit={tab === "create" ? handleCreate : handleJoin}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="displayName"
              className="text-xs text-slate-400 uppercase tracking-wider"
            >
              Your Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter display name"
              maxLength={20}
              required
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all"
              style={{
                background: "rgba(0,0,0,0.25)",
                border: "1px solid var(--color-panel-border)",
                color: "#f1f5f9",
              }}
            />
          </div>

          {tab === "join" && (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="joinCode"
                className="text-xs text-slate-400 uppercase tracking-wider"
              >
                Room Code
              </label>
              <input
                type="text"
                id="joinCode"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. XK72MA"
                maxLength={6}
                required
                className="w-full rounded-xl px-4 py-3 text-sm uppercase tracking-widest outline-none transition-all"
                style={{
                  background: "rgba(0,0,0,0.25)",
                  border: "1px solid var(--color-panel-border)",
                  color: "#f1f5f9",
                  fontFamily: "var(--font-fredoka)",
                }}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl py-3 font-bold text-base mt-1 transition-all active:scale-95 disabled:opacity-50"
            style={{
              fontFamily: "var(--font-fredoka)",
              background: "var(--color-primary)",
              color: "#1a1a1a",
            }}
          >
            {loading
              ? "Creating..."
              : tab === "create"
                ? "Create Room"
                : "Join Room"}
          </button>
        </form>
      </div>
    </div>
  );
}
