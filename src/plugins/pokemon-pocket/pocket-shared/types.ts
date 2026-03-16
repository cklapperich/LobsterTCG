// Energy types as returned by TCGdex (title case)
export type TCGdexEnergyType = 'Colorless' | 'Darkness' | 'Dragon' | 'Fairy' | 'Fighting'
  | 'Fire' | 'Grass' | 'Lightning' | 'Metal' | 'Psychic' | 'Water';

export interface TCGdexAttack {
  cost: TCGdexEnergyType[];
  name: string;
  damage?: string;
  effect?: string;
}

export interface TCGdexAbility {
  type: string;   // "Ability"
  name: string;
  effect: string;
}

export interface TCGdexWeakness {
  type: TCGdexEnergyType;
  value: string;  // "+20"
}

export interface TCGdexSet {
  id: string;
  name: string;
  logo?: string;
  symbol?: string;
  cardCount?: { official: number; total: number };
}

export interface TCGdexCard {
  id: string;          // "A1-001"
  localId: string;     // "001"
  name: string;
  category: 'Pokemon' | 'Trainer';
  image?: string;      // URL
  rarity?: string;
  set: TCGdexSet;
  hp?: number;
  types?: TCGdexEnergyType[];
  stage?: string;      // "Basic", "Stage1", "Stage2"
  suffix?: string;     // "EX"
  evolveFrom?: string;
  description?: string;
  attacks?: TCGdexAttack[];
  abilities?: TCGdexAbility[];
  weaknesses?: TCGdexWeakness[];
  retreat?: number;
  effect?: string;            // Trainer card effect text
  trainerType?: string;       // "Supporter", "Item"
  illustrator?: string;
  boosters?: Array<{ id: string; name: string }>;
  updated?: string;
}
