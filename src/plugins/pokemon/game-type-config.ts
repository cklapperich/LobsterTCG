import type { GameTypeConfig } from '../../core/types/game-type-config';
import { plugin, executeSetup, onSetupComplete, pokemonHooksPlugin } from './index';
import { getTemplate } from './cards';

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
};
