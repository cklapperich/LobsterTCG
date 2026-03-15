/**
 * deckbuilder.ts — Pokemon TCG deckbuilder API.
 *
 * Provides card browsing, filtering, search, deck validation,
 * and PTCGO export for a future deckbuilder UI.
 */
import type {
  WesternCard,
  Supertype,
  Subtype,
  EnergyType,
  RegulationMark,
  LegalityFormat,
  LegalityStatus,
} from './pokemon-shared/types';
import { getAllWesternCards, getWesternCard } from './cards';

// ── Types ──

/** Lightweight card summary for grid display. */
export interface DeckbuilderCard {
  id: string;
  name: string;
  imageUrl: string;
  supertype: Supertype;
  subtypes: Subtype[];
  types: EnergyType[];
  hp: number | null;
  retreatCost: number;
  rarity: string | null;
  set: string;
  number: string;
  hasAbility: boolean;
  legalities: Partial<Record<LegalityFormat, LegalityStatus>>;
  regulationMark: RegulationMark | null;
}

/** Describes a filter the UI can render. */
export interface FilterDescriptor {
  id: string;
  label: string;
  type: 'select' | 'multiselect' | 'range' | 'boolean';
  options?: string[];
  range?: { min: number; max: number; step: number };
}

/** A single filter value from the UI. */
export type FilterValue =
  | string                    // select
  | string[]                  // multiselect
  | { min: number; max: number } // range
  | boolean;                  // boolean

/** Map of filter ID → value. */
export type ActiveFilters = Record<string, FilterValue>;

/** Sort option descriptor. */
export interface SortOption {
  id: string;
  label: string;
}

/** Deck validation error. */
export interface DeckValidationError {
  type: 'error' | 'warning';
  message: string;
}

/** Deck validation result. */
export interface DeckValidationResult {
  valid: boolean;
  errors: DeckValidationError[];
}

/** Query parameters for card browsing. */
export interface CardQuery {
  filters?: ActiveFilters;
  search?: string;
  sort?: string;
  offset?: number;
  limit?: number;
}

/** Query result. */
export interface CardQueryResult {
  cards: DeckbuilderCard[];
  total: number;
}

/** Display hints for the UI. */
export interface DeckbuilderDisplayHints {
  groupBy: string;
  groupOrder: string[];
  defaultSort: string;
  thumbnailFields: string[];
}

/** Deck entry for validation/export. */
export interface DeckEntry {
  cardId: string;
  count: number;
}

// ── Caches ──

let deckbuilderCardsCache: DeckbuilderCard[] | null = null;
let setListCache: string[] | null = null;

// ── Helpers ──

function getImageUrl(card: WesternCard): string {
  if (!card.images || card.images.length === 0) return '';
  const url = card.images[0].url;
  if (url.includes('tcgdex.net')) return url.replace('/low.webp', '/high.webp');
  if (url.includes('pokemontcg.io')) return url.replace(/\.png$/, '_hires.png');
  return url;
}

function toDeckbuilderCard(card: WesternCard): DeckbuilderCard {
  return {
    id: card.id,
    name: card.names.en || Object.values(card.names)[0] || 'Unknown',
    imageUrl: getImageUrl(card),
    supertype: card.supertype || 'Pokemon',
    subtypes: card.subtypes || [],
    types: card.types || [],
    hp: card.hp ?? null,
    retreatCost: card.retreatCost?.length ?? 0,
    rarity: card.rarity ?? null,
    set: card.set,
    number: card.number,
    hasAbility: (card.abilities?.length ?? 0) > 0,
    legalities: card.legalities ?? {},
    regulationMark: card.regulationMark ?? null,
  };
}

function buildCache(): DeckbuilderCard[] {
  if (deckbuilderCardsCache) return deckbuilderCardsCache;
  deckbuilderCardsCache = getAllWesternCards().map(toDeckbuilderCard);
  return deckbuilderCardsCache;
}

function buildSetList(): string[] {
  if (setListCache) return setListCache;
  const cards = getAllWesternCards();
  const setDates = new Map<string, string>();
  for (const card of cards) {
    if (!setDates.has(card.set)) {
      setDates.set(card.set, card.releaseDate ?? '9999-99-99');
    }
  }
  setListCache = Array.from(setDates.entries())
    .sort((a, b) => b[1].localeCompare(a[1])) // newest first
    .map(([name]) => name);
  return setListCache;
}

// ── Core Functions ──

/** Returns all cards as DeckbuilderCard[]. UI should virtualize. */
export function getAllCards(): DeckbuilderCard[] {
  return buildCache();
}

