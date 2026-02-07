import type { Playmat } from './playmat';
import type { GameState } from './game';
import type { CardTemplate, PlayerIndex } from './card';
import type { CounterDefinition } from './counter';
import type { RunnableTool, ToolContext } from '../ai-tools';
import type { ActionPanel } from './action-panel';
import type { Action } from './action';

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

  /** Format a card template for search results (AI consumption). Falls back to JSON if not provided. */
  formatCardForSearch?(template: T): string;

  /** Return Anthropic SDK-compatible tools for AI agents. */
  listTools?(ctx: ToolContext): RunnableTool[];

  /** Return action panels for the sidebar UI. */
  getActionPanels?(state: GameState<T>, player: PlayerIndex): ActionPanel[];

  /** Handle a button click from an action panel. Returns an Action to dispatch through the hook system, or void for direct mutation. */
  onActionPanelClick?(state: GameState<T>, player: PlayerIndex, panelId: string, buttonId: string): Action | void;
}
