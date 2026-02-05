import type { CardTemplate, PlayerIndex } from './card';
import type { Zone, ZoneConfig } from './zone';
import type { Action } from './action';

// Minimal player info (zones are now top-level)
export interface PlayerInfo {
  index: PlayerIndex;
  id: string;
  hasConceded: boolean;
  hasDeclaredVictory: boolean;
}

export interface Turn {
  number: number;
  activePlayer: PlayerIndex;
  actions: Action[];
  ended: boolean;
}

export interface GameConfig {
  gameType: string;
  zones: ZoneConfig[];
  playerCount: 2;
}

export interface GameResult {
  winner: PlayerIndex | null;
  reason: 'concede' | 'victory_declared' | 'deck_out' | 'other';
  details?: string;
}

export interface GameState<T extends CardTemplate = CardTemplate> {
  id: string;
  config: GameConfig;
  turnNumber: number;
  activePlayer: PlayerIndex;
  zones: Record<string, Zone<T>>;  // flattened: "player0_hand", "player1_tableau_1", etc.
  players: [PlayerInfo, PlayerInfo];  // minimal player info
  currentTurn: Turn;
  result: GameResult | null;
  startedAt: number;
  lastActionAt: number;
  log: string[];
}
