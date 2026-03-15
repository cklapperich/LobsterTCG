// ── String literal union types (derived from 19,942 card dataset) ──

export type Supertype = 'Pokemon' | 'Trainer' | 'Energy';

export type EnergyType = 'Colorless' | 'Darkness' | 'Dragon' | 'Fairy' | 'Fighting'
  | 'Fire' | 'Grass' | 'Lightning' | 'Metal' | 'Psychic' | 'Water';

export type Subtype = 'ACE SPEC' | 'Ancient' | 'BREAK' | 'Baby' | 'Basic' | 'EX'
  | 'Eternamax' | 'Fusion Strike' | 'Future' | 'GX' | 'Goldenrod Game Corner'
  | 'Item' | 'LEGEND' | 'Level-Up' | 'MEGA' | 'Pokémon Tool' | 'Pokémon Tool F'
  | 'Prime' | 'Prism Star' | 'Radiant' | 'Rapid Strike' | 'Restored'
  | "Rocket's Secret Machine" | 'SP' | 'Single Strike' | 'Special' | 'Stadium'
  | 'Stage 1' | 'Stage 2' | 'Star' | 'Supporter' | 'TAG TEAM' | 'Team Plasma'
  | 'Technical Machine' | 'Tera' | 'Ultra Beast' | 'V' | 'V-UNION' | 'VMAX'
  | 'VSTAR' | 'ex';

export type Rarity = 'ACE SPEC Rare' | 'Amazing Rare' | 'Black White Rare'
  | 'Classic Collection' | 'Common' | 'Double Rare' | 'Hyper Rare'
  | 'Illustration Rare' | 'LEGEND' | 'MEGA_ATTACK_RARE' | 'Mega Hyper Rare'
  | 'Promo' | 'Radiant Rare' | 'Rare' | 'Rare ACE' | 'Rare BREAK' | 'Rare Holo'
  | 'Rare Holo EX' | 'Rare Holo GX' | 'Rare Holo LV.X' | 'Rare Holo Star'
  | 'Rare Holo V' | 'Rare Holo VMAX' | 'Rare Holo VSTAR' | 'Rare Prime'
  | 'Rare Prism Star' | 'Rare Rainbow' | 'Rare Secret' | 'Rare Shining'
  | 'Rare Shiny' | 'Rare Shiny GX' | 'Rare Ultra' | 'Shiny Rare'
  | 'Shiny Ultra Rare' | 'Special Illustration Rare'
  | 'Trainer Gallery Rare Holo' | 'Ultra Rare' | 'Uncommon';

export type AbilityType = 'Ability' | 'Poké-Body' | 'Poké-Power' | 'Pokémon Power';

export type RegulationMark = 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';

export type LegalityStatus = 'Legal' | 'Banned' | 'Not Legal';

export type LegalityFormat = 'standard' | 'expanded' | 'unlimited';

export type Series = 'Base' | 'Black & White' | 'Diamond & Pearl' | 'E-Card' | 'EX'
  | 'Gym' | 'HeartGold & SoulSilver' | 'Mega Evolution' | 'NP' | 'Neo' | 'Other'
  | 'POP' | 'Platinum' | 'Scarlet & Violet' | 'Sun & Moon' | 'Sword & Shield' | 'XY';

// ── Sub-interfaces ──

export interface WesternAttack {
  name: string;
  cost: EnergyType[];
  damage: string;
  effect?: string;
}

export interface WesternAbility {
  name: string;
  effect: string;
  type: AbilityType;
}

// ── Main card interface ──

export interface WesternCard {
  id: string;
  names: Record<string, string>;
  set: string;
  number: string;
  setNumber?: string;
  ptcgoCode?: string;
  series?: Series;
  supertype?: Supertype;
  subtypes?: Subtype[];
  types?: EnergyType[];
  hp?: number;
  evolveFrom?: string;
  attacks?: WesternAttack[];
  abilities?: WesternAbility[];
  weaknesses?: Array<{ type: EnergyType; value?: string }>;
  resistances?: Array<{ type: EnergyType; value?: string }>;
  retreatCost?: EnergyType[];
  rules?: string[];
  images?: Array<{ url: string; size?: 'small' | 'large' }>;
  releaseDate?: string;
  rarity?: Rarity;
  regulationMark?: RegulationMark;
  illustrator?: string;
  flavorText?: string;
  legalities?: Partial<Record<LegalityFormat, LegalityStatus>>;
}
