import type { Playmat, GameConfig } from '../../core';
import { loadPlaymat } from '../../core';

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

// Cached playmat instance
let cachedPlaymat: Playmat | null = null;

export async function getSolitairePlaymat(): Promise<Playmat> {
  if (!cachedPlaymat) {
    cachedPlaymat = await loadPlaymat('/playmats/solitaire.json');
  }
  return cachedPlaymat;
}

// For synchronous access after initial load
export function getSolitairePlaymatSync(): Playmat {
  if (!cachedPlaymat) {
    throw new Error('Playmat not loaded. Call getSolitairePlaymat() first.');
  }
  return cachedPlaymat;
}

// Derive GameConfig from playmat
export function getGameConfig(playmat: Playmat): GameConfig {
  return {
    gameType: playmat.gameType,
    zones: playmat.zones,
    playerCount: 2, // Required by GameConfig type
  };
}
