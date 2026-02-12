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

// Static card definition - minimal, games can add extra properties
export interface CardTemplate {
  id: string;
  name: string;
  imageUrl?: string;
  displayRotation?: number; // degrees — inherent visual rotation (e.g. 90 for landscape cards)
}

// Runtime card instance
export interface CardInstance<T extends CardTemplate = CardTemplate> {
  instanceId: string;
  template: T;
  visibility: Visibility;
  orientation?: string; // "normal", "tapped", etc.
  flags: string[]; // engine flags: "played_this_turn", etc.
  counters: Record<string, number>; // { "damage": 50, "poison": 2 }
}
