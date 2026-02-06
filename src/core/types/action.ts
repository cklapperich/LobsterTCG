import type { PlayerIndex, Visibility } from './card';
import type { ACTION_TYPES, ACTION_SOURCES, POSITIONS, REVEAL_TARGETS } from './constants';

// Base action interface
interface BaseAction {
  type: string;
  player: PlayerIndex;
  allowed_by_effect?: boolean;  // Card effect overrides normal rules
  source?: typeof ACTION_SOURCES.UI | typeof ACTION_SOURCES.AI;
}

// Card Movement Actions
export interface DrawAction extends BaseAction {
  type: typeof ACTION_TYPES.DRAW;
  count: number;
}

export interface MoveCardAction extends BaseAction {
  type: typeof ACTION_TYPES.MOVE_CARD;
  cardInstanceId: string;
  fromZone: string;  // Zone key (e.g., "player2_hand")
  toZone: string;    // Zone key (e.g., "player2_discard")
  position?: number;
}

export interface MoveCardStackAction extends BaseAction {
  type: typeof ACTION_TYPES.MOVE_CARD_STACK;
  cardInstanceIds: string[];
  fromZone: string;  // Zone key (e.g., "player1_deck")
  toZone: string;    // Zone key (e.g., "player1_hand")
  position?: number;
}

export interface PlaceOnZoneAction extends BaseAction {
  type: typeof ACTION_TYPES.PLACE_ON_ZONE;
  cardInstanceIds: string[];
  zoneId: string;    // Zone key (e.g., "player2_deck")
  position: typeof POSITIONS.TOP | typeof POSITIONS.BOTTOM;
}

// Zone Actions
export interface ShuffleAction extends BaseAction {
  type: typeof ACTION_TYPES.SHUFFLE;
  zoneId: string;    // Zone key (e.g., "player1_deck")
}

export interface SearchZoneAction extends BaseAction {
  type: typeof ACTION_TYPES.SEARCH_ZONE;
  zoneId: string;    // Zone key (e.g., "player2_deck")
  filter?: string;
  count?: number;
  fromPosition?: typeof POSITIONS.TOP | typeof POSITIONS.BOTTOM;
}

// Card State Actions
export interface FlipCardAction extends BaseAction {
  type: typeof ACTION_TYPES.FLIP_CARD;
  cardInstanceId: string;
  newVisibility: Visibility;
}

export interface SetOrientationAction extends BaseAction {
  type: typeof ACTION_TYPES.SET_ORIENTATION;
  cardInstanceId: string;
  orientation: string;
}

// Counter Actions
export interface AddCounterAction extends BaseAction {
  type: typeof ACTION_TYPES.ADD_COUNTER;
  cardInstanceId: string;
  counterType: string;
  amount: number;
}

export interface RemoveCounterAction extends BaseAction {
  type: typeof ACTION_TYPES.REMOVE_COUNTER;
  cardInstanceId: string;
  counterType: string;
  amount: number;
}

export interface SetCounterAction extends BaseAction {
  type: typeof ACTION_TYPES.SET_COUNTER;
  cardInstanceId: string;
  counterType: string;
  value: number;
}

// Randomness Actions
export interface CoinFlipAction extends BaseAction {
  type: typeof ACTION_TYPES.COIN_FLIP;
  count: number;
  results?: boolean[];
}

export interface DiceRollAction extends BaseAction {
  type: typeof ACTION_TYPES.DICE_ROLL;
  count: number;
  sides: number;
  results?: number[];
}

// Game Flow Actions
export interface EndTurnAction extends BaseAction {
  type: typeof ACTION_TYPES.END_TURN;
}

export interface ConcedeAction extends BaseAction {
  type: typeof ACTION_TYPES.CONCEDE;
}

export interface DeclareVictoryAction extends BaseAction {
  type: typeof ACTION_TYPES.DECLARE_VICTORY;
  reason?: string;
}

// Decision Actions
export interface CreateDecisionAction extends BaseAction {
  type: typeof ACTION_TYPES.CREATE_DECISION;
  targetPlayer: PlayerIndex;
  message?: string;
}

export interface ResolveDecisionAction extends BaseAction {
  type: typeof ACTION_TYPES.RESOLVE_DECISION;
}

// Reveal Hand Action - reveals a zone to opponent, logs contents, creates decision
export interface RevealHandAction extends BaseAction {
  type: typeof ACTION_TYPES.REVEAL_HAND;
  zoneKey: string;
  mutual?: boolean;  // When true, reveals both this zone and the opponent's equivalent zone
  message?: string;  // Custom decision message (overrides default)
}

// Reveal Action
export interface RevealAction extends BaseAction {
  type: typeof ACTION_TYPES.REVEAL;
  cardInstanceIds: string[];
  to: typeof REVEAL_TARGETS.OPPONENT | typeof REVEAL_TARGETS.BOTH;
}

// Peek Action - look at cards without changing visibility
export interface PeekAction extends BaseAction {
  type: typeof ACTION_TYPES.PEEK;
  zoneId: string;    // Zone key (e.g., "player1_deck")
  count: number;
  fromPosition: typeof POSITIONS.TOP | typeof POSITIONS.BOTTOM;
}

// Union of all action types
export type Action =
  | DrawAction
  | MoveCardAction
  | MoveCardStackAction
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
  | CreateDecisionAction
  | ResolveDecisionAction
  | RevealHandAction
  | RevealAction
  | PeekAction;
