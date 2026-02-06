import type { PlayerIndex, Visibility } from './card';

// Base action interface
interface BaseAction {
  type: string;
  player: PlayerIndex;
  allowed_by_effect?: boolean;  // Card effect overrides normal rules
  source?: 'ui' | 'ai';        // Origin of the action (ui = never blocked by warnings)
}

// Card Movement Actions
export interface DrawAction extends BaseAction {
  type: 'draw';
  count: number;
}

export interface MoveCardAction extends BaseAction {
  type: 'move_card';
  cardInstanceId: string;
  fromZone: string;  // Zone key (e.g., "player1_hand")
  toZone: string;    // Zone key (e.g., "player1_discard")
  position?: number;
}

export interface MoveCardStackAction extends BaseAction {
  type: 'move_card_stack';
  cardInstanceIds: string[];
  fromZone: string;  // Zone key (e.g., "player0_deck")
  toZone: string;    // Zone key (e.g., "player0_hand")
  position?: number;
}

export interface PlaceOnZoneAction extends BaseAction {
  type: 'place_on_zone';
  cardInstanceIds: string[];
  zoneId: string;    // Zone key (e.g., "player1_deck")
  position: 'top' | 'bottom';
}

// Zone Actions
export interface ShuffleAction extends BaseAction {
  type: 'shuffle';
  zoneId: string;    // Zone key (e.g., "player0_deck")
}

export interface SearchZoneAction extends BaseAction {
  type: 'search_zone';
  zoneId: string;    // Zone key (e.g., "player1_deck")
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

// Decision Actions
export interface CreateDecisionAction extends BaseAction {
  type: 'create_decision';
  targetPlayer: PlayerIndex;
  message?: string;
}

export interface ResolveDecisionAction extends BaseAction {
  type: 'resolve_decision';
}

// Reveal Hand Action - reveals a zone to opponent, logs contents, creates decision
export interface RevealHandAction extends BaseAction {
  type: 'reveal_hand';
  zoneKey: string;
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
  zoneId: string;    // Zone key (e.g., "player0_deck")
  count: number;
  fromPosition: 'top' | 'bottom';
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
