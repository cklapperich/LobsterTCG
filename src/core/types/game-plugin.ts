import type { Playmat } from './playmat';
import type { GameState } from './game';
import type { CardTemplate } from './card';

/**
 * Interface for game plugins (Pokemon, Solitaire, etc.)
 *
 * Card faces use the imageUrl property on CardTemplate.
 */
export interface GamePlugin<T extends CardTemplate = CardTemplate> {
  /** Load the playmat configuration */
  getPlaymat(): Promise<Playmat>;

  /** Start a new game and return initial state */
  startGame(): Promise<GameState<T>>;

  /** Get card info string for modals/tooltips */
  getCardInfo(template: T): string;

  /** Get card back image URL (optional) */
  getCardBack?(): string;
}
