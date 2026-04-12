/**
 * Events emitted BY the client TO the server.
 * Used to type socket.emit() calls on the frontend
 * and socket.on() handlers on the backend.
 */
export interface ClientToServerEvents {
  /** Join a room by its code. Server responds with lobby:joined + lobby:state or lobby:error. */
  'lobby:join': (payload: { roomCode: string; displayName: string }) => void;

  /** Leave the current room gracefully. */
  'lobby:leave': () => void;

  /** Host starts the game (only valid when status === 'waiting' and min players present). */
  'lobby:start_game': () => void;

  // ─── Game namespace (/game) ──────────────────────────────────────────────

  /** Active player draws the next card from the deck. */
  'game:hit': (payload: { roomId: string }) => void;

  /** Active player banks their current points and exits the round. */
  'game:stay': (payload: { roomId: string }) => void;

  /**
   * Busting player invokes their Second Chance card.
   * Must be emitted within SECOND_CHANCE_WINDOW_MS of receiving game:bust_warning.
   */
  'game:use_second_chance': (payload: { roomId: string }) => void;

  /**
   * Player selects a target for a Freeze or Flip Three card they just drew.
   * Must be emitted within ACTION_TARGET_TIMEOUT_MS of receiving game:select_target.
   */
  'game:select_action_target': (payload: { roomId: string; targetPlayerId: string }) => void;
}
