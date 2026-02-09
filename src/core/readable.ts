import type {
  CardTemplate,
  CardInstance,
  GameState,
  Zone,
  Action,
  PlayerInfo,
  GameResult,
  Decision,
  PlayerIndex,
} from './types';
import type { Phase } from './types';
import {
  HIDDEN_CARD,
  READABLE_LOG_LIMIT,
  ORIENTATION_NAMES,
} from './types';

/**
 * Readable card: template fields (minus id/imageUrl) with a
 * disambiguated display name. Empty arrays/objects are omitted.
 * Only produced for cards visible to the viewing player.
 */
export type ReadableCard = {
  name: string;
  [key: string]: unknown;
};

/**
 * Readable zone: total card count plus only the cards
 * visible to the viewing player.
 */
export interface ReadableZone {
  count: number;
  cards: ReadableCard[];
}

/**
 * A readable action where cardInstanceIds have been replaced
 * with human-readable card names.
 */
export type ReadableAction = Record<string, unknown>;

export interface ReadableTurn {
  number: number;
  activePlayer: PlayerIndex;
  actions: ReadableAction[];
  ended: boolean;
}

export interface ReadableGameState {
  phase: Phase;
  turnNumber: number;
  activePlayer: 0 | 1;
  viewer: PlayerIndex;
  zones: Record<string, ReadableZone>;
  players: [PlayerInfo, PlayerInfo];
  currentTurn: ReadableTurn;
  pendingDecision: Decision | null;
  result: GameResult | null;
  log: string[];
}

/**
 * Convert a GameState to a ReadableGameState from a specific player's
 * perspective. Cards the player cannot see are omitted — only their
 * count is preserved. Template ids, imageUrls, timestamps, zone
 * config, and empty fields are all stripped. Actions use card names
 * instead of instanceIds.
 */
export function toReadableState<T extends CardTemplate>(
  state: GameState<T>,
  playerIndex: PlayerIndex,
): ReadableGameState {
  const readableZones: Record<string, ReadableZone> = {};

  for (const [zoneKey, zone] of Object.entries(state.zones)) {
    readableZones[zoneKey] = convertZone(zone, playerIndex);
  }

  // Build instanceId → card name lookup for action conversion (visibility-aware)
  const idToName = buildCardNameMap(state, playerIndex);

  const readable: ReadableGameState = {
    phase: state.phase,
    turnNumber: state.turnNumber,
    activePlayer: state.activePlayer,
    viewer: playerIndex,
    zones: readableZones,
    players: state.players.map(p => {
      const rp: Record<string, unknown> = { ...p };
      if (!p.hasConceded) delete rp.hasConceded;
      if (!p.hasDeclaredVictory) delete rp.hasDeclaredVictory;
      return rp;
    }) as unknown as [PlayerInfo, PlayerInfo],
    currentTurn: convertTurn(state.currentTurn, idToName),
    pendingDecision: state.pendingDecision,
    result: state.result,
    log: state.log.slice(-READABLE_LOG_LIMIT),
  };

  return readable;
}

/**
 * Build a map from instanceId → card display name for cards visible to the
 * specified player. Hidden cards are mapped to "[hidden card]" so actions
 * referencing them don't leak card identity.
 */
function buildCardNameMap<T extends CardTemplate>(
  state: GameState<T>,
  playerIndex: PlayerIndex
): Map<string, string> {
  const map = new Map<string, string>();

  const allCards = Object.values(state.zones).flatMap(z => z.cards);
  const visibleCards = allCards.filter(c => c.visibility[playerIndex]);
  const ambiguousNames = findAmbiguousNames(visibleCards);

  for (const card of allCards) {
    if (card.visibility[playerIndex]) {
      map.set(card.instanceId, computeDisplayName(card, ambiguousNames));
    } else {
      map.set(card.instanceId, HIDDEN_CARD.AI_NAME);
    }
  }

  return map;
}

