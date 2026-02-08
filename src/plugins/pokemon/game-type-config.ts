import type { GameTypeConfig, SetupCompleteUtils } from '../../core/types/game-type-config';
import type { GameState } from '../../core/types/game';
import type { PlayerIndex } from '../../core/types/card';
import { plugin, executeSetup, pokemonHooksPlugin, flipFieldCardsFaceUp } from './index';
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
  onSetupComplete: async (state: GameState, { flipCoin, log }: SetupCompleteUtils) => {
    flipFieldCardsFaceUp(state);

    log('Flipping coin to determine who goes first...');
    const isHeads = await flipCoin();
    const firstPlayer = isHeads ? 0 : 1;
    log(`Coin flip: ${isHeads ? 'HEADS' : 'TAILS'} — Player ${firstPlayer + 1} goes first!`);

    state.activePlayer = firstPlayer as PlayerIndex;
    state.currentTurn = { number: 1, activePlayer: firstPlayer as PlayerIndex, actions: [], ended: false };
  },

  prompts: {
    setup: PROMPT_SETUP,
    fullTurn: PROMPT_FULL_TURN,
    startOfTurn: PROMPT_START_OF_TURN,
    planner: PROMPT_PLANNER,
    executor: PROMPT_EXECUTOR,
    autonomous: PROMPT_AUTONOMOUS,
  },
};
