export const ZONE_IDS = {
  STOCK: 'stock',
  WASTE: 'waste',
  FOUNDATION_1: 'foundation_1',
  FOUNDATION_2: 'foundation_2',
  FOUNDATION_3: 'foundation_3',
  FOUNDATION_4: 'foundation_4',
  TABLEAU_1: 'tableau_1',
  TABLEAU_2: 'tableau_2',
  TABLEAU_3: 'tableau_3',
  TABLEAU_4: 'tableau_4',
  TABLEAU_5: 'tableau_5',
  TABLEAU_6: 'tableau_6',
  TABLEAU_7: 'tableau_7',
} as const;

export const FOUNDATION_ZONE_IDS = [
  ZONE_IDS.FOUNDATION_1,
  ZONE_IDS.FOUNDATION_2,
  ZONE_IDS.FOUNDATION_3,
  ZONE_IDS.FOUNDATION_4,
] as const;

export const TABLEAU_ZONE_IDS = [
  ZONE_IDS.TABLEAU_1,
  ZONE_IDS.TABLEAU_2,
  ZONE_IDS.TABLEAU_3,
  ZONE_IDS.TABLEAU_4,
  ZONE_IDS.TABLEAU_5,
  ZONE_IDS.TABLEAU_6,
  ZONE_IDS.TABLEAU_7,
] as const;
