import type { CardTemplate, CardInstance, Visibility, PlayerIndex } from './card';

export interface ZoneConfig {
  name: string;
  ordered: boolean; // deck=ordered, hand=unordered
  defaultVisibility: Visibility;
  maxCards: number; // -1 = unlimited
  ownerCanSeeContents: boolean;
  opponentCanSeeCount: boolean;
  shared?: boolean; // Both players can interact (e.g., stadium)
  canHaveCounters?: boolean; // Whether cards in this zone can hold counters (default: true)
  shuffleable?: boolean; // Whether shuffle appears in context menu (default: false)
  zoneCounters?: boolean; // Zone holds counters directly (not on cards) — e.g. energy discard readout
  allowedCounterCategories?: string[]; // Restrict which counter categories this zone-counter zone accepts
}

export interface Zone<T extends CardTemplate = CardTemplate> {
  key: string; // unique zone key: "player1_deck", "player2_hand", etc.
  config: ZoneConfig;
  owner: PlayerIndex;
  cards: CardInstance<T>[]; // index 0 = visual bottom, end of array = visual top
  counters?: Record<string, number>; // Zone-level counters (when config.zoneCounters is true)
}
