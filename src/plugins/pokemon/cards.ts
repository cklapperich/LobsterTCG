import type { CardTemplate } from '../../core';
import type { DeckList } from '../../core/engine';
import cardsData from './cards-western.json';
import setCodes from './set-codes.json';
import cardbackImg from './cardback.png';

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
  weaknesses?: Array<{ type: string; value: string }>;
  resistances?: Array<{ type: string; value: string }>;
  retreatCost?: string[];
  rules?: string[];
}

/**
 * Card image metadata from western card database.
 */
interface CardImage {
  url: string;
}

/**
 * Western card data structure from cards-western.json.
 */
interface WesternCard {
  id: string;
  names: Record<string, string>;
  set: string;
  number: string;
  ptcgoCode?: string;
  setId?: string;
  seriesId?: string;
  images?: CardImage[];
  supertype?: string;
  subtypes?: string[];
  types?: string[];
  hp?: number;
  evolveFrom?: string;
  attacks?: PokemonAttack[];
  abilities?: PokemonAbility[];
  weaknesses?: Array<{ type: string; value: string }>;
  resistances?: Array<{ type: string; value: string }>;
  retreatCost?: string[];
  rules?: string[];
}

// Lazy-loaded western card maps
let westernCardMap: Map<string, WesternCard> | null = null;
let cardsBySetNumber: Map<string, WesternCard> | null = null;
let cardsByPtcgoNumber: Map<string, WesternCard> | null = null;

/**
 * Ensure western card maps are loaded (lazy initialization).
 */
function ensureWesternCardsLoaded(): void {
  if (westernCardMap) return;

  westernCardMap = new Map();
  cardsBySetNumber = new Map();
  cardsByPtcgoNumber = new Map();

  for (const card of cardsData as WesternCard[]) {
    westernCardMap.set(card.id, card);

    // Build lookup key: "setName|number" (normalized)
    const setName = card.set.toLowerCase();
    const number = card.number.toLowerCase();
    const key = `${setName}|${number}`;
    cardsBySetNumber.set(key, card);

    // Build lookup by ptcgoCode|number for PTCGO format support
    if (card.ptcgoCode) {
      const ptcgoKey = `${card.ptcgoCode.toLowerCase()}|${number}`;
      cardsByPtcgoNumber.set(ptcgoKey, card);
    }
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
 * Look up a card by set name and number.
 */
function findCardBySetNumber(setName: string, number: string): WesternCard | undefined {
  ensureWesternCardsLoaded();
  const key = `${setName.toLowerCase()}|${number.toLowerCase()}`;
  return cardsBySetNumber!.get(key);
}

/**
 * Look up a card by PTCGO code and number.
 */
function findCardByPtcgoNumber(ptcgoCode: string, number: string): WesternCard | undefined {
  ensureWesternCardsLoaded();
  const key = `${ptcgoCode.toLowerCase()}|${number.toLowerCase()}`;
  return cardsByPtcgoNumber!.get(key);
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

  return {
    id: cardId,
    name,
    imageUrl,
    supertype: westernCard?.supertype || 'Pokemon',
    subtypes: westernCard?.subtypes || [],
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

  return {
    id: card.id,
    name: card.names.en || Object.values(card.names)[0] || 'Unknown',
    imageUrl: getWesternCardImageUrl(card),
    supertype: card.supertype || 'Pokemon',
    subtypes: card.subtypes || [],
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

  const warnings: string[] = [];
  const cards: Array<{ templateId: string; count: number }> = [];
  const cardCounts = new Map<string, number>();

  const lines = ptcgoText.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('*')) continue;

    // Parse: * {qty} {cardName} {setName} {number}
    // Card name can have multiple words, set name can have multiple words
    // Number is always at the end
    const match = trimmed.match(/^\*\s+(\d+)\s+(.+)\s+(\S+)$/);
    if (!match) {
      warnings.push(`Could not parse line: ${trimmed}`);
      continue;
    }

    const [, qtyStr, rest, numberStr] = match;
    const qty = parseInt(qtyStr, 10);

    // Split rest into card name and set name
    // The set name is everything after the card name, but we need to find the boundary
    // Strategy: try progressively shorter card names until we find a matching set
    const restParts = rest.trim().split(/\s+/);

    let card: WesternCard | undefined;

    // Try different splits: first word is card name, rest is set, then first two words, etc.
    for (let i = restParts.length - 1; i >= 1; i--) {
      const potentialSetParts = restParts.slice(i);
      const potentialSetName = potentialSetParts.join(' ');

      // Try direct lookup with set name
      card = findCardBySetNumber(potentialSetName, numberStr);
      if (card) break;

      // Try direct lookup with PTCGO code (e.g., "TEU", "SK", "SUM")
      card = findCardByPtcgoNumber(potentialSetName, numberStr);
      if (card) break;

      // Try looking up set code from set-codes.json
      const setCode = (setCodes.setToCode as Record<string, string>)[potentialSetName];
      if (setCode) {
        const fullSetName = (setCodes.codeToSet as Record<string, string>)[setCode];
        if (fullSetName) {
          card = findCardBySetNumber(fullSetName, numberStr);
          if (card) break;
        }
      }
    }

    if (!card) {
      warnings.push(`Card not found: ${rest} ${numberStr}`);
      continue;
    }

    // Accumulate counts for same card
    const existingCount = cardCounts.get(card.id) || 0;
    cardCounts.set(card.id, existingCount + qty);
  }

  // Convert to card array
  for (const [templateId, count] of cardCounts) {
    cards.push({ templateId, count });
  }

  return {
    deckList: {
      id: `ptcgo-${Date.now()}`,
      name: deckName || 'Imported Deck',
      cards,
    },
    warnings,
  };
}
