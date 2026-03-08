export interface WesternCard {
  id: string;
  names: Record<string, string>;
  set: string;
  number: string;
  ptcgoCode?: string;
  series?: string;
  supertype?: string;
  subtypes?: string[];
  types?: string[];
  hp?: number;
  evolveFrom?: string;
  attacks?: Array<{ name: string; cost: string[]; damage: string; effect?: string }>;
  abilities?: Array<{ name: string; effect: string; type: string }>;
  weaknesses?: Array<{ type: string; value?: string }>;
  resistances?: Array<{ type: string; value?: string }>;
  retreatCost?: string[];
  rules?: string[];
  images?: Array<{ url: string; size?: string }>;
  releaseDate?: string;
  rarity?: string;
  illustrator?: string;
  flavorText?: string;
  legalities?: { standard?: string; expanded?: string; unlimited?: string };
  regulationMark?: string;
}
