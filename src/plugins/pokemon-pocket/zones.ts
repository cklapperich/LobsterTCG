// Zone IDs for Pokemon Pocket (simplified: 3 bench, no prizes/lost zone)
export const ZONE_IDS = {
  DECK: 'deck',
  HAND: 'hand',
  ACTIVE: 'active',
  BENCH: ['bench_1', 'bench_2', 'bench_3'] as const,
  DISCARD: 'discard',
  ENERGY_DISCARD: 'energy_discard',
  STADIUM: 'stadium',
} as const;

// All bench zone IDs
export const BENCH_ZONE_IDS = ZONE_IDS.BENCH;

// All zone IDs as a flat array
export const ALL_ZONE_IDS = [
  ZONE_IDS.DECK,
  ZONE_IDS.HAND,
  ZONE_IDS.ACTIVE,
  ...ZONE_IDS.BENCH,
  ZONE_IDS.DISCARD,
  ZONE_IDS.ENERGY_DISCARD,
  ZONE_IDS.STADIUM,
] as const;
