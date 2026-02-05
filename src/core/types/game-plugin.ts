import type { Playmat } from './playmat';
import type { GameState } from './game';
import type { CardTemplate, PlayerIndex } from './card';
import type { CounterDefinition } from './counter';
import type { ReadableGameState } from '../readable';
import type { Tool } from './tool';
import type { GameLoop } from '../game-loop';

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

  /** Get counter definitions for this game (optional) */
  getCounterDefinitions?(): CounterDefinition[];

  /** Get coin front image URL (optional) */
  getCoinFront?(): string;

  /** Get coin back image URL (optional) */
  getCoinBack?(): string;

  /** Modify readable state before it's returned (e.g., annotate attachments, evolution info) */
  modifyReadableState?(readableState: ReadableGameState, state: Readonly<GameState<T>>, playerIndex: PlayerIndex): ReadableGameState;

  /** Return Anthropic SDK-compatible tools for AI agents. */
  listTools?(gameLoop: GameLoop<T>, playerIndex: PlayerIndex): Tool[];
}
