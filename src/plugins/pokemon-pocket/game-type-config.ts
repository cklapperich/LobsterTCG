import type { GameTypeConfig } from '../../core/types/game-type-config';
import { plugin, executeSetup, onSetupComplete, pocketHooksPlugin } from './index';
import { getTemplate } from './cards';
import { parsePocketDeck, exportPocketDeck } from './pocket-shared/deckParser';

export const pocketConfig: GameTypeConfig = {
  id: 'pokemon-pocket',
  name: 'Pokemon Pocket',
  plugin,
  hooksPlugin: pocketHooksPlugin as any,
  getTemplate,
  deckZoneId: 'deck',
  playerCount: 2,
  needsDeckSelection: true,
  needsAIModel: true,
  executeSetup,
  onSetupComplete,
  tcgFilter: 'Pokemon Pocket',
  parseDeckText: (text, name) => parsePocketDeck(text, name),
  exportDeckText: (cards) => exportPocketDeck(cards),
};
