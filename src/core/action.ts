import type {
  PlayerIndex,
  Visibility,
  DrawAction,
  MoveCardAction,
  MoveCardStackAction,
  PlaceOnZoneAction,
  ShuffleAction,
  SearchZoneAction,
  FlipCardAction,
  SetOrientationAction,
  AddCounterAction,
  RemoveCounterAction,
  SetCounterAction,
  CoinFlipAction,
  DiceRollAction,
  EndTurnAction,
  ConcedeAction,
  DeclareVictoryAction,
  CreateDecisionAction,
  ResolveDecisionAction,
  RevealHandAction,
  RevealAction,
  PeekAction,
} from './types';
import {
  ACTION_TYPES,
  POSITIONS,
  REVEAL_TARGETS,
  ORIENTATION_NAMES,
} from './types';
import type { Position } from './types';

// ============================================================================
// Action Factory Functions
// ============================================================================

export function draw(player: PlayerIndex, count: number = 1): DrawAction {
  return { type: ACTION_TYPES.DRAW, player, count };
}

export function moveCard(
  player: PlayerIndex,
  cardInstanceId: string,
  fromZone: string,
  toZone: string,
  position?: number
): MoveCardAction {
  return { type: ACTION_TYPES.MOVE_CARD, player, cardInstanceId, fromZone, toZone, position };
}

export function moveCardStack(
  player: PlayerIndex,
  cardInstanceIds: string[],
  fromZone: string,
  toZone: string,
  position?: number
): MoveCardStackAction {
  return { type: ACTION_TYPES.MOVE_CARD_STACK, player, cardInstanceIds, fromZone, toZone, position };
}

export function placeOnZone(
  player: PlayerIndex,
  cardInstanceIds: string[],
  zoneKey: string,
  position: Position
): PlaceOnZoneAction {
  return { type: ACTION_TYPES.PLACE_ON_ZONE, player, cardInstanceIds, zoneId: zoneKey, position };
}

export function placeOnTop(
  player: PlayerIndex,
  cardInstanceIds: string[],
  zoneKey: string
): PlaceOnZoneAction {
  return placeOnZone(player, cardInstanceIds, zoneKey, POSITIONS.TOP);
}

export function placeOnBottom(
  player: PlayerIndex,
  cardInstanceIds: string[],
  zoneKey: string
): PlaceOnZoneAction {
  return placeOnZone(player, cardInstanceIds, zoneKey, POSITIONS.BOTTOM);
}

export function shuffle(player: PlayerIndex, zoneKey: string): ShuffleAction {
  return { type: ACTION_TYPES.SHUFFLE, player, zoneId: zoneKey };
}

export function searchZone(
  player: PlayerIndex,
  zoneKey: string,
  options?: { filter?: string; count?: number; fromPosition?: Position }
): SearchZoneAction {
  return {
    type: ACTION_TYPES.SEARCH_ZONE,
    player,
    zoneId: zoneKey,
    filter: options?.filter,
    count: options?.count,
    fromPosition: options?.fromPosition,
  };
}

export function flipCard(
  player: PlayerIndex,
  cardInstanceId: string,
  newVisibility: Visibility
): FlipCardAction {
  return { type: ACTION_TYPES.FLIP_CARD, player, cardInstanceId, newVisibility };
}

export function setOrientation(
  player: PlayerIndex,
  cardInstanceId: string,
  orientation: string
): SetOrientationAction {
  return { type: ACTION_TYPES.SET_ORIENTATION, player, cardInstanceId, orientation };
}

export function tap(player: PlayerIndex, cardInstanceId: string): SetOrientationAction {
  return setOrientation(player, cardInstanceId, ORIENTATION_NAMES.TAPPED);
}

export function untap(player: PlayerIndex, cardInstanceId: string): SetOrientationAction {
  return setOrientation(player, cardInstanceId, ORIENTATION_NAMES.NORMAL);
}

export function addCounter(
  player: PlayerIndex,
  cardInstanceId: string,
  counterType: string,
  amount: number = 1
): AddCounterAction {
  return { type: ACTION_TYPES.ADD_COUNTER, player, cardInstanceId, counterType, amount };
}

export function removeCounter(
  player: PlayerIndex,
  cardInstanceId: string,
  counterType: string,
  amount: number = 1
): RemoveCounterAction {
  return { type: ACTION_TYPES.REMOVE_COUNTER, player, cardInstanceId, counterType, amount };
}

export function setCounter(
  player: PlayerIndex,
  cardInstanceId: string,
  counterType: string,
  value: number
): SetCounterAction {
  return { type: ACTION_TYPES.SET_COUNTER, player, cardInstanceId, counterType, value };
}

export function coinFlip(
  player: PlayerIndex,
  count: number = 1,
  results?: boolean[]
): CoinFlipAction {
  return { type: ACTION_TYPES.COIN_FLIP, player, count, results };
}

export function diceRoll(
  player: PlayerIndex,
  sides: number = 6,
  count: number = 1,
  results?: number[]
): DiceRollAction {
  return { type: ACTION_TYPES.DICE_ROLL, player, count, sides, results };
}

export function endTurn(player: PlayerIndex): EndTurnAction {
  return { type: ACTION_TYPES.END_TURN, player };
}

export function concede(player: PlayerIndex): ConcedeAction {
  return { type: ACTION_TYPES.CONCEDE, player };
}

export function declareVictory(
  player: PlayerIndex,
  reason?: string
): DeclareVictoryAction {
  return { type: ACTION_TYPES.DECLARE_VICTORY, player, reason };
}

export function reveal(
  player: PlayerIndex,
  cardInstanceIds: string[],
  to: typeof REVEAL_TARGETS.OPPONENT | typeof REVEAL_TARGETS.BOTH
): RevealAction {
  return { type: ACTION_TYPES.REVEAL, player, cardInstanceIds, to };
}

export function peek(
  player: PlayerIndex,
  zoneKey: string,
  count: number,
  fromPosition: Position = POSITIONS.TOP
): PeekAction {
  return { type: ACTION_TYPES.PEEK, player, zoneId: zoneKey, count, fromPosition };
}

export function createDecision(
  player: PlayerIndex,
  targetPlayer: PlayerIndex,
  message?: string
): CreateDecisionAction {
  return { type: ACTION_TYPES.CREATE_DECISION, player, targetPlayer, message };
}

export function resolveDecision(player: PlayerIndex): ResolveDecisionAction {
  return { type: ACTION_TYPES.RESOLVE_DECISION, player };
}

export function revealHand(player: PlayerIndex, zoneKey: string): RevealHandAction {
  return { type: ACTION_TYPES.REVEAL_HAND, player, zoneKey };
}