/** Main browse entry point with filtering, search, and sorting. */
export function queryCards(query: CardQuery = {}): CardQueryResult {
  let cards = buildCache();

  // Apply filters
  if (query.filters) {
    cards = applyFilters(cards, query.filters);
  }

  // Apply search
  if (query.search && query.search.trim()) {
    const terms = query.search.toLowerCase().trim().split(/\s+/);
    cards = cards.filter(card => matchesSearch(card, terms));
  }

  // Apply sort
  const sortId = query.sort ?? 'name';
  const compareFn = getSortCompareFn(sortId);
  if (compareFn) {
    cards = [...cards].sort(compareFn);
  }

  const total = cards.length;

  // Apply pagination
  if (query.offset !== undefined || query.limit !== undefined) {
    const start = query.offset ?? 0;
    const end = query.limit !== undefined ? start + query.limit : undefined;
    cards = cards.slice(start, end);
  }

  return { cards, total };
}

/** Returns filter metadata with pre-computed options from data. */
export function getFilterDescriptors(): FilterDescriptor[] {
  const cards = getAllWesternCards();

  const subtypes = new Set<string>();
  const types = new Set<string>();
  const rarities = new Set<string>();
  const regMarks = new Set<string>();
  let minHp = Infinity, maxHp = -Infinity;
  let maxRetreat = 0;

  for (const card of cards) {
    card.subtypes?.forEach(s => subtypes.add(s));
    card.types?.forEach(t => types.add(t));
    if (card.rarity) rarities.add(card.rarity);
    if (card.regulationMark) regMarks.add(card.regulationMark);
    if (card.hp !== undefined) {
      if (card.hp < minHp) minHp = card.hp;
      if (card.hp > maxHp) maxHp = card.hp;
    }
    const rc = card.retreatCost?.length ?? 0;
    if (rc > maxRetreat) maxRetreat = rc;
  }

  return [
    { id: 'supertype', label: 'Card Type', type: 'select', options: ['Pokemon', 'Trainer', 'Energy'] },
    { id: 'subtypes', label: 'Subtypes', type: 'multiselect', options: Array.from(subtypes).sort() },
    { id: 'types', label: 'Energy Type', type: 'multiselect', options: Array.from(types).sort() },
    { id: 'hp', label: 'HP', type: 'range', range: { min: minHp === Infinity ? 0 : minHp, max: maxHp === -Infinity ? 0 : maxHp, step: 10 } },
    { id: 'retreatCost', label: 'Retreat Cost', type: 'range', range: { min: 0, max: maxRetreat, step: 1 } },
    { id: 'rarity', label: 'Rarity', type: 'multiselect', options: Array.from(rarities).sort() },
    { id: 'set', label: 'Set', type: 'select', options: buildSetList() },
    { id: 'hasAbility', label: 'Has Ability', type: 'boolean' },
    { id: 'legality', label: 'Format Legality', type: 'select', options: ['standard', 'expanded', 'unlimited'] },
    { id: 'regulationMark', label: 'Regulation Mark', type: 'multiselect', options: Array.from(regMarks).sort() },
  ];
}

/** Returns available sort options. */
export function getSortOptions(): SortOption[] {
  return [
    { id: 'name', label: 'Name (A-Z)' },
    { id: 'name-desc', label: 'Name (Z-A)' },
    { id: 'hp', label: 'HP (High to Low)' },
    { id: 'hp-asc', label: 'HP (Low to High)' },
    { id: 'retreat', label: 'Retreat Cost' },
    { id: 'set-number', label: 'Set / Number' },
    { id: 'rarity', label: 'Rarity' },
    { id: 'supertype', label: 'Card Type' },
  ];
}

/** Declares which fields are searchable. */
export function getSearchableFields(): string[] {
  return ['name', 'attackNames', 'attackEffects', 'abilityNames', 'abilityText', 'rules'];
}

/** Display hints for the UI. */
export function getDisplayHints(): DeckbuilderDisplayHints {
  return {
    groupBy: 'supertype',
    groupOrder: ['Pokemon', 'Trainer', 'Energy'],
    defaultSort: 'name',
    thumbnailFields: ['name', 'hp', 'supertype', 'types'],
  };
}

// ── Deck Validation ──

