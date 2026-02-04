import type {
  CardTemplate,
  CardInstance,
  GameState,
  Zone,
  ZoneConfig,
  PlayerInfo,
  Turn,
  GameConfig,
  GameResult,
  Visibility,
} from './types';

// Readable card: instanceId replaced with human-readable name
export interface ReadableCard<T extends CardTemplate = CardTemplate> {
  name: string;  // human-readable: "A♥", "Pikachu", "Pikachu_1"
  template: T;
  visibility: Visibility;
  orientation?: string;
  status: string[];
  counters: Record<string, number>;
  attachments: ReadableCard<T>[];
  evolutionStack?: ReadableCard<T>[];
}

export interface ReadableZone<T extends CardTemplate = CardTemplate> {
  config: ZoneConfig;
  owner: 0 | 1;
  cards: ReadableCard<T>[];
}

export interface ReadableGameState<T extends CardTemplate = CardTemplate> {
  id: string;
  config: GameConfig;
  turnNumber: number;
  activePlayer: 0 | 1;
  zones: Record<string, ReadableZone<T>>;
  players: [PlayerInfo, PlayerInfo];
  currentTurn: Turn;
  result: GameResult | null;
  startedAt: number;
  lastActionAt: number;
}

/**
 * Convert a GameState to a ReadableGameState where card instanceIds
 * are replaced with human-readable template names.
 *
 * Duplicates within the same zone get suffixes: "Pikachu", "Pikachu_1", "Pikachu_2"
 */
export function toReadableState<T extends CardTemplate>(
  state: GameState<T>
): ReadableGameState<T> {
  const readableZones: Record<string, ReadableZone<T>> = {};

  for (const [zoneKey, zone] of Object.entries(state.zones)) {
    readableZones[zoneKey] = convertZone(zone);
  }

  return {
    id: state.id,
    config: state.config,
    turnNumber: state.turnNumber,
    activePlayer: state.activePlayer,
    zones: readableZones,
    players: state.players,
    currentTurn: state.currentTurn,
    result: state.result,
    startedAt: state.startedAt,
    lastActionAt: state.lastActionAt,
  };
}

function convertZone<T extends CardTemplate>(zone: Zone<T>): ReadableZone<T> {
  // Track name occurrences to handle duplicates
  const nameCount = new Map<string, number>();
  const readableCards: ReadableCard<T>[] = [];

  for (const card of zone.cards) {
    const baseName = card.template.name;
    const count = nameCount.get(baseName) ?? 0;
    nameCount.set(baseName, count + 1);

    // First occurrence gets base name, subsequent get _1, _2, etc.
    const displayName = count === 0 ? baseName : `${baseName}_${count}`;

    readableCards.push(convertCard(card, displayName));
  }

  return {
    config: zone.config,
    owner: zone.owner,
    cards: readableCards,
  };
}

function convertCard<T extends CardTemplate>(
  card: CardInstance<T>,
  name: string
): ReadableCard<T> {
  // For attachments and evolution stacks, we create separate name counters
  const attachments = convertCardList(card.attachments);
  const evolutionStack = card.evolutionStack
    ? convertCardList(card.evolutionStack)
    : undefined;

  return {
    name,
    template: card.template,
    visibility: card.visibility,
    orientation: card.orientation,
    status: card.status,
    counters: card.counters,
    attachments,
    evolutionStack,
  };
}

function convertCardList<T extends CardTemplate>(
  cards: CardInstance<T>[]
): ReadableCard<T>[] {
  const nameCount = new Map<string, number>();
  const result: ReadableCard<T>[] = [];

  for (const card of cards) {
    const baseName = card.template.name;
    const count = nameCount.get(baseName) ?? 0;
    nameCount.set(baseName, count + 1);

    const displayName = count === 0 ? baseName : `${baseName}_${count}`;
    result.push(convertCard(card, displayName));
  }

  return result;
}
