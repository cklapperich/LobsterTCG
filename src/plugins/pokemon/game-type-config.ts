import type { GameTypeConfig } from '../../core/types/game-type-config';
import type { GameState } from '../../core/types/game';
import type { PlayerIndex } from '../../core/types/card';
import type { ActionExecutor } from '../../core/action-executor';
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
  onSetupComplete: async (state: GameState, executor: ActionExecutor) => {
    flipFieldCardsFaceUp(state);

    // Coin flip to determine who goes first (return winner, don't mutate —
    // addLog causes gameState reassignment which makes `state` ref stale)
    const isHeads = await executor.flipCoin();
    const firstPlayer: PlayerIndex = isHeads ? 0 : 1;
    executor.addLog(`Coin flip: ${isHeads ? 'HEADS' : 'TAILS'} — Player ${firstPlayer + 1} goes first!`);
    return firstPlayer;
  },
};
