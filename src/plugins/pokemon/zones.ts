// Zone IDs for Pokemon TCG
export const ZONE_IDS = {
  DECK: 'deck',
  HAND: 'hand',
  ACTIVE: 'active',
  BENCH: ['bench_1', 'bench_2', 'bench_3', 'bench_4', 'bench_5'] as const,
  DISCARD: 'discard',
  PRIZES: 'prizes',
  LOST_ZONE: 'lost_zone',
  STADIUM: 'stadium',
} as const;

// All bench zone IDs
export const BENCH_ZONE_IDS = ZONE_IDS.BENCH;

// Prize zone ID
export const PRIZE_ZONE_IDS = ZONE_IDS.PRIZES;

// All zone IDs as a flat array
export const ALL_ZONE_IDS = [
  ZONE_IDS.DECK,
  ZONE_IDS.HAND,
  ZONE_IDS.ACTIVE,
  ...ZONE_IDS.BENCH,
  ZONE_IDS.DISCARD,
  ZONE_IDS.PRIZES,
  ZONE_IDS.LOST_ZONE,
  ZONE_IDS.STADIUM,
] as const;
