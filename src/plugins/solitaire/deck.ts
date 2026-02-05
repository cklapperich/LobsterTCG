import type { CardTemplate, DeckList } from '../../core';

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];

export function getSuitSymbol(suit: Suit): string {
  switch (suit) {
    case 'hearts':
      return '♥';
    case 'diamonds':
      return '♦';
    case 'clubs':
      return '♣';
    case 'spades':
      return '♠';
  }
}

export function getSuitColor(suit: Suit): 'red' | 'black' {
  return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black';
}

export function getRankValue(rank: Rank): number {
  const index = RANKS.indexOf(rank);
  return index + 1; // A=1, 2=2, ..., K=13
}

export interface PlayingCardTemplate extends CardTemplate {
  rank: Rank;
  suit: Suit;
  color: 'red' | 'black';
  value: number;
}

function createCardTemplate(rank: Rank, suit: Suit): PlayingCardTemplate {
  const symbol = getSuitSymbol(suit);
  const color = getSuitColor(suit);

  return {
    id: `${rank}-${suit}`,
    name: `${rank}${symbol}`,
    rank,
    suit,
    color,
    value: getRankValue(rank),
  };
}

// Generate all 52 card templates
export const PLAYING_CARD_TEMPLATES: PlayingCardTemplate[] = SUITS.flatMap((suit) =>
  RANKS.map((rank) => createCardTemplate(rank, suit))
);

// Create a lookup map for quick template access
export const CARD_TEMPLATE_MAP: Map<string, PlayingCardTemplate> = new Map(
  PLAYING_CARD_TEMPLATES.map((t) => [t.id, t])
);

// Deck list referencing the templates (1 of each card)
export const STANDARD_DECK: DeckList = {
  id: 'standard-52',
  name: 'Standard Playing Cards',
  cards: PLAYING_CARD_TEMPLATES.map((template) => ({
    templateId: template.id,
    count: 1,
  })),
};

export function getTemplate(templateId: string): PlayingCardTemplate | undefined {
  return CARD_TEMPLATE_MAP.get(templateId);
}

// Card back - uses default pattern (no image)
export function getCardBack(): string | undefined {
  return undefined; // Uses default CSS pattern
}

// Render face data for Card component
export function renderCardFace(template: unknown): { rank?: string; suit?: string; color?: string } {
  const t = template as PlayingCardTemplate;
  if (!t.rank || !t.suit) {
    return {};
  }
  return {
    rank: t.rank,
    suit: getSuitSymbol(t.suit),
    color: t.color,
  };
}

// Get card info string for modals
export function getCardInfo(template: unknown): string {
  const t = template as PlayingCardTemplate;
  if (!t.rank || !t.suit) {
    return (template as { name?: string }).name ?? 'Unknown';
  }
  return `${t.rank}${getSuitSymbol(t.suit)} - ${t.rank} of ${t.suit}`;
}
