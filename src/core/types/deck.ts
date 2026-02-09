export interface DeckEntry {
  templateId: string;
  count: number;
}

export interface DeckList {
  id: string;
  name: string;
  cards: DeckEntry[];
  maxSize?: number; // optional constraint, -1 = unlimited
}

/** A loaded deck bundled with its optional strategy text. */
export interface DeckSelection {
  deckList: DeckList;
  strategy: string;
}
