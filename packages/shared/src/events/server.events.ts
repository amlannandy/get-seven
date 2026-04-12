import { Card } from '../types/card.types';
import { PublicGameState, GameAction } from '../types/game.types';
import { RoomPlayer } from '../types/room.types';

/**
 * Events emitted BY the server TO clients.
 * Used to type socket.emit() calls on the backend
 * and socket.on() handlers on the frontend.
 */
export interface ServerToClientEvents {
  // ─── Lobby namespace (/lobby) ────────────────────────────────────────────

  /** Full lobby snapshot, sent on join and whenever the player list changes. */
  'lobby:state': (payload: {
    roomId: string;
    roomCode: string;
    maxPlayers: number;
    players: RoomPlayer[];
    canStart: boolean; // host + min players present
  }) => void;

  /** Broadcast when a new player joins the lobby. */
  'lobby:player_joined': (payload: { player: RoomPlayer }) => void;

  /** Broadcast when a player disconnects or leaves the lobby. */
  'lobby:player_left': (payload: {
    playerId: string;
    newHostId: string | null; // set if host transferred
  }) => void;

  /** Sent to the joining player to confirm their identity. */
  'lobby:joined': (payload: { yourPlayerId: string; roomId: string }) => void;

  /** Broadcast when game transitions from waiting → in_progress. */
  'lobby:game_starting': () => void;

  /** Error response (e.g. room not found, name taken, room full). */
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

  /**
   * Sent to every player when the game starts.
   * yourPlayerId lets the client know which hand is theirs.
   */
  'game:started': (payload: { gameState: PublicGameState; yourPlayerId: string }) => void;

  /**
   * Broadcast after every state-changing event.
   * action describes what just happened (for animations / logs).
   */
  'game:state_update': (payload: { gameState: PublicGameState; action: GameAction }) => void;

  /**
   * Sent ONLY to the active player when it is their turn.
   * Client should start a countdown timer.
   */
  'game:your_turn': (payload: {
    timeoutMs: number;
    expiresAt: number; // epoch ms — lets client sync without drift
  }) => void;

  /**
   * Sent ONLY to the busting player when they hold a Second Chance.
   * They have SECOND_CHANCE_WINDOW_MS to emit game:use_second_chance.
   */
  'game:bust_warning': (payload: {
    duplicateCard: Card;
    hasSecondChance: boolean;
    windowMs: number;
  }) => void;

  /** Broadcast at the end of each round with scores. */
  'game:round_end': (payload: {
    roundNumber: number;
    roundScores: Record<string, number>; // playerId → round score
    cumulativeScores: Record<string, number>;
    flip7PlayerId: string | null; // who triggered Flip 7, if anyone
  }) => void;

  /** Broadcast when the game ends. */
  'game:over': (payload: {
    winnerId: string;
    winnerName: string;
    finalScores: Record<string, number>;
  }) => void;

  /** Error response for invalid game actions. */
  'game:error': (payload: {
    code:
      | 'NOT_YOUR_TURN'
      | 'INVALID_ACTION'
      | 'ROOM_NOT_FOUND'
      | 'GAME_NOT_ACTIVE'
      | 'ALREADY_DONE';
    message: string;
  }) => void;

  /**
   * Sent to a reconnecting player to restore their game view.
   * Same shape as game:started.
   */
  'game:reconnected': (payload: { gameState: PublicGameState; yourPlayerId: string }) => void;
}
