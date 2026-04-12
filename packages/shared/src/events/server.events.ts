import type { ActionKind, Card } from '../types/card.types';
import type { GameAction, PublicGameState } from '../types/game.types';
import type { RoomPlayer } from '../types/room.types';

/**
 * Events emitted BY the server TO clients.
 * Used to type socket.emit() calls on the backend
 * and socket.on() handlers on the frontend.
 */
export interface ServerToClientEvents {
  // ─── Lobby namespace (/lobby) ────────────────────────────────────────────

  /** Full lobby snapshot — sent on join and whenever the player list changes. */
  'lobby:state': (payload: {
    roomId: string;
    roomCode: string;
    maxPlayers: number;
    players: RoomPlayer[];
    canStart: boolean;
  }) => void;

  /** Sent to the joining player to confirm their identity. */
  'lobby:joined': (payload: { yourPlayerId: string; roomId: string }) => void;

  /** Broadcast when a new player joins the lobby. */
  'lobby:player_joined': (payload: { player: RoomPlayer }) => void;

  /** Broadcast when a player disconnects or leaves. */
  'lobby:player_left': (payload: {
    playerId: string;
    newHostId: string | null; // set if host was transferred
  }) => void;

  /** Broadcast when game transitions from waiting → in_progress. */
  'lobby:game_starting': () => void;

  /** Error response (room not found, name taken, room full, etc.). */
  'lobby:error': (payload: {
    code:
      | 'ROOM_NOT_FOUND'
      | 'ROOM_FULL'
      | 'GAME_ALREADY_STARTED'
      | 'NAME_TAKEN'
      | 'NOT_HOST'
      | 'NOT_ENOUGH_PLAYERS';
    message: string;
  }) => void;

  // ─── Game namespace (/game) ──────────────────────────────────────────────

  /** Sent to every player when the game starts. */
  'game:started': (payload: { gameState: PublicGameState; yourPlayerId: string }) => void;

  /** Broadcast after every state-changing action (hit, stay, etc.). */
  'game:state_update': (payload: { gameState: PublicGameState; action: GameAction }) => void;

  /** Sent ONLY to the active player when it becomes their turn. */
  'game:your_turn': (payload: {
    timeoutMs: number;
    expiresAt: number; // epoch ms — client uses this to avoid drift
  }) => void;

  /**
   * Sent ONLY to a player who drew a duplicate number card while holding Second Chance.
   * They have SECOND_CHANCE_WINDOW_MS to emit game:use_second_chance.
   */
  'game:bust_warning': (payload: {
    duplicateCard: Card;
    hasSecondChance: boolean;
    windowMs: number;
  }) => void;

  /**
   * Sent ONLY to the player who drew a Freeze or Flip Three card.
   * They must emit game:select_action_target within ACTION_TARGET_TIMEOUT_MS.
   * If they time out, the server auto-selects themselves as the target.
   */
  'game:select_target': (payload: {
    action: ActionKind;
    validTargetIds: string[]; // active playerIds (including self)
    timeoutMs: number;
    expiresAt: number;
  }) => void;

  /** Broadcast at the end of each round with final scores. */
  'game:round_end': (payload: {
    roundNumber: number;
    roundScores: Record<string, number>;
    cumulativeScores: Record<string, number>;
    flip7PlayerId: string | null;
  }) => void;

  /** Broadcast when the game ends (someone reached WINNING_SCORE). */
  'game:over': (payload: {
    winnerId: string;
    winnerName: string;
    finalScores: Record<string, number>;
  }) => void;

  /** Error response for invalid in-game actions. */
  'game:error': (payload: {
    code:
      | 'NOT_YOUR_TURN'
      | 'INVALID_ACTION'
      | 'ROOM_NOT_FOUND'
      | 'GAME_NOT_ACTIVE'
      | 'ALREADY_DONE'
      | 'INVALID_TARGET';
    message: string;
  }) => void;

  /** Sent to a reconnecting player to restore their full game view. */
  'game:reconnected': (payload: { gameState: PublicGameState; yourPlayerId: string }) => void;
}
