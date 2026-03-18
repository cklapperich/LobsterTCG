import type { PocketCardTemplate, EnergyType, PocketSubtype, PocketSupertype, PocketAttack, PocketAbility } from './types';
import type { TCGdexCard } from './pocket-shared/types';
import cardsData from './cards-pocket.json';

// --- Conversion helpers ---

function tcgdexToEnergyType(t: string): EnergyType {
  return t.toLowerCase() as EnergyType;
}

function tcgdexToStage(stage?: string): PocketSubtype[] {
  if (!stage) return ['Basic'];
  switch (stage) {
    case 'Stage1': return ['Stage 1'];
    case 'Stage2': return ['Stage 2'];
    default: return [stage as PocketSubtype];
  }
}

function tcgdexToSupertype(category: string): PocketSupertype {
  if (category === 'Trainer') return 'Trainer';
  return 'Pokemon';
}

function buildSubtypes(card: TCGdexCard): PocketSubtype[] {
  const subtypes: PocketSubtype[] = [];

  if (card.category === 'Pokemon') {
    subtypes.push(...tcgdexToStage(card.stage));
    if (card.suffix === 'EX') subtypes.push('ex');
  } else if (card.category === 'Trainer') {
    if (card.trainerType === 'Supporter') subtypes.push('Supporter');
    else if (card.trainerType === 'Item') subtypes.push('Item');
  }

  return subtypes;
}

function convertAttacks(attacks?: TCGdexCard['attacks']): PocketAttack[] | undefined {
  if (!attacks?.length) return undefined;
  return attacks.map(a => ({
    name: a.name,
    cost: (a.cost ?? []).map(tcgdexToEnergyType),
    damage: a.damage ?? '',
    effect: a.effect,
  }));
}

function convertAbilities(abilities?: TCGdexCard['abilities']): PocketAbility[] | undefined {
  if (!abilities?.length) return undefined;
  return abilities.map(a => ({
    name: a.name,
    type: a.type,
    effect: a.effect,
  }));
}

function getImageUrl(card: TCGdexCard): string {
  const setId = card.set.id;
  const localId = card.localId;
  return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/${setId}/${setId}_${localId}_EN.png`;
}

function convertCard(card: TCGdexCard): PocketCardTemplate {
  const weakness = card.weaknesses?.[0];
  return {
    id: card.id,
    name: card.name,
    imageUrl: getImageUrl(card),
    supertype: tcgdexToSupertype(card.category),
    subtypes: buildSubtypes(card),
    types: card.types?.map(tcgdexToEnergyType) ?? [],
    hp: card.hp,
    evolveFrom: card.evolveFrom,
    attacks: convertAttacks(card.attacks),
    abilities: convertAbilities(card.abilities),
    weakness: weakness ? { type: tcgdexToEnergyType(weakness.type), value: parseInt(weakness.value, 10) || 20 } : undefined,
    retreatCost: card.retreat,
    effect: card.effect,
    trainerType: card.trainerType,
  };
}

// --- Lazy-loaded card map ---

let pocketCardMap: Map<string, TCGdexCard> | null = null;

function ensureLoaded(): void {
  if (pocketCardMap) return;
  pocketCardMap = new Map();
  for (const card of cardsData as TCGdexCard[]) {
    pocketCardMap.set(card.id, card);
  }
}

/**
 * All card templates indexed by ID for O(1) lookup.
 */
export const POCKET_TEMPLATE_MAP: Map<string, PocketCardTemplate> = new Map();


/**
 * Look up a card template by ID.
 * If the card isn't in the database (e.g. set not yet on TCGdex),
 * builds a minimal stub template so the game can still load.
 */
export function getTemplate(id: string): PocketCardTemplate | undefined {
  // Check cache first
  const cached = POCKET_TEMPLATE_MAP.get(id);
  if (cached) return cached;

  // Try to convert on demand
  ensureLoaded();
  const raw = pocketCardMap!.get(id);

  let template: PocketCardTemplate;
  if (raw) {
    template = convertCard(raw);
  } else {
    // Build a minimal stub from the ID (e.g. "A4b-247" → set "A4b", localId "247")
    const dashIdx = id.lastIndexOf('-');
    if (dashIdx < 0) return undefined;
    const setId = id.slice(0, dashIdx);
    const localId = id.slice(dashIdx + 1);
    template = {
      id,
      name: id, // best we can do without data
      imageUrl: `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/${setId}/${setId}_${localId}_EN.png`,
      supertype: 'Pokemon',
      subtypes: ['Basic'],
      types: [],
    };
  }

  POCKET_TEMPLATE_MAP.set(id, template);
  return template;
}

/**
 * Get all pocket cards (raw TCGdex data).
 */
export function getAllPocketCards(): TCGdexCard[] {
  return cardsData as TCGdexCard[];
}

/**
 * Get a single pocket card by ID (raw TCGdex data).
 */
export function getPocketCard(id: string): TCGdexCard | undefined {
  ensureLoaded();
  return pocketCardMap!.get(id);
}

/**
 * Register a minimal stub card for IDs not yet in the TCGdex data.
 * This lets decks reference cards from sets the API hasn't indexed yet —
 * the image URL and basic metadata will still work.
 */
export function registerStubCard(stub: TCGdexCard): void {
  ensureLoaded();
  pocketCardMap!.set(stub.id, stub);
}

