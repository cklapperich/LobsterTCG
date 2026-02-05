import type { PlayerIndex, Visibility } from './card';

// Base action interface
interface BaseAction {
  type: string;
  player: PlayerIndex;
}

// Card Movement Actions
export interface DrawAction extends BaseAction {
  type: 'draw';
  count: number;
}

export interface MoveCardAction extends BaseAction {
  type: 'move_card';
  cardInstanceId: string;
  fromZone: string;
  toZone: string;
  position?: number;
}

export interface PlayCardAction extends BaseAction {
  type: 'play_card';
  cardInstanceId: string;
  toZone: string;
  targetInstanceId?: string;
}

export interface PlaceOnZoneAction extends BaseAction {
  type: 'place_on_zone';
  cardInstanceIds: string[];
  zoneId: string;
  position: 'top' | 'bottom';
}

// Zone Actions
export interface ShuffleAction extends BaseAction {
  type: 'shuffle';
  zoneId: string;
}

export interface SearchZoneAction extends BaseAction {
  type: 'search_zone';
  zoneId: string;
  filter?: string;
  count?: number;
  fromPosition?: 'top' | 'bottom';
}

// Card State Actions
export interface FlipCardAction extends BaseAction {
  type: 'flip_card';
  cardInstanceId: string;
  newVisibility: Visibility;
}

export interface SetOrientationAction extends BaseAction {
  type: 'set_orientation';
  cardInstanceId: string;
  orientation: string;
}

// Counter Actions
export interface AddCounterAction extends BaseAction {
  type: 'add_counter';
  cardInstanceId: string;
  counterType: string;
  amount: number;
}

export interface RemoveCounterAction extends BaseAction {
  type: 'remove_counter';
  cardInstanceId: string;
  counterType: string;
  amount: number;
}

export interface SetCounterAction extends BaseAction {
  type: 'set_counter';
  cardInstanceId: string;
  counterType: string;
  value: number;
}

// Randomness Actions
export interface CoinFlipAction extends BaseAction {
  type: 'coin_flip';
  count: number;
  results?: boolean[];
}

export interface DiceRollAction extends BaseAction {
  type: 'dice_roll';
  count: number;
  sides: number;
  results?: number[];
}

// Game Flow Actions
export interface EndTurnAction extends BaseAction {
  type: 'end_turn';
}

export interface ConcedeAction extends BaseAction {
  type: 'concede';
}

export interface DeclareVictoryAction extends BaseAction {
  type: 'declare_victory';
  reason?: string;
}

// Reveal Action
export interface RevealAction extends BaseAction {
  type: 'reveal';
  cardInstanceIds: string[];
  to: 'opponent' | 'both';
}

// Peek Action - look at cards without changing visibility
export interface PeekAction extends BaseAction {
  type: 'peek';
  zoneId: string;
  count: number;
  fromPosition: 'top' | 'bottom';
}

// Union of all action types
export type Action =
  | DrawAction
  | MoveCardAction
  | PlayCardAction
  | PlaceOnZoneAction
  | ShuffleAction
  | SearchZoneAction
  | FlipCardAction
  | SetOrientationAction
  | AddCounterAction
  | RemoveCounterAction
  | SetCounterAction
  | CoinFlipAction
  | DiceRollAction
  | EndTurnAction
  | ConcedeAction
  | DeclareVictoryAction
  | RevealAction
  | PeekAction;
