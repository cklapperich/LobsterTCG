import { ORIENTATIONS } from '../../core/types/constants';

// Card Supertypes
export const SUPERTYPES = {
  POKEMON: 'Pokemon',
  TRAINER: 'Trainer',
  ENERGY: 'Energy',
} as const;
export type Supertype = typeof SUPERTYPES[keyof typeof SUPERTYPES];

// Pokemon Stages
export const STAGES = {
  BASIC: 'Basic',
  STAGE_1: 'Stage1',
  STAGE_1_ALT: 'Stage 1',
  STAGE_2: 'Stage2',
  STAGE_2_ALT: 'Stage 2',
} as const;

// Trainer Subtypes
export const TRAINER_SUBTYPES = {
  SUPPORTER: 'Supporter',
  STADIUM: 'Stadium',
} as const;

// Status Conditions
export const STATUS_CONDITIONS = {
  NORMAL: 'normal',
  PARALYZED: 'paralyzed',
  ASLEEP: 'asleep',
  CONFUSED: 'confused',
} as const;
export type StatusCondition = typeof STATUS_CONDITIONS[keyof typeof STATUS_CONDITIONS];

// Status ↔ Orientation mappings (single source of truth)
export const STATUS_TO_DEGREES: Record<string, string> = {
  [STATUS_CONDITIONS.NORMAL]: ORIENTATIONS.NORMAL,
  [STATUS_CONDITIONS.PARALYZED]: ORIENTATIONS.TAPPED,
  [STATUS_CONDITIONS.ASLEEP]: ORIENTATIONS.COUNTER_TAPPED,
  [STATUS_CONDITIONS.CONFUSED]: ORIENTATIONS.FLIPPED,
};
export const DEGREES_TO_STATUS: Record<string, string> = {
  [ORIENTATIONS.TAPPED]: STATUS_CONDITIONS.PARALYZED,
  [ORIENTATIONS.COUNTER_TAPPED]: STATUS_CONDITIONS.ASLEEP,
  [ORIENTATIONS.FLIPPED]: STATUS_CONDITIONS.CONFUSED,
};

// Counter IDs
export const COUNTER_IDS = {
  DAMAGE_10: '10',
  DAMAGE_50: '50',
  DAMAGE_100: '100',
  BURN: 'burn',
  POISON: 'poison',
} as const;

// Counter Categories
export const COUNTER_CATEGORIES = { DAMAGE: 'damage', STATUS: 'status' } as const;

// Damage counter numeric values
export const DAMAGE_COUNTER_VALUES: Record<string, number> = {
  [COUNTER_IDS.DAMAGE_10]: 10,
  [COUNTER_IDS.DAMAGE_50]: 50,
  [COUNTER_IDS.DAMAGE_100]: 100,
};

// Counters that should not go on Trainers
export const TRAINER_BLOCKED_COUNTERS = [
  COUNTER_IDS.DAMAGE_10, COUNTER_IDS.DAMAGE_50, COUNTER_IDS.DAMAGE_100,
  COUNTER_IDS.BURN, COUNTER_IDS.POISON,
] as const;

// Energy Types
export const ENERGY_TYPES = { COLORLESS: 'Colorless' } as const;

// Setup constants
export const SETUP = { HAND_SIZE: 7, PRIZE_COUNT: 6, MAX_MULLIGANS: 20 } as const;

// First turn where evolution is allowed
export const FIRST_EVOLUTION_TURN = 2;

// First turn where supporters are allowed (same rule as evolution)
export const FIRST_SUPPORTER_TURN = 2;

// Pokemon-specific action types (custom actions, not in core Action union)
export const POKEMON_ACTION_TYPES = {
  DECLARE_ATTACK: 'declare_attack',
} as const;

// Narrative display limits
export const NARRATIVE = { RECENT_LOG_LIMIT: 15, DISCARD_DISPLAY_LIMIT: 10 } as const;
