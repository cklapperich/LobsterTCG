import type { GameTypeConfig } from '../../core/types/game-type-config';
import { plugin, getTemplate, executeSetup, onSetupComplete } from './index';

export const fleshAndBloodConfig: GameTypeConfig = {
  id: 'flesh-and-blood',
  name: 'FLESH AND BLOOD',
  plugin,
  deckZoneId: 'deck',
  playerCount: 2,
  needsDeckSelection: true,
  needsAIModel: true,
  getTemplate,
  executeSetup: executeSetup,
  onSetupComplete: onSetupComplete
};
