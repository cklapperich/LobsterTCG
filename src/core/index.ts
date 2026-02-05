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
  makeZoneKey,
  parseZoneKey,
  findCardInZones,
  getCardName,
  STAGING_ZONE_CONFIG,
} from './engine';

// Re-export GameLoop
export { GameLoop } from './game-loop';
export type { GameEventType } from './game-loop';

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

// Re-export readable state conversion
export { toReadableState, resolveCardName } from './readable';
export type { ReadableCard, ReadableZone, ReadableGameState } from './readable';

// Re-export playmat loader
export { loadPlaymat, parsePlaymat } from './playmat-loader';

// Re-export action factory functions
export {
  draw,
  moveCard,
  playCard,
  attachCard,
  placeOnZone,
  placeOnTop,
  placeOnBottom,
  shuffle,
  shuffleDeck,
  searchZone,
  searchDeck,
  flipCard,
  setOrientation,
  tap,
  untap,
  addStatus,
  removeStatus,
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
  peekTopOfDeck,
  moveToHand,
  moveToDiscard,
  moveToDeck,
} from './action';
