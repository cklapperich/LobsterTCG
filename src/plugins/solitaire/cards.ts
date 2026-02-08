import type { CardTemplate, DeckList } from '../../core';

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export type Suit = typeof SUITS[number];
export type Rank = typeof RANKS[number];

export interface SolitaireCardTemplate extends CardTemplate {
  suit: Suit;
  rank: Rank;
  value: number; // 1-13
  color: 'red' | 'black';
}

function suitColor(suit: Suit): 'red' | 'black' {
  return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black';
}

function rankValue(rank: Rank): number {
  if (rank === 'A') return 1;
  if (rank === 'J') return 11;
  if (rank === 'Q') return 12;
  if (rank === 'K') return 13;
  return parseInt(rank);
}

// Generate all 52 cards
const templates: SolitaireCardTemplate[] = [];
export const SOLITAIRE_TEMPLATE_MAP = new Map<string, SolitaireCardTemplate>();

for (const suit of SUITS) {
  for (const rank of RANKS) {
    const id = `${rank}_${suit}`;
    const name = `${rank} of ${suit.charAt(0).toUpperCase() + suit.slice(1)}`;
    const template: SolitaireCardTemplate = {
      id,
      name,
      suit,
      rank,
      value: rankValue(rank),
      color: suitColor(suit),
    };
    templates.push(template);
    SOLITAIRE_TEMPLATE_MAP.set(id, template);
  }
}

export function getTemplate(id: string): SolitaireCardTemplate | undefined {
  return SOLITAIRE_TEMPLATE_MAP.get(id);
}

export const STANDARD_DECK: DeckList = {
  id: 'standard-52',
  name: 'Standard 52-Card Deck',
  cards: templates.map(t => ({ templateId: t.id, count: 1 })),
};
