// Visibility: which players can see this info
// [playerA_canSee, playerB_canSee]
export type Visibility = [boolean, boolean];
export type PlayerIndex = 0 | 1;

// Common visibility patterns
export const VISIBILITY = {
  PUBLIC: [true, true] as Visibility,
  PLAYER_A_ONLY: [true, false] as Visibility,
  PLAYER_B_ONLY: [false, true] as Visibility,
  HIDDEN: [false, false] as Visibility,
} as const;

// Static card definition
export interface CardTemplate {
  id: string;
  name: string;
  supertype: string;
  subtypes: string[];
  text?: string;
  imageUrl?: string;
}

// Runtime card instance
export interface CardInstance<T extends CardTemplate = CardTemplate> {
  instanceId: string;
  template: T;
  visibility: Visibility;
  orientation?: string; // "normal", "tapped", etc.
  status: string[]; // flags: "played_this_turn", "cant_attack"
  counters: Record<string, number>; // { "damage": 50, "poison": 2 }
  attachments: CardInstance<T>[]; // energy, tools, etc.
  evolutionStack?: CardInstance<T>[]; // cards underneath
}
