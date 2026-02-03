import type {
  PlayerIndex,
  Visibility,
  DrawAction,
  MoveCardAction,
  PlayCardAction,
  AttachCardAction,
  PlaceOnZoneAction,
  ShuffleAction,
  SearchZoneAction,
  FlipCardAction,
  SetOrientationAction,
  AddStatusAction,
  RemoveStatusAction,
  AddCounterAction,
  RemoveCounterAction,
  SetCounterAction,
  CoinFlipAction,
  DiceRollAction,
  EndTurnAction,
  ConcedeAction,
  DeclareVictoryAction,
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

export function playCard(
  player: PlayerIndex,
  cardInstanceId: string,
  toZone: string,
  targetInstanceId?: string
): PlayCardAction {
  return { type: 'play_card', player, cardInstanceId, toZone, targetInstanceId };
}

export function attachCard(
  player: PlayerIndex,
  cardInstanceId: string,
  targetInstanceId: string
): AttachCardAction {
  return { type: 'attach_card', player, cardInstanceId, targetInstanceId };
}

export function placeOnZone(
  player: PlayerIndex,
  cardInstanceIds: string[],
  zoneId: string,
  position: 'top' | 'bottom'
): PlaceOnZoneAction {
  return { type: 'place_on_zone', player, cardInstanceIds, zoneId, position };
}

export function placeOnTop(
  player: PlayerIndex,
  cardInstanceIds: string[],
  zoneId: string
): PlaceOnZoneAction {
  return placeOnZone(player, cardInstanceIds, zoneId, 'top');
}

export function placeOnBottom(
  player: PlayerIndex,
  cardInstanceIds: string[],
  zoneId: string
): PlaceOnZoneAction {
  return placeOnZone(player, cardInstanceIds, zoneId, 'bottom');
}

export function shuffle(player: PlayerIndex, zoneId: string): ShuffleAction {
  return { type: 'shuffle', player, zoneId };
}

export function shuffleDeck(player: PlayerIndex): ShuffleAction {
  return shuffle(player, 'deck');
}

export function searchZone(
  player: PlayerIndex,
  zoneId: string,
  options?: { filter?: string; count?: number; fromPosition?: 'top' | 'bottom' }
): SearchZoneAction {
  return {
    type: 'search_zone',
    player,
    zoneId,
    filter: options?.filter,
    count: options?.count,
    fromPosition: options?.fromPosition,
  };
}

export function searchDeck(
  player: PlayerIndex,
  filter?: string
): SearchZoneAction {
  return searchZone(player, 'deck', { filter });
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

export function addStatus(
  player: PlayerIndex,
  cardInstanceId: string,
  status: string
): AddStatusAction {
  return { type: 'add_status', player, cardInstanceId, status };
}

export function removeStatus(
  player: PlayerIndex,
  cardInstanceId: string,
  status: string
): RemoveStatusAction {
  return { type: 'remove_status', player, cardInstanceId, status };
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
  zoneId: string,
  count: number,
  fromPosition: 'top' | 'bottom' = 'top'
): PeekAction {
  return { type: 'peek', player, zoneId, count, fromPosition };
}

export function peekTopOfDeck(player: PlayerIndex, count: number = 1): PeekAction {
  return peek(player, 'deck', count, 'top');
}

// ============================================================================
// Convenience: Move to specific zones
// ============================================================================

export function moveToHand(
  player: PlayerIndex,
  cardInstanceId: string,
  fromZone: string
): MoveCardAction {
  return moveCard(player, cardInstanceId, fromZone, 'hand');
}

export function moveToDiscard(
  player: PlayerIndex,
  cardInstanceId: string,
  fromZone: string
): MoveCardAction {
  return moveCard(player, cardInstanceId, fromZone, 'discard');
}

export function moveToDeck(
  player: PlayerIndex,
  cardInstanceId: string,
  fromZone: string,
  position?: number
): MoveCardAction {
  return moveCard(player, cardInstanceId, fromZone, 'deck', position);
}
