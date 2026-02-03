import type { CardTemplate, PlayerIndex } from './card';
import type { Zone, ZoneConfig } from './zone';
import type { Action } from './action';

export interface PlayerState<T extends CardTemplate = CardTemplate> {
  index: PlayerIndex;
  id: string;
  zones: Record<string, Zone<T>>;
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
  players: [PlayerState<T>, PlayerState<T>];
  currentTurn: Turn;
  result: GameResult | null;
  startedAt: number;
  lastActionAt: number;
}
