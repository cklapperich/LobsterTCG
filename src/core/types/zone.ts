import type { CardTemplate, CardInstance, Visibility, PlayerIndex } from './card';

export interface ZoneConfig {
  id: string;
  name: string;
  ordered: boolean; // deck=ordered, hand=unordered
  defaultVisibility: Visibility;
  maxCards: number; // -1 = unlimited
  ownerCanSeeContents: boolean;
  opponentCanSeeCount: boolean;
  shared?: boolean; // Both players can interact (e.g., stadium)
}

export interface Zone<T extends CardTemplate = CardTemplate> {
  key: string; // unique zone key: "player0_deck", "player1_hand", etc.
  config: ZoneConfig;
  owner: PlayerIndex;
  cards: CardInstance<T>[]; // index 0 = visual bottom, end of array = visual top
}
