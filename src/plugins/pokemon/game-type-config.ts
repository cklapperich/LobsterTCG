import type { GameTypeConfig } from '../../core/types/game-type-config';
import { plugin, executeSetup, onSetupComplete, pokemonHooksPlugin, parsePTCGODeck } from './index';
import { getTemplate } from './cards';
import { exportToPTCGO } from './deckbuilder';

export const pokemonConfig: GameTypeConfig = {
  id: 'pokemon-tcg',
  name: 'Pokemon TCG',
  plugin,
  hooksPlugin: pokemonHooksPlugin as any,
  getTemplate,
  deckZoneId: 'deck',
  playerCount: 2,
  needsDeckSelection: true,
  needsAIModel: true,
  executeSetup: executeSetup,
  onSetupComplete:onSetupComplete,
  tcgFilter: 'Pokemon',
  deckbuilderLink: 'https://my.limitlesstcg.com/builder',
  parseDeckText: (text, name) => parsePTCGODeck(text, name),
  exportDeckText: (cards) => exportToPTCGO(cards.map(c => ({ cardId: c.templateId, count: c.count }))),
};
