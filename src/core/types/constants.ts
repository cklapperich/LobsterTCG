// Action Types — discriminated union tags used in 10+ files
export const ACTION_TYPES = {
  DRAW: 'draw',
  MOVE_CARD: 'move_card',
  MOVE_CARD_STACK: 'move_card_stack',
  PLACE_ON_ZONE: 'place_on_zone',
  SHUFFLE: 'shuffle',
  SEARCH_ZONE: 'search_zone',
  FLIP_CARD: 'flip_card',
  SET_ORIENTATION: 'set_orientation',
  ADD_COUNTER: 'add_counter',
  REMOVE_COUNTER: 'remove_counter',
  SET_COUNTER: 'set_counter',
  COIN_FLIP: 'coin_flip',
  DICE_ROLL: 'dice_roll',
  END_TURN: 'end_turn',
  CONCEDE: 'concede',
  DECLARE_VICTORY: 'declare_victory',
  CREATE_DECISION: 'create_decision',
  RESOLVE_DECISION: 'resolve_decision',
  REVEAL_HAND: 'reveal_hand',
  REVEAL: 'reveal',
  PEEK: 'peek',
  MULLIGAN: 'mulligan',
  SWAP_CARD_STACKS: 'swap_card_stacks',
  REARRANGE_ZONE: 'rearrange_zone',
  DECLARE_ACTION:'declare_action'
} as const;
export type ActionType = typeof ACTION_TYPES[keyof typeof ACTION_TYPES];

// Game Phases
export const PHASES = {DECISION: 'decision', SETUP: 'setup', PLAYING: 'playing' } as const;
export type Phase = typeof PHASES[keyof typeof PHASES];

// Action Sources
export const ACTION_SOURCES = { UI: 'ui', AI: 'ai' } as const;
export type ActionSource = typeof ACTION_SOURCES[keyof typeof ACTION_SOURCES];

// Hook Outcomes
export const HOOK_OUTCOMES = {
  CONTINUE: 'continue',
  WARN: 'warn',
  BLOCK: 'block',
  REPLACE: 'replace',
} as const;
export type HookOutcome = typeof HOOK_OUTCOMES[keyof typeof HOOK_OUTCOMES];

// Position (top/bottom of zone)
export const POSITIONS = { TOP: 'top', BOTTOM: 'bottom' } as const;
export type Position = typeof POSITIONS[keyof typeof POSITIONS];

// Reveal Targets
export const REVEAL_TARGETS = { OPPONENT: 'opponent', BOTH: 'both' } as const;

// Card Orientation (degree values)
export const ORIENTATIONS = {
  NORMAL: '0',
  TAPPED: '90',
  COUNTER_TAPPED: '-90',
  FLIPPED: '180',
} as const;

// Orientation name strings (used in action.ts factory, engine default)
export const ORIENTATION_NAMES = { NORMAL: 'normal', TAPPED: 'tapped' } as const;

// Stack Directions
export const STACK_DIRECTIONS = {
  NONE: 'none',
  DOWN: 'down',
  UP: 'up',
  RIGHT: 'right',
  FAN: 'fan',
} as const;
export type StackDirection = typeof STACK_DIRECTIONS[keyof typeof STACK_DIRECTIONS];

// Game Events
export const GAME_EVENTS = {
  ACTION_QUEUED: 'action:queued',
  ACTION_EXECUTING: 'action:executing',
  ACTION_EXECUTED: 'action:executed',
  ACTION_REJECTED: 'action:rejected',
  ACTION_BLOCKED: 'action:blocked',
  ACTION_REPLACED: 'action:replaced',
  AUTO_ACTION_QUEUED: 'auto-action:queued',
  TURN_ENDED: 'turn:ended',
  TURN_STARTED: 'turn:started',
} as const;
export type GameEventType = typeof GAME_EVENTS[keyof typeof GAME_EVENTS];

// Playmat Visibility Strings (parsed from JSON)
export const PLAYMAT_VISIBILITY = {
  PUBLIC: 'public',
  HIDDEN: 'hidden',
  PLAYER_A_ONLY: 'player_a_only',
  PLAYER_B_ONLY: 'player_b_only',
} as const;

// Hidden Card representation
export const HIDDEN_CARD = {
  TEMPLATE_ID: 'hidden',
  DISPLAY_NAME: 'Hidden Card',
  AI_NAME: '[hidden card]',
} as const;

// Instance ID prefix
export const INSTANCE_ID_PREFIX = 'card_';

// Card Flags
export const CARD_FLAGS = { PLAYED_THIS_TURN: 'played_this_turn' } as const;

// Default hook priority
export const DEFAULT_HOOK_PRIORITY = 100;

// Readable state log limit
export const READABLE_LOG_LIMIT = 100;

// Coin flip threshold
export const COIN_FLIP_THRESHOLD = 0.5;

// Unlimited zone capacity sentinel
export const UNLIMITED_CAPACITY = -1;
