import type { GamePlugin } from './game-plugin';
import type { Plugin } from '../plugin/types';
import type { CardTemplate, PlayerIndex } from './card';
import type { GameState } from './game';
import type { DeckList, DeckEntry } from './deck';
import type { ActionExecutor } from '../action-executor';

/** Result of parsing a deck text import. */
export interface DeckParseResult {
  deckList: DeckList;
  warnings: string[];
}

/** A metadata field that the deck editor should render for this game type. */
export interface DeckMetadataField {
  key: string;
  label: string;
  type: 'multi-select';
  options: { value: string; label: string }[];
  required?: boolean;
}

export interface GameTypeConfig {
  id: string;
  name: string;
  plugin: GamePlugin;
  hooksPlugin?: Plugin;
  getTemplate?: (id: string) => CardTemplate | undefined;
  renderFace?: (t: CardTemplate) => { rank?: string; suit?: string; color?: string };
  executeSetup: (state: GameState, playerIndex: PlayerIndex) => void;
  /** Plugin-specific deck loading (e.g. derives energy pool from metadata). Falls back to core loadDeck if omitted. */
  loadDeck?: (state: GameState, playerIndex: PlayerIndex, deckList: DeckList) => void;
  deckZoneId: string;              // 'deck' for Pokemon, 'stock' for solitaire
  getDeck?: () => DeckList;        // Fixed-deck games (solitaire)
  playerCount: 1 | 2;
  needsDeckSelection: boolean;
  needsAIModel: boolean;
  testOptions?: { id: string; label: string }[];
  /** Called after setup phase transitions to playing. E.g. Pokemon flips field cards face-up.
   *  May return a PlayerIndex to override who goes first (e.g. from a coin flip). */
  onSetupComplete?: (state: GameState, executor: ActionExecutor) => PlayerIndex | void | Promise<PlayerIndex | void>;
  /** Called to inject test cards into the game state during init. */
  injectTestCards?: (state: GameState, testId: string, playerIndex: PlayerIndex) => void;
  /** Filter key for loading user decks from Supabase (e.g. 'Pokemon'). */
  tcgFilter?: string;
  /** URL to an external deckbuilder tool (e.g. limitlesstcg.com/builder). */
  deckbuilderLink?: string;
  /** Parse a deck text export (e.g. PTCGO format) into a DeckList. */
  parseDeckText?: (text: string, name: string) => DeckParseResult;
  /** Export a DeckList's cards back to text format. */
  exportDeckText?: (cards: DeckEntry[]) => string;
  /** Metadata fields the deck editor should render for this game type. */
  deckMetadataFields?: DeckMetadataField[];
}
