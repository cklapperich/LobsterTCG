// Image source information
export interface CardImage {
  url: string;
  source: 'tcgdex' | 'pokemontcg-io';
  size?: 'small' | 'large' | 'low' | 'high';
}

// Card structure from cards-western.json
export interface Card {
  id: string;
  names: Record<string, string>; // Card names (English only: { en: "Pikachu" })
  set: string;
  number: string;
  setNumber?: string; // Combined field for searching "Set Number"
  releaseDate: string; // Format: YYYY/MM/DD
  series: string; // e.g., "Base", "Black & White", "Scarlet & Violet"
  supertype: string; // "Pokémon", "Trainer", or "Energy"
  subtypes: string[]; // e.g., ["Stage 2"], ["Item"], ["Supporter"], ["Basic", "V"]
  types: string[]; // Pokémon types: ["Fire"], ["Water", "Psychic"], etc.
  ptcgoCode?: string; // PTCGO set code (e.g., "TEU", "CEC", "SVE")
  rarity: string; // Card rarity (e.g., "Common", "Rare", "Ultra Rare")
  illustrator?: string; // Card illustrator/artist name
  hp?: number; // HP for Pokémon cards
  attacks?: Attack[]; // Attacks for Pokémon cards
  abilities?: Ability[]; // Abilities for Pokémon cards
  weaknesses?: Weakness[]; // Weaknesses for Pokémon cards
  resistances?: Resistance[]; // Resistances for Pokémon cards
  retreatCost?: string[]; // Retreat cost (energy types)
  flavorText?: string; // Pokedex entry text
  rules?: string[]; // Trainer/Energy effect text
  seriesId?: string; // TCGdex series ID for constructing image URLs
  setId?: string; // TCGdex set ID for constructing image URLs
  images?: CardImage[];
}

// Attack structure
export interface Attack {
  name: string;
  cost: string[]; // Energy types required
  damage?: string; // Damage (e.g., "60", "30+", "×")
  effect?: string; // Attack effect description
}

// Ability structure
export interface Ability {
  name: string;
  effect: string; // Ability effect description
  type: string; // Ability type (e.g., "Ability", "Poké-Power", "Poké-Body")
}

// Weakness structure
export interface Weakness {
  type: string; // Energy type
  value?: string; // Weakness modifier (e.g., "×2", "+20")
}

// Resistance structure
export interface Resistance {
  type: string; // Energy type
  value?: string; // Resistance modifier (e.g., "-20", "-30")
}
