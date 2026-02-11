// Re-export all types
export * from './types';

// Re-export engine functions
export {
  generateInstanceId,
  createCardInstance,
  createGameState,
  loadDeck,
  executeAction,
  getPlayerView,
  findCardInZones,
  getCardName,
  checkOpponentZone,
  zoneVisibility,
} from './engine';

// Re-export GameLoop
export { GameLoop } from './game-loop';

// Re-export plugin system
export { PluginManager } from './plugin';
export type {
  Plugin,
  PreHookResult,
  PostHookResult,
  PreActionHook,
  PostActionHook,
  StateObserver,
  ActionBlocker,
  CustomActionExecutor,
  PrioritizedPreHook,
  PrioritizedPostHook,
  PrioritizedStateObserver,
  PrioritizedBlocker,
  CustomActionRegistration,
} from './plugin';

// Re-export game log
export { gameLog, systemLog } from './game-log';

// Re-export readable state conversion
export { toReadableState, resolveCardName, formatCardInventory } from './readable';
export type { ReadableCard, ReadableZone, ReadableGameState, ReadableAction, ReadableTurn } from './readable';

// Re-export AI tools
export { createDefaultTools } from './ai-tools';
export type { RunnableTool, ToolContext } from './ai-tools';

// Re-export action executor interface
export type { ActionExecutor } from './action-executor';

// Re-export action utilities
export { unpackMoveAction } from './action-utils';
export type { UnpackedMoveAction } from './action-utils';

// Re-export playmat loader
export { loadPlaymat, parsePlaymat } from './playmat-loader';

// Re-export action factory functions
export {
  draw,
  moveCard,
  moveCardStack,
  placeOnZone,
  placeOnTop,
  placeOnBottom,
  shuffle,
  searchZone,
  flipCard,
  setOrientation,
  tap,
  untap,
  addCounter,
  removeCounter,
  setCounter,
  coinFlip,
  diceRoll,
  endTurn,
  concede,
  declareVictory,
  reveal,
  peek,
  createDecision,
  resolveDecision,
  revealHand,
  mulligan,
  swapCardStacks,
  rearrangeZone,
  declareAction,
} from './action';
