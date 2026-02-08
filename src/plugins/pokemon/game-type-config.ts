import type { GameTypeConfig } from '../../core/types/game-type-config';
import type { GameState } from '../../core/types/game';
import type { PlayerIndex } from '../../core/types/card';
import { plugin, executeSetup, pokemonHooksPlugin, flipFieldCardsFaceUp, ensureCardInHand } from './index';
import { getTemplate } from './cards';
import {
  PROMPT_SETUP,
  PROMPT_FULL_TURN,
  PROMPT_START_OF_TURN,
  PROMPT_PLANNER,
  PROMPT_EXECUTOR,
  PROMPT_AUTONOMOUS,
} from './prompt-builder';

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
  injectTestCards: (state: GameState, testId: string, playerIndex: PlayerIndex) => {
    if (testId === 'lassTest') {
      ensureCardInHand(state, playerIndex, 'base1-75');
    } else if (testId === 'fastBallTest') {
      ensureCardInHand(state, playerIndex, 'ecard3-124');
    }
  },
  testOptions: [
    { id: 'lassTest', label: 'LASS TEST' },
    { id: 'fastBallTest', label: 'FAST BALL TEST' },
  ],
  prompts: {
    setup: PROMPT_SETUP,
    fullTurn: PROMPT_FULL_TURN,
    startOfTurn: PROMPT_START_OF_TURN,
    planner: PROMPT_PLANNER,
    executor: PROMPT_EXECUTOR,
    autonomous: PROMPT_AUTONOMOUS,
  },
};