/**
 * Convert a Turn to a ReadableTurn, replacing all instanceIds with card names.
 */
function convertTurn(
  turn: { number: number; activePlayer: PlayerIndex; actions: Action[]; ended: boolean },
  idToName: Map<string, string>
): ReadableTurn {
  return {
    number: turn.number,
    activePlayer: turn.activePlayer,
    actions: turn.actions.map(a => convertAction(a, idToName)),
    ended: turn.ended,
  };
}

/** Keys in action objects that hold card instance IDs. */
const INSTANCE_ID_KEYS = new Set(['cardInstanceId', 'targetInstanceId']);
const INSTANCE_ID_ARRAY_KEYS = new Set(['cardInstanceIds']);

/**
 * Convert an action, replacing instanceId fields with card names.
 */
function convertAction(action: Action, idToName: Map<string, string>): ReadableAction {
  const result: ReadableAction = {};

  for (const [key, value] of Object.entries(action)) {
    if (INSTANCE_ID_KEYS.has(key) && typeof value === 'string') {
      const newKey = key.replace('InstanceId', 'Name').replace('instanceId', 'Name');
      result[newKey] = idToName.get(value) ?? value;
    } else if (INSTANCE_ID_ARRAY_KEYS.has(key) && Array.isArray(value)) {
      const newKey = key.replace('InstanceIds', 'Names').replace('instanceIds', 'Names');
      result[newKey] = value.map(id => idToName.get(id) ?? id);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Build a name-disambiguation map for a list of cards.
 * Returns a Set of template names that need "(templateId)" disambiguation.
 */
function findAmbiguousNames<T extends CardTemplate>(cards: CardInstance<T>[]): Set<string> {
  const nameToTemplateIds = new Map<string, Set<string>>();

  for (const card of cards) {
    const name = card.template.name;
    const ids = nameToTemplateIds.get(name);
    if (ids) {
      ids.add(card.template.id);
    } else {
      nameToTemplateIds.set(name, new Set([card.template.id]));
    }
  }

  const ambiguous = new Set<string>();
  for (const [name, ids] of nameToTemplateIds) {
    if (ids.size > 1) {
      ambiguous.add(name);
    }
  }
  return ambiguous;
}

/**
 * Compute the display name for a card given the set of ambiguous names.
 */
function computeDisplayName<T extends CardTemplate>(
  card: CardInstance<T>,
  ambiguousNames: Set<string>
): string {
  if (ambiguousNames.has(card.template.name)) {
    return `${card.template.name} (${card.template.id})`;
  }
  return card.template.name;
}

/** Fields to strip from the template when building readable cards. */
const STRIP_TEMPLATE_KEYS = new Set(['id', 'imageUrl', 'name']);

function convertZone<T extends CardTemplate>(
  zone: Zone<T>,
  playerIndex: PlayerIndex
): ReadableZone {
  const visibleCards = zone.cards.filter(c => c.visibility[playerIndex]);
  const ambiguousNames = findAmbiguousNames(visibleCards);
  const readableCards: ReadableCard[] = [];

  for (const card of visibleCards) {
    const displayName = computeDisplayName(card, ambiguousNames);
    readableCards.push(convertCard(card, displayName));
  }

  return {
    count: zone.cards.length,
    cards: condenseCards(readableCards),
  };
}

/**
 * Condense identical readable cards into single entries with a count property.
 * Cards with count 1 omit the count field.
 */
function condenseCards(cards: ReadableCard[]): ReadableCard[] {
  const groups: { card: ReadableCard; key: string; count: number }[] = [];

  for (const card of cards) {
    const key = JSON.stringify(card);
    const existing = groups.find(g => g.key === key);
    if (existing) {
      existing.count++;
    } else {
      groups.push({ card, key, count: 1 });
    }
  }

  return groups.map(({ card, count }) =>
    count > 1 ? { ...card, count } : card
  );
}

function convertCard<T extends CardTemplate>(
  card: CardInstance<T>,
  name: string
): ReadableCard {
  const result: ReadableCard = { name };

  // Copy template fields, skipping stripped keys and empty values
  for (const [key, value] of Object.entries(card.template)) {
    if (STRIP_TEMPLATE_KEYS.has(key)) continue;
    if (isEmptyValue(value)) continue;
    result[key] = value;
  }

  // Only include counters if non-empty
  if (Object.keys(card.counters).length > 0) {
    result.counters = card.counters;
  }

  // Only include orientation if not default
  if (card.orientation && card.orientation !== ORIENTATION_NAMES.NORMAL) {
    result.orientation = card.orientation;
  }

  // Only include flags if non-empty
  if (card.flags.length > 0) {
    result.flags = card.flags;
  }

  return result;
}

/**
 * Returns true for values that should be omitted from output:
 * empty arrays, empty objects, null, undefined.
 */
function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === 'object' && Object.keys(value as object).length === 0) return true;
  return false;
}

/**
 * Format a deduplicated inventory of cards for AI consumption.
 * Groups cards by template name, formats each unique card once
 * (via optional plugin formatter or JSON fallback), and appends "x{count}".
 *
 * Used by search_zone tool and can be prepended to AI prompts as a decklist.
 */
export function formatCardInventory(
  templates: CardTemplate[],
  formatter?: (template: CardTemplate) => string,
): string {
  const seen = new Map<string, { template: CardTemplate; count: number }>();
  for (const t of templates) {
    const entry = seen.get(t.name);
    if (entry) {
      entry.count++;
    } else {
      seen.set(t.name, { template: t, count: 1 });
    }
  }

  const lines: string[] = [];
  for (const [name, { template, count }] of seen) {
    const qty = count > 1 ? ` x${count}` : '';
    if (formatter) {
      lines.push(`${formatter(template)}${qty}`);
    } else {
      const { imageUrl, imageUrlHiRes, ...fields } = template as unknown as Record<string, unknown>;
      lines.push(`${name}${qty} — ${JSON.stringify(fields)}`);
    }
  }
  return lines.join('\n');
}

/**
 * Normalize Unicode quote/apostrophe variants to ASCII apostrophe (U+0027).
 * Card databases often use typographic quotes (U+2019 RIGHT SINGLE QUOTATION
 * MARK, etc.) but AI models emit ASCII apostrophes in tool calls.
 */
function normalizeQuotes(s: string): string {
  return s.replace(/[\u2018\u2019\u201A\u201B\u2032\u0060\u00B4]/g, "'");
}

/**
 * Resolve a readable card name back to an instanceId within a zone.
 * Uses the same disambiguation logic as convertZone, so display names
 * produced by toReadableState() round-trip correctly.
 *
 * Returns the instanceId of the first card whose computed display name
 * matches the given cardName. Throws if no match is found.
 */
export function resolveCardName<T extends CardTemplate>(
  state: GameState<T>,
  cardName: string,
  zoneKey: string
): string {
  const zone = state.zones[zoneKey];
  if (!zone) {
    throw new Error(`Zone not found: ${zoneKey}`);
  }

  const ambiguousNames = findAmbiguousNames(zone.cards);
  const normalizedInput = normalizeQuotes(cardName);

  // Iterate from end (top of zone) first — after peeking from top, the
  // relevant cards are at the end of the array.  This ensures that when
  // duplicate names exist (e.g. multiple "Water Energy" in a deck), we
  // resolve to the peeked copy rather than a hidden one deeper in the deck.
  for (let i = zone.cards.length - 1; i >= 0; i--) {
    const card = zone.cards[i];
    const displayName = computeDisplayName(card, ambiguousNames);
    if (displayName === cardName || normalizeQuotes(displayName) === normalizedInput) {
      return card.instanceId;
    }
  }

  throw new Error(`Card "${cardName}" not found in zone "${zoneKey}"`);
}
