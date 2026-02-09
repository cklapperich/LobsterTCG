import type { GameTypeConfig } from '../../core/types/game-type-config';
import type { GameState } from '../../core/types/game';
import type { PlayerIndex } from '../../core/types/card';
import { plugin, executeSetup, pokemonHooksPlugin, flipFieldCardsFaceUp } from './index';
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
  executeSetup: (state: GameState, playerIndex: PlayerIndex) => {
    executeSetup(state, playerIndex);
  },
  onSetupComplete: (state: GameState) => {
    flipFieldCardsFaceUp(state);
  },
};
