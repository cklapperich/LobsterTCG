import type { CardTemplate } from '../../core/types/card';
import type { DeckList } from '../../core/types/deck';
import cardsData from './cards-western.json';
import cardbackImg from './cardback.png';
import type { WesternCard } from './pokemon-shared/types';
import { parsePTCGO } from './pokemon-shared/ptcgoParser';

/**
 * Attack data from the card database.
 */
export interface PokemonAttack {
  name: string;
  cost: string[];
  damage: string;
  effect?: string;
}

/**
 * Ability data from the card database.
 */
export interface PokemonAbility {
  name: string;
  effect: string;
  type: string;
}

/**
 * Pokemon card template extending the base CardTemplate.
 * Includes game-relevant text from the card database.
 */
export interface PokemonCardTemplate extends CardTemplate {
  supertype: string;
  subtypes: string[];
  types: string[];
  hp?: number;
  evolveFrom?: string;
  attacks?: PokemonAttack[];
  abilities?: PokemonAbility[];
  weaknesses?: Array<{ type: string; value?: string }>;
  resistances?: Array<{ type: string; value?: string }>;
  retreatCost?: string[];
  rules?: string[];
}


// Lazy-loaded western card map
let westernCardMap: Map<string, WesternCard> | null = null;

/**
 * Ensure western card map is loaded (lazy initialization).
 */
function ensureWesternCardsLoaded(): void {
  if (westernCardMap) return;
  westernCardMap = new Map();
  for (const card of cardsData as WesternCard[]) {
    westernCardMap.set(card.id, card);
  }
}

/**
 * Convert tcgdex URL to high resolution.
 */
function toHighResTcgdex(url: string): string {
  return url.replace('/low.webp', '/high.webp');
}

/**
 * Convert pokemontcg.io URL to high resolution.
 */
function toHighRes(url: string): string {
  return url.replace(/\.png$/, '_hires.png');
}

/**
 * Get high-res image URL for a western card.
 */
function getWesternCardImageUrl(card: WesternCard): string {
  if (!card.images || card.images.length === 0) {
    return cardbackImg;
  }
  const url = card.images[0].url;
  if (url.includes('tcgdex.net')) {
    return toHighResTcgdex(url);
  }
  if (url.includes('pokemontcg.io')) {
    return toHighRes(url);
  }
  return url;
}

/**
 * Base Set card data (1-30).
 */
const BASE_SET_CARDS: Array<{ number: number; name: string }> = [
  { number: 1, name: 'Alakazam' },
  { number: 2, name: 'Blastoise' },
  { number: 3, name: 'Chansey' },
  { number: 4, name: 'Charizard' },
  { number: 5, name: 'Clefairy' },
  { number: 6, name: 'Gyarados' },
  { number: 7, name: 'Hitmonchan' },
  { number: 8, name: 'Machamp' },
  { number: 9, name: 'Magneton' },
  { number: 10, name: 'Mewtwo' },
  { number: 11, name: 'Nidoking' },
  { number: 12, name: 'Ninetales' },
  { number: 13, name: 'Poliwrath' },
  { number: 14, name: 'Raichu' },
  { number: 15, name: 'Venusaur' },
  { number: 16, name: 'Zapdos' },
  { number: 17, name: 'Beedrill' },
  { number: 18, name: 'Dragonair' },
  { number: 19, name: 'Dugtrio' },
  { number: 20, name: 'Electabuzz' },
  { number: 21, name: 'Electrode' },
  { number: 22, name: 'Pidgeotto' },
  { number: 23, name: 'Arcanine' },
  { number: 24, name: 'Charmeleon' },
  { number: 25, name: 'Dewgong' },
  { number: 26, name: 'Dratini' },
  { number: 27, name: "Farfetch'd" },
  { number: 28, name: 'Growlithe' },
  { number: 29, name: 'Haunter' },
  { number: 30, name: 'Ivysaur' },
];

/**
 * Compute display rotation for landscape card types (BREAK, LEGEND).
 * BREAK: detected by subtypes containing 'BREAK'.
 * LEGEND: detected by name containing 'LEGEND' (subtypes are just ['Basic']).
 */
