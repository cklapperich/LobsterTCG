import type {
  CardTemplate,
  CardInstance,
  GameState,
  Zone,
  PlayerInfo,
  Turn,
  GameResult,
  PlayerIndex,
} from './types';

/**
 * Readable card: template fields (minus id/imageUrl) flattened,
 * with a disambiguated display name. Only produced for cards
 * visible to the viewing player.
 */
export type ReadableCard<T extends CardTemplate = CardTemplate> = Omit<T, 'id' | 'imageUrl' | 'name'> & {
  name: string;
  orientation?: string;
  status: string[];
  counters: Record<string, number>;
  attachments: ReadableCard<T>[];
  evolutionStack?: ReadableCard<T>[];
};

/**
 * Readable zone: total card count plus only the cards
 * visible to the viewing player.
 */
export interface ReadableZone<T extends CardTemplate = CardTemplate> {
  count: number;
  cards: ReadableCard<T>[];
}

export interface ReadableGameState<T extends CardTemplate = CardTemplate> {
  turnNumber: number;
  activePlayer: 0 | 1;
  zones: Record<string, ReadableZone<T>>;
  players: [PlayerInfo, PlayerInfo];
  currentTurn: Turn;
  result: GameResult | null;
}

/**
 * Convert a GameState to a ReadableGameState from a specific player's
 * perspective. Cards the player cannot see are omitted — only their
 * count is preserved. Template ids, imageUrls, timestamps, and zone
 * config are all stripped.
 */
export function toReadableState<T extends CardTemplate>(
  state: GameState<T>,
  playerIndex: PlayerIndex
): ReadableGameState<T> {
  const readableZones: Record<string, ReadableZone<T>> = {};

  for (const [zoneKey, zone] of Object.entries(state.zones)) {
    readableZones[zoneKey] = convertZone(zone, playerIndex);
  }

  return {
    turnNumber: state.turnNumber,
    activePlayer: state.activePlayer,
    zones: readableZones,
    players: state.players,
    currentTurn: state.currentTurn,
    result: state.result,
  };
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

function convertZone<T extends CardTemplate>(
  zone: Zone<T>,
  playerIndex: PlayerIndex
): ReadableZone<T> {
  // Only disambiguate among visible cards
  const visibleCards = zone.cards.filter(c => c.visibility[playerIndex]);
  const ambiguousNames = findAmbiguousNames(visibleCards);
  const readableCards: ReadableCard<T>[] = [];

  for (const card of visibleCards) {
    const displayName = computeDisplayName(card, ambiguousNames);
    readableCards.push(convertCard(card, displayName, playerIndex));
  }

  return {
    count: zone.cards.length,
    cards: readableCards,
  };
}

function convertCard<T extends CardTemplate>(
  card: CardInstance<T>,
  name: string,
  playerIndex: PlayerIndex
): ReadableCard<T> {
  const attachments = convertCardList(card.attachments, playerIndex);
  const evolutionStack = card.evolutionStack
    ? convertCardList(card.evolutionStack, playerIndex)
    : undefined;

  // Spread template but strip id, imageUrl — display name is the only identifier
  const { id: _id, imageUrl: _img, ...templateFields } = card.template as T & { imageUrl?: string };

  return {
    ...templateFields,
    name,  // display name overwrites template.name
    orientation: card.orientation,
    status: card.status,
    counters: card.counters,
    attachments,
    evolutionStack,
  } as ReadableCard<T>;
}

function convertCardList<T extends CardTemplate>(
  cards: CardInstance<T>[],
  playerIndex: PlayerIndex
): ReadableCard<T>[] {
  const visibleCards = cards.filter(c => c.visibility[playerIndex]);
  const ambiguousNames = findAmbiguousNames(visibleCards);
  const result: ReadableCard<T>[] = [];

  for (const card of visibleCards) {
    const displayName = computeDisplayName(card, ambiguousNames);
    result.push(convertCard(card, displayName, playerIndex));
  }

  return result;
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

  for (const card of zone.cards) {
    const displayName = computeDisplayName(card, ambiguousNames);
    if (displayName === cardName) {
      return card.instanceId;
    }
  }

  throw new Error(`Card "${cardName}" not found in zone "${zoneKey}"`);
}