const BASIC_ENERGY_NAMES = new Set([
  'Basic Grass Energy', 'Basic Fire Energy', 'Basic Water Energy',
  'Basic Lightning Energy', 'Basic Psychic Energy', 'Basic Fighting Energy',
  'Basic Darkness Energy', 'Basic Metal Energy', 'Basic Fairy Energy',
  // Short forms commonly used
  'Grass Energy', 'Fire Energy', 'Water Energy', 'Lightning Energy',
  'Psychic Energy', 'Fighting Energy', 'Darkness Energy', 'Metal Energy',
  'Fairy Energy',
]);

function isBasicEnergy(card: WesternCard): boolean {
  if (card.supertype !== 'Energy') return false;
  if (card.subtypes?.includes('Special' as any)) return false;
  const name = card.names.en || Object.values(card.names)[0] || '';
  return BASIC_ENERGY_NAMES.has(name);
}

/**
 * Validate a deck according to Pokemon TCG rules.
 * - Exactly 60 cards
 * - Max 4 copies of same-name card (basic energy exempt)
 * - Must have >= 1 Basic Pokemon
 * - Optional format legality check
 */
export function validateDeck(deck: DeckEntry[], format?: LegalityFormat): DeckValidationResult {
  const errors: DeckValidationError[] = [];

  // Total count
  const totalCards = deck.reduce((sum, e) => sum + e.count, 0);
  if (totalCards !== 60) {
    errors.push({ type: 'error', message: `Deck has ${totalCards} cards (must be exactly 60)` });
  }

  // Name counts + basic Pokemon check
  const nameCounts = new Map<string, number>();
  let hasBasicPokemon = false;
  let hasEnergy = false;
  let hasTrainer = false;

  for (const entry of deck) {
    const card = getWesternCard(entry.cardId);
    if (!card) {
      errors.push({ type: 'error', message: `Unknown card ID: ${entry.cardId}` });
      continue;
    }

    const name = card.names.en || Object.values(card.names)[0] || card.id;

    // Track supertypes
    if (card.supertype === 'Pokemon' && card.subtypes?.includes('Basic' as any)) {
      hasBasicPokemon = true;
    }
    if (card.supertype === 'Energy') hasEnergy = true;
    if (card.supertype === 'Trainer') hasTrainer = true;

    // Skip basic energy for the 4-copy rule
    if (isBasicEnergy(card)) continue;

    const current = nameCounts.get(name) ?? 0;
    nameCounts.set(name, current + entry.count);
  }

  // Check 4-copy rule
  for (const [name, count] of nameCounts) {
    if (count > 4) {
      errors.push({ type: 'error', message: `"${name}" has ${count} copies (max 4)` });
    }
  }

  // Must have a Basic Pokemon
  if (!hasBasicPokemon) {
    errors.push({ type: 'error', message: 'Deck must contain at least 1 Basic Pokemon' });
  }

  // Warnings
  if (!hasEnergy) {
    errors.push({ type: 'warning', message: 'Deck contains no Energy cards' });
  }
  if (!hasTrainer) {
    errors.push({ type: 'warning', message: 'Deck contains no Trainer cards' });
  }

  // Format legality
  if (format) {
    for (const entry of deck) {
      const card = getWesternCard(entry.cardId);
      if (!card) continue;
      const legality = card.legalities?.[format];
      if (legality === 'Banned') {
        const name = card.names.en || Object.values(card.names)[0] || card.id;
        errors.push({ type: 'error', message: `"${name}" is banned in ${format}` });
      } else if (legality === 'Not Legal') {
        const name = card.names.en || Object.values(card.names)[0] || card.id;
        errors.push({ type: 'error', message: `"${name}" is not legal in ${format}` });
      }
    }
  }

  const hasErrors = errors.some(e => e.type === 'error');
  return { valid: !hasErrors, errors };
}

// ── PTCGO Export ──

/**
 * Export a deck to PTCGO format string.
 * Inverse of parsePTCGODeck().
 */
export function exportToPTCGO(deck: DeckEntry[]): string {
  const sections: { header: string; lines: string[] }[] = [
    { header: 'Pokémon', lines: [] },
    { header: 'Trainer', lines: [] },
    { header: 'Energy', lines: [] },
  ];

  for (const entry of deck) {
    const card = getWesternCard(entry.cardId);
    if (!card) continue;

    const name = card.names.en || Object.values(card.names)[0] || 'Unknown';
    const setCode = card.ptcgoCode || card.set;
    const line = `* ${entry.count} ${name} ${setCode} ${card.number}`;

    const supertype = card.supertype ?? 'Pokemon';
    if (supertype === 'Pokemon') sections[0].lines.push(line);
    else if (supertype === 'Trainer') sections[1].lines.push(line);
    else sections[2].lines.push(line);
  }

  const output: string[] = [];
  for (const section of sections) {
    if (section.lines.length === 0) continue;
    if (output.length > 0) output.push('');
    output.push(`##${section.header}`);
    output.push('');
    output.push(...section.lines);
  }

  return output.join('\n') + '\n';
}

