import type { ZoneConfig, GameConfig } from '../../core';
import { VISIBILITY } from '../../core';

// Klondike Solitaire zones:
// - stock: face-down draw pile
// - waste: face-up cards drawn from stock
// - foundation_1-4: build piles (Ace to King by suit)
// - tableau_1-7: main play columns

export const SOLITAIRE_ZONES: ZoneConfig[] = [
  // Stock (draw pile) - ordered, face down
  {
    id: 'stock',
    name: 'Stock',
    ordered: true,
    defaultVisibility: VISIBILITY.HIDDEN,
    maxCards: -1,
    ownerCanSeeContents: false,
    opponentCanSeeCount: true,
  },
  // Waste (drawn cards) - ordered, face up
  {
    id: 'waste',
    name: 'Waste',
    ordered: true,
    defaultVisibility: VISIBILITY.PUBLIC,
    maxCards: -1,
    ownerCanSeeContents: true,
    opponentCanSeeCount: true,
  },
  // Foundation piles (4) - ordered, face up, build Ace to King
  {
    id: 'foundation_1',
    name: 'Foundation 1',
    ordered: true,
    defaultVisibility: VISIBILITY.PUBLIC,
    maxCards: 13,
    ownerCanSeeContents: true,
    opponentCanSeeCount: true,
  },
  {
    id: 'foundation_2',
    name: 'Foundation 2',
    ordered: true,
    defaultVisibility: VISIBILITY.PUBLIC,
    maxCards: 13,
    ownerCanSeeContents: true,
    opponentCanSeeCount: true,
  },
  {
    id: 'foundation_3',
    name: 'Foundation 3',
    ordered: true,
    defaultVisibility: VISIBILITY.PUBLIC,
    maxCards: 13,
    ownerCanSeeContents: true,
    opponentCanSeeCount: true,
  },
  {
    id: 'foundation_4',
    name: 'Foundation 4',
    ordered: true,
    defaultVisibility: VISIBILITY.PUBLIC,
    maxCards: 13,
    ownerCanSeeContents: true,
    opponentCanSeeCount: true,
  },
  // Tableau columns (7) - ordered, mixed visibility (top card face up)
  {
    id: 'tableau_1',
    name: 'Tableau 1',
    ordered: true,
    defaultVisibility: VISIBILITY.PUBLIC,
    maxCards: -1,
    ownerCanSeeContents: true,
    opponentCanSeeCount: true,
  },
  {
    id: 'tableau_2',
    name: 'Tableau 2',
    ordered: true,
    defaultVisibility: VISIBILITY.PUBLIC,
    maxCards: -1,
    ownerCanSeeContents: true,
    opponentCanSeeCount: true,
  },
  {
    id: 'tableau_3',
    name: 'Tableau 3',
    ordered: true,
    defaultVisibility: VISIBILITY.PUBLIC,
    maxCards: -1,
    ownerCanSeeContents: true,
    opponentCanSeeCount: true,
  },
  {
    id: 'tableau_4',
    name: 'Tableau 4',
    ordered: true,
    defaultVisibility: VISIBILITY.PUBLIC,
    maxCards: -1,
    ownerCanSeeContents: true,
    opponentCanSeeCount: true,
  },
  {
    id: 'tableau_5',
    name: 'Tableau 5',
    ordered: true,
    defaultVisibility: VISIBILITY.PUBLIC,
    maxCards: -1,
    ownerCanSeeContents: true,
    opponentCanSeeCount: true,
  },
  {
    id: 'tableau_6',
    name: 'Tableau 6',
    ordered: true,
    defaultVisibility: VISIBILITY.PUBLIC,
    maxCards: -1,
    ownerCanSeeContents: true,
    opponentCanSeeCount: true,
  },
  {
    id: 'tableau_7',
    name: 'Tableau 7',
    ordered: true,
    defaultVisibility: VISIBILITY.PUBLIC,
    maxCards: -1,
    ownerCanSeeContents: true,
    opponentCanSeeCount: true,
  },
];

export const SOLITAIRE_CONFIG: GameConfig = {
  gameType: 'solitaire',
  zones: SOLITAIRE_ZONES,
  playerCount: 2, // Required by GameConfig, but solitaire only uses player 0
};

// Helper to get zone IDs
export const ZONE_IDS = {
  STOCK: 'stock',
  WASTE: 'waste',
  FOUNDATIONS: ['foundation_1', 'foundation_2', 'foundation_3', 'foundation_4'],
  TABLEAUS: [
    'tableau_1',
    'tableau_2',
    'tableau_3',
    'tableau_4',
    'tableau_5',
    'tableau_6',
    'tableau_7',
  ],
} as const;
