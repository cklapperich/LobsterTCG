import type { GamePlugin } from './game-plugin';
import type { Plugin } from '../plugin/types';
import type { CardTemplate, PlayerIndex } from './card';
import type { GameState } from './game';
import type { DeckList } from './deck';
import type { ActionExecutor } from '../action-executor';

export interface GameTypeConfig {
  id: string;
  name: string;
  plugin: GamePlugin;
  hooksPlugin?: Plugin;
  getTemplate?: (id: string) => CardTemplate | undefined;
  renderFace?: (t: CardTemplate) => { rank?: string; suit?: string; color?: string };
  executeSetup: (state: GameState, playerIndex: PlayerIndex) => void;
  deckZoneId: string;              // 'deck' for Pokemon, 'stock' for solitaire
  getDeck?: () => DeckList;        // Fixed-deck games (solitaire)
  prompts?: { setup?: string; decisionTurn?: string; startOfTurn?: string; planner?: string; executor?: string; autonomous?: string };
  playerCount: 1 | 2;
  needsDeckSelection: boolean;
  needsAIModel: boolean;
  testOptions?: { id: string; label: string }[];
  /** Called after setup phase transitions to playing. E.g. Pokemon flips field cards face-up. */
  onSetupComplete?: (state: GameState, executor: ActionExecutor) => void | Promise<void>;
  /** Called to inject test cards into the game state during init. */
  injectTestCards?: (state: GameState, testId: string, playerIndex: PlayerIndex) => void;
}