// ── Filter Implementation ──

function applyFilters(cards: DeckbuilderCard[], filters: ActiveFilters): DeckbuilderCard[] {
  return cards.filter(card => {
    for (const [filterId, value] of Object.entries(filters)) {
      if (value === undefined || value === null) continue;

      switch (filterId) {
        case 'supertype':
          if (typeof value === 'string' && card.supertype !== value) return false;
          break;

        case 'subtypes':
          if (Array.isArray(value) && value.length > 0) {
            if (!value.some(v => card.subtypes.includes(v as Subtype))) return false;
          }
          break;

        case 'types':
          if (Array.isArray(value) && value.length > 0) {
            if (!value.some(v => card.types.includes(v as EnergyType))) return false;
          }
          break;

        case 'hp':
          if (typeof value === 'object' && 'min' in value && 'max' in value) {
            if (card.hp === null) return false;
            if (card.hp < value.min || card.hp > value.max) return false;
          }
          break;

        case 'retreatCost':
          if (typeof value === 'object' && 'min' in value && 'max' in value) {
            if (card.retreatCost < value.min || card.retreatCost > value.max) return false;
          }
          break;

        case 'rarity':
          if (Array.isArray(value) && value.length > 0) {
            if (!card.rarity || !value.includes(card.rarity)) return false;
          }
          break;

        case 'set':
          if (typeof value === 'string' && card.set !== value) return false;
          break;

        case 'hasAbility':
          if (typeof value === 'boolean' && card.hasAbility !== value) return false;
          break;

        case 'legality':
          if (typeof value === 'string') {
            const format = value as LegalityFormat;
            if (card.legalities[format] !== 'Legal') return false;
          }
          break;

        case 'regulationMark':
          if (Array.isArray(value) && value.length > 0) {
            if (!card.regulationMark || !value.includes(card.regulationMark)) return false;
          }
          break;
      }
    }
    return true;
  });
}

// ── Search Implementation ──

function matchesSearch(card: DeckbuilderCard, terms: string[]): boolean {
  // Fast path: check name first (available on DeckbuilderCard)
  const nameLower = card.name.toLowerCase();
  if (terms.every(t => nameLower.includes(t))) return true;

  // Slow path: look up full WesternCard for attack/ability/rules text
  const full = getWesternCard(card.id);
  if (!full) return false;

  const searchableText = buildSearchText(full);
  return terms.every(t => searchableText.includes(t));
}

function buildSearchText(card: WesternCard): string {
  const parts: string[] = [];
  const name = card.names.en || Object.values(card.names)[0] || '';
  parts.push(name);

  if (card.attacks) {
    for (const atk of card.attacks) {
      parts.push(atk.name);
      if (atk.effect) parts.push(atk.effect);
    }
  }
  if (card.abilities) {
    for (const ab of card.abilities) {
      parts.push(ab.name);
      parts.push(ab.effect);
    }
  }
  if (card.rules) {
    parts.push(...card.rules);
  }

  return parts.join(' ').toLowerCase();
}

// ── Sort Implementation ──

const SUPERTYPE_ORDER: Record<string, number> = { Pokemon: 0, Trainer: 1, Energy: 2 };

function getSortCompareFn(sortId: string): ((a: DeckbuilderCard, b: DeckbuilderCard) => number) | null {
  switch (sortId) {
    case 'name':
      return (a, b) => a.name.localeCompare(b.name);
    case 'name-desc':
      return (a, b) => b.name.localeCompare(a.name);
    case 'hp':
      return (a, b) => (b.hp ?? 0) - (a.hp ?? 0);
    case 'hp-asc':
      return (a, b) => (a.hp ?? 0) - (b.hp ?? 0);
    case 'retreat':
      return (a, b) => a.retreatCost - b.retreatCost;
    case 'set-number':
      return (a, b) => {
        const setCmp = a.set.localeCompare(b.set);
        if (setCmp !== 0) return setCmp;
        return parseInt(a.number, 10) - parseInt(b.number, 10);
      };
    case 'rarity':
      return (a, b) => (a.rarity ?? '').localeCompare(b.rarity ?? '');
    case 'supertype':
      return (a, b) => (SUPERTYPE_ORDER[a.supertype] ?? 3) - (SUPERTYPE_ORDER[b.supertype] ?? 3);
    default:
      return null;
  }
}