const LANDSCAPE_SUBTYPES = new Set(['BREAK']);
function getDisplayRotation(name: string, subtypes?: string[]): number | undefined {
  if (subtypes?.some(s => LANDSCAPE_SUBTYPES.has(s))) return 90;
  if (name.includes('LEGEND')) return 90;
  return undefined;
}

/**
 * Extract game-relevant fields from a western card entry.
 */
function extractGameFields(card: WesternCard): Partial<PokemonCardTemplate> {
  const fields: Partial<PokemonCardTemplate> = {};
  if (card.hp) fields.hp = card.hp;
  if (card.evolveFrom) fields.evolveFrom = card.evolveFrom;
  if (card.attacks?.length) fields.attacks = card.attacks;
  if (card.abilities?.length) fields.abilities = card.abilities;
  if (card.weaknesses?.length) fields.weaknesses = card.weaknesses;
  if (card.resistances?.length) fields.resistances = card.resistances;
  if (card.retreatCost?.length) fields.retreatCost = card.retreatCost;
  if (card.rules?.length) fields.rules = card.rules;
  return fields;
}

/**
 * Create a Pokemon card template.
 * Pulls image URL and game-relevant text from the western card database.
 */
function createTemplate(setId: string, number: number, name: string): PokemonCardTemplate {
  ensureWesternCardsLoaded();
  const cardId = `${setId}-${number}`;
  const westernCard = westernCardMap!.get(cardId);
  const imageUrl = westernCard ? getWesternCardImageUrl(westernCard) : cardbackImg;
  const subtypes = westernCard?.subtypes || [];
  const displayRotation = getDisplayRotation(name, subtypes);

  return {
    id: cardId,
    name,
    imageUrl,
    ...(displayRotation !== undefined && { displayRotation }),
    supertype: westernCard?.supertype || 'Pokemon',
    subtypes,
    types: westernCard?.types || [],
    ...extractGameFields(westernCard!),
  };
}

/**
 * All Pokemon card templates indexed by ID for O(1) lookup.
 */
export const POKEMON_TEMPLATE_MAP: Map<string, PokemonCardTemplate> = new Map(
  BASE_SET_CARDS.map(({ number, name }) => {
    const template = createTemplate('base1', number, name);
    return [template.id, template];
  })
);

/**
 * Get a card template by ID.
 * Checks static map first, then falls back to western card database.
 */
export function getTemplate(id: string): PokemonCardTemplate | undefined {
  const staticTemplate = POKEMON_TEMPLATE_MAP.get(id);
  if (staticTemplate) return staticTemplate;

  ensureWesternCardsLoaded();
  const card = westernCardMap!.get(id);
  if (!card) return undefined;

  const name = card.names.en || Object.values(card.names)[0] || 'Unknown';
  const subtypes = card.subtypes || [];
  const displayRotation = getDisplayRotation(name, subtypes);

  return {
    id: card.id,
    name,
    imageUrl: getWesternCardImageUrl(card),
    ...(displayRotation !== undefined && { displayRotation }),
    supertype: card.supertype || 'Pokemon',
    subtypes,
    types: card.types || [],
    ...extractGameFields(card),
  };
}

/**
 * Get the card back image URL.
 */
export function getCardBack(): string {
  return cardbackImg;
}

/**
 * Result of parsing a PTCGO deck format string.
 */
export interface PTCGOParseResult {
  deckList: DeckList;
  warnings: string[];
}

/**
 * Parse a PTCGO format deck string into a DeckList.
 * Format: "* {qty} {cardName} {setName} {number}"
 * Example: "* 1 Squirtle 151 007"
 */
export function parsePTCGODeck(ptcgoText: string, deckName?: string): PTCGOParseResult {
  ensureWesternCardsLoaded();
  const output = parsePTCGO(ptcgoText, westernCardMap!.values());
  return {
    deckList: {
      id: `ptcgo-${Date.now()}`,
      name: deckName || 'Imported Deck',
      cards: output.entries.map(e => ({ templateId: e.cardId, count: e.quantity })),
    },
    warnings: output.errors.map(e => e.message),
  };
}
