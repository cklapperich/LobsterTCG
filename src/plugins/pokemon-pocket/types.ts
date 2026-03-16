import type { CardTemplate } from '../../core/types/card';

/** Pocket-specific deck metadata stored in DeckList.metadata */
export interface PocketDeckMetadata {
  energy_types: EnergyType[];
}

export type EnergyType =
  | 'fire'
  | 'water'
  | 'grass'
  | 'lightning'
  | 'psychic'
  | 'fighting'
  | 'darkness'
  | 'metal'
  | 'dragon'
  | 'colorless';

export interface PocketAttack {
  name: string;
  cost: EnergyType[];
  damage: string;
  effect?: string;
}

export interface PocketAbility {
  name: string;
  type: string;
  effect: string;
}

export type PocketSupertype = 'Pokemon' | 'Trainer';
export type PocketSubtype = 'Basic' | 'Stage 1' | 'Stage 2' | 'Item' | 'Supporter' | 'Stadium' | 'ex';

export interface PocketCardTemplate extends CardTemplate {
  supertype: PocketSupertype;
  subtypes: PocketSubtype[];
  types: EnergyType[];
  hp?: number;
  evolveFrom?: string;
  attacks?: PocketAttack[];
  abilities?: PocketAbility[];
  weakness?: { type: EnergyType; value: number };
  retreatCost?: number;
  rules?: string[];
  effect?: string;         // Trainer card effect text
  trainerType?: string;    // "Supporter", "Item"
}
