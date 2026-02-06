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

// ============================================================================
// Action Factory Functions
// ============================================================================

export function draw(player: PlayerIndex, count: number = 1): DrawAction {
  return { type: 'draw', player, count };
}

export function moveCard(
  player: PlayerIndex,
  cardInstanceId: string,
  fromZone: string,
  toZone: string,
  position?: number
): MoveCardAction {
  return { type: 'move_card', player, cardInstanceId, fromZone, toZone, position };
}

export function moveCardStack(
  player: PlayerIndex,
  cardInstanceIds: string[],
  fromZone: string,
  toZone: string,
  position?: number
): MoveCardStackAction {
  return { type: 'move_card_stack', player, cardInstanceIds, fromZone, toZone, position };
}

export function placeOnZone(
  player: PlayerIndex,
  cardInstanceIds: string[],
  zoneKey: string,
  position: 'top' | 'bottom'
): PlaceOnZoneAction {
  return { type: 'place_on_zone', player, cardInstanceIds, zoneId: zoneKey, position };
}

export function placeOnTop(
  player: PlayerIndex,
  cardInstanceIds: string[],
  zoneKey: string
): PlaceOnZoneAction {
  return placeOnZone(player, cardInstanceIds, zoneKey, 'top');
}

export function placeOnBottom(
  player: PlayerIndex,
  cardInstanceIds: string[],
  zoneKey: string
): PlaceOnZoneAction {
  return placeOnZone(player, cardInstanceIds, zoneKey, 'bottom');
}

export function shuffle(player: PlayerIndex, zoneKey: string): ShuffleAction {
  return { type: 'shuffle', player, zoneId: zoneKey };
}

export function searchZone(
  player: PlayerIndex,
  zoneKey: string,
  options?: { filter?: string; count?: number; fromPosition?: 'top' | 'bottom' }
): SearchZoneAction {
  return {
    type: 'search_zone',
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
  return { type: 'flip_card', player, cardInstanceId, newVisibility };
}

export function setOrientation(
  player: PlayerIndex,
  cardInstanceId: string,
  orientation: string
): SetOrientationAction {
  return { type: 'set_orientation', player, cardInstanceId, orientation };
}

export function tap(player: PlayerIndex, cardInstanceId: string): SetOrientationAction {
  return setOrientation(player, cardInstanceId, 'tapped');
}

export function untap(player: PlayerIndex, cardInstanceId: string): SetOrientationAction {
  return setOrientation(player, cardInstanceId, 'normal');
}

export function addCounter(
  player: PlayerIndex,
  cardInstanceId: string,
  counterType: string,
  amount: number = 1
): AddCounterAction {
  return { type: 'add_counter', player, cardInstanceId, counterType, amount };
}

export function removeCounter(
  player: PlayerIndex,
  cardInstanceId: string,
  counterType: string,
  amount: number = 1
): RemoveCounterAction {
  return { type: 'remove_counter', player, cardInstanceId, counterType, amount };
}

export function setCounter(
  player: PlayerIndex,
  cardInstanceId: string,
  counterType: string,
  value: number
): SetCounterAction {
  return { type: 'set_counter', player, cardInstanceId, counterType, value };
}

export function coinFlip(
  player: PlayerIndex,
  count: number = 1,
  results?: boolean[]
): CoinFlipAction {
  return { type: 'coin_flip', player, count, results };
}

export function diceRoll(
  player: PlayerIndex,
  sides: number = 6,
  count: number = 1,
  results?: number[]
): DiceRollAction {
  return { type: 'dice_roll', player, count, sides, results };
}

export function endTurn(player: PlayerIndex): EndTurnAction {
  return { type: 'end_turn', player };
}

export function concede(player: PlayerIndex): ConcedeAction {
  return { type: 'concede', player };
}

export function declareVictory(
  player: PlayerIndex,
  reason?: string
): DeclareVictoryAction {
  return { type: 'declare_victory', player, reason };
}

export function reveal(
  player: PlayerIndex,
  cardInstanceIds: string[],
  to: 'opponent' | 'both'
): RevealAction {
  return { type: 'reveal', player, cardInstanceIds, to };
}

export function peek(
  player: PlayerIndex,
  zoneKey: string,
  count: number,
  fromPosition: 'top' | 'bottom' = 'top'
): PeekAction {
  return { type: 'peek', player, zoneId: zoneKey, count, fromPosition };
}

export function createDecision(
  player: PlayerIndex,
  targetPlayer: PlayerIndex,
  message?: string
): CreateDecisionAction {
  return { type: 'create_decision', player, targetPlayer, message };
}

export function resolveDecision(player: PlayerIndex): ResolveDecisionAction {
  return { type: 'resolve_decision', player };
}

export function revealHand(player: PlayerIndex, zoneKey: string): RevealHandAction {
  return { type: 'reveal_hand', player, zoneKey };
}
