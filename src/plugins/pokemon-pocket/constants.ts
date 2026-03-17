import { ORIENTATIONS } from '../../core/types/constants';
import type { EnergyType } from './types';

// Card Supertypes
export const SUPERTYPES = {
  POKEMON: 'Pokemon',
  TRAINER: 'Trainer',
} as const;

// Pokemon Stages
export const STAGES = {
  BASIC: 'Basic',
  STAGE_1: 'Stage 1',
  STAGE_2: 'Stage 2',
} as const;

// Trainer Subtypes
export const TRAINER_SUBTYPES = {
  SUPPORTER: 'Supporter',
  ITEM: 'Item',
  STADIUM: 'Stadium',
} as const;

// Status Conditions (same as standard but no confused in Pocket)
export const STATUS_CONDITIONS = {
  NORMAL: 'normal',
  PARALYZED: 'paralyzed',
  ASLEEP: 'asleep',
} as const;
export type StatusCondition = typeof STATUS_CONDITIONS[keyof typeof STATUS_CONDITIONS];

// Status ↔ Orientation mappings
export const STATUS_TO_DEGREES: Record<string, string> = {
  [STATUS_CONDITIONS.NORMAL]: ORIENTATIONS.NORMAL,
  [STATUS_CONDITIONS.PARALYZED]: ORIENTATIONS.TAPPED,
  [STATUS_CONDITIONS.ASLEEP]: ORIENTATIONS.COUNTER_TAPPED,
};
export const DEGREES_TO_STATUS: Record<string, string> = {
  [ORIENTATIONS.TAPPED]: STATUS_CONDITIONS.PARALYZED,
  [ORIENTATIONS.COUNTER_TAPPED]: STATUS_CONDITIONS.ASLEEP,
};

// Counter IDs — damage + status
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

// AI-friendly counter type names → internal counter IDs
export const AI_COUNTER_TYPES: Record<string, string> = {
  damage: COUNTER_IDS.DAMAGE_10,
  burn: COUNTER_IDS.BURN,
  poison: COUNTER_IDS.POISON,
} as const;

// All possible energy types
export const ENERGY_TYPES: EnergyType[] = [
  'fire', 'water', 'grass', 'lightning', 'psychic',
  'fighting', 'darkness', 'metal', 'dragon', 'colorless',
];

// Energy counter type IDs (used as counter keys on Pokemon cards)
export const ENERGY_COUNTER_TYPES: Record<EnergyType, string> = {
  fire: 'fire_energy',
  water: 'water_energy',
  grass: 'grass_energy',
  lightning: 'lightning_energy',
  psychic: 'psychic_energy',
  fighting: 'fighting_energy',
  darkness: 'darkness_energy',
  metal: 'metal_energy',
  dragon: 'dragon_energy',
  colorless: 'colorless_energy',
};

// Setup constants
export const SETUP = { HAND_SIZE: 5, DECK_SIZE: 20, MAX_MULLIGANS: 20 } as const;

// Points to win
export const POINTS_TO_WIN = 3;

// First turn where evolution is allowed
export const FIRST_EVOLUTION_TURN = 2;

// Pokemon declaration subtypes
export const POCKET_DECLARATION_TYPES = {
  ATTACK: 'attack',
  ABILITY: 'ability',
  RETREAT: 'retreat',
  STADIUM: 'stadium',
  AWARD_POINTS: 'award_points',
} as const;

// Narrative display limits
export const NARRATIVE = { RECENT_LOG_LIMIT: 15, DISCARD_DISPLAY_LIMIT: 10 } as const;
