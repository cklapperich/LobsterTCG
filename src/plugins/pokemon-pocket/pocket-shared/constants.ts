/** Set code → display name mappings for Pokemon Pocket (TCGdex series "tcgp") */
export const POCKET_SETS: Record<string, string> = {
  'P-A': 'Promos-A',
  'A1': 'Genetic Apex',
  'A1a': 'Mythical Island',
  'A2': 'Space-Time Smackdown',
  'A2a': 'Triumphant Light',
  'A2b': 'Shining Revelry',
  'A3': 'Celestial Guardians',
  'A3a': 'Extradimensional Crisis',
  'A3b': 'Eevee Grove',
  'A4': 'Wisdom of Sea and Sky',
  'A4a': 'Secluded Springs',
  'B1': 'Mega Rising',
  'B1a': 'Crimson Blaze',
  'B2': 'Fantastical Parade',
};

/** Rarity strings as returned by TCGdex for Pocket cards */
export const POCKET_RARITIES = [
  'One Diamond', 'Two Diamond', 'Three Diamond', 'Four Diamond',
  'One Star', 'Two Star', 'Three Star',
  'Crown', 'Promo',
] as const;
