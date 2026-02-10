import type { GameTypeConfig } from '../../core/types/game-type-config';
import type { GameState } from '../../core/types/game';
import type { PlayerIndex } from '../../core/types/card';
import { plugin, getTemplate, executeSetup, onSetupComplete } from './index';

export const onePieceConfig: GameTypeConfig = {
  id: 'one-piece',
  name: 'ONE PIECE',
  plugin,
  deckZoneId: 'deck',
  playerCount: 2,
  needsDeckSelection: true,
  needsAIModel: true,
  getTemplate,
  executeSetup: (state: GameState, playerIndex: PlayerIndex) => {
    executeSetup(state, playerIndex);
  },
  onSetupComplete: (state: GameState) => {
    onSetupComplete(state);
  },
};
