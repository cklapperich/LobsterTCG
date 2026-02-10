import type { CardTemplate } from './types/card';
import type { GameState } from './types/game';

/**
 * Unified game log function. Auto-prefixes with [Player N] based on state.activePlayer.
 * Callers should never manually format player labels.
 */
export function gameLog<T extends CardTemplate>(state: GameState<T>, message: string): void {
  state.log.push(`[Player ${state.activePlayer + 1}] ${message}`);
}

/**
 * System log for messages that don't belong to a specific player
 * (turn boundaries, game events, phase transitions).
 */
export function systemLog<T extends CardTemplate>(state: GameState<T>, message: string): void {
  state.log.push(message);
}
