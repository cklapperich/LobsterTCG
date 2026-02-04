import type {
  CardTemplate,
  CardInstance,
  Visibility,
  PlayerIndex,
  Zone,
  ZoneConfig,
  Action,
  DrawAction,
  MoveCardAction,
  PlayCardAction,
  AttachCardAction,
  PlaceOnZoneAction,
  ShuffleAction,
  FlipCardAction,
  SetOrientationAction,
  AddStatusAction,
  RemoveStatusAction,
  AddCounterAction,
  RemoveCounterAction,
  SetCounterAction,
  CoinFlipAction,
  DiceRollAction,
  EndTurnAction,
  ConcedeAction,
  DeclareVictoryAction,
  RevealAction,
  PeekAction,
  PlayerInfo,
  GameConfig,
  GameState,
  Turn,
} from './types';
import { VISIBILITY } from './types';

// ============================================================================
// Factory Functions
// ============================================================================

let instanceIdCounter = 0;

export function generateInstanceId(): string {
  return `card_${Date.now()}_${instanceIdCounter++}`;
}

export function createCardInstance<T extends CardTemplate>(
  template: T,
  instanceId: string,
  visibility: Visibility
): CardInstance<T> {
  return {
    instanceId,
    template,
    visibility,
    orientation: 'normal',
    status: [],
    counters: {},
    attachments: [],
    evolutionStack: [],
  };
}

function createZone<T extends CardTemplate>(
  config: ZoneConfig,
  owner: PlayerIndex
): Zone<T> {
  return {
    config,
    owner,
    cards: [],
  };
}

function createPlayerInfo(
  index: PlayerIndex,
  playerId: string
): PlayerInfo {
  return {
    index,
    id: playerId,
    hasConceded: false,
    hasDeclaredVictory: false,
  };
}

// Create flattened zone key: "player0_hand", "player1_tableau_1"
export function makeZoneKey(playerIndex: PlayerIndex, zoneId: string): string {
  return `player${playerIndex}_${zoneId}`;
}

function createTurn(turnNumber: number, activePlayer: PlayerIndex): Turn {
  return {
    number: turnNumber,
    activePlayer,
    actions: [],
    ended: false,
  };
}

export function createGameState<T extends CardTemplate>(
  config: GameConfig,
  player1Id: string,
  player2Id: string
): GameState<T> {
  const now = Date.now();

  // Create flattened zones for all players
  const zones: Record<string, Zone<T>> = {};
  for (let playerIndex = 0; playerIndex < config.playerCount; playerIndex++) {
    for (const zoneConfig of config.zones) {
      const key = makeZoneKey(playerIndex as PlayerIndex, zoneConfig.id);
      zones[key] = createZone(zoneConfig, playerIndex as PlayerIndex);
    }
  }

  return {
    id: `game_${now}_${Math.random().toString(36).slice(2, 9)}`,
    config,
    turnNumber: 1,
    activePlayer: 0,
    zones,
    players: [
      createPlayerInfo(0, player1Id),
      createPlayerInfo(1, player2Id),
    ],
    currentTurn: createTurn(1, 0),
    result: null,
    startedAt: now,
    lastActionAt: now,
  };
}

// ============================================================================
// Deck Loading
// ============================================================================

export interface DeckEntry {
  templateId: string;
  count: number;
}

export interface DeckList {
  id: string;
  name: string;
  cards: DeckEntry[];
}

export function loadDeck<T extends CardTemplate>(
  state: GameState<T>,
  playerIndex: PlayerIndex,
  zoneId: string,
  deckList: DeckList,
  getTemplate: (templateId: string) => T | undefined,
  shuffle: boolean = true
): void {
  const zoneKey = makeZoneKey(playerIndex, zoneId);
  const zone = state.zones[zoneKey];
  if (!zone) {
    throw new Error(`Zone "${zoneKey}" not found for player ${playerIndex}`);
  }

  const cards: CardInstance<T>[] = [];

  for (const entry of deckList.cards) {
    const template = getTemplate(entry.templateId);
    if (!template) {
      throw new Error(`Template "${entry.templateId}" not found`);
    }

    for (let i = 0; i < entry.count; i++) {
      const instance = createCardInstance(
        template,
        generateInstanceId(),
        zone.config.defaultVisibility
      );
      cards.push(instance);
    }
  }

  if (shuffle) {
    shuffleArray(cards);
  }

  zone.cards.push(...cards);
}

// ============================================================================
// Utility Functions
// ============================================================================

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function findCardInZones<T extends CardTemplate>(
  state: GameState<T>,
  cardInstanceId: string
): { card: CardInstance<T>; zone: Zone<T>; index: number } | null {
  for (const zone of Object.values(state.zones)) {
    const index = zone.cards.findIndex((c) => c.instanceId === cardInstanceId);
    if (index !== -1) {
      return { card: zone.cards[index], zone, index };
    }
    // Check attachments and evolution stacks
    for (const card of zone.cards) {
      const attachmentIndex = card.attachments.findIndex(
        (a) => a.instanceId === cardInstanceId
      );
      if (attachmentIndex !== -1) {
        return {
          card: card.attachments[attachmentIndex],
          zone,
          index: attachmentIndex,
        };
      }
      if (card.evolutionStack) {
        const evoIndex = card.evolutionStack.findIndex(
          (e) => e.instanceId === cardInstanceId
        );
        if (evoIndex !== -1) {
          return { card: card.evolutionStack[evoIndex], zone, index: evoIndex };
        }
      }
    }
  }
  return null;
}

function getZone<T extends CardTemplate>(
  state: GameState<T>,
  zoneId: string,
  playerIndex: PlayerIndex
): Zone<T> | null {
  const zoneKey = makeZoneKey(playerIndex, zoneId);
  return state.zones[zoneKey] ?? null;
}

function removeCardFromZone<T extends CardTemplate>(
  zone: Zone<T>,
  cardInstanceId: string
): CardInstance<T> | null {
  const index = zone.cards.findIndex((c) => c.instanceId === cardInstanceId);
  if (index === -1) return null;
  return zone.cards.splice(index, 1)[0];
}

function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// ============================================================================
// Individual Action Executors
// ============================================================================

function executeDraw<T extends CardTemplate>(
  state: GameState<T>,
  action: DrawAction
): void {
  const deck = getZone(state, 'deck', action.player);
  const hand = getZone(state, 'hand', action.player);

  if (!deck || !hand) return;

  for (let i = 0; i < action.count && deck.cards.length > 0; i++) {
    const card = deck.cards.shift();
    if (card) {
      // Update visibility for hand
      if (hand.config.ownerCanSeeContents) {
        card.visibility = action.player === 0 ? VISIBILITY.PLAYER_A_ONLY : VISIBILITY.PLAYER_B_ONLY;
      }
      hand.cards.push(card);
    }
  }
}

function executeMoveCard<T extends CardTemplate>(
  state: GameState<T>,
  action: MoveCardAction
): void {
  const fromZone = getZone(state, action.fromZone, action.player);
  const toZone = getZone(state, action.toZone, action.player);

  if (!fromZone || !toZone) return;

  const card = removeCardFromZone(fromZone, action.cardInstanceId);
  if (!card) return;

  // Update visibility based on target zone
  card.visibility = toZone.config.defaultVisibility;

  if (action.position !== undefined && action.position >= 0) {
    toZone.cards.splice(action.position, 0, card);
  } else {
    toZone.cards.push(card);
  }
}

function executePlayCard<T extends CardTemplate>(
  state: GameState<T>,
  action: PlayCardAction
): void {
  const hand = getZone(state, 'hand', action.player);
  const toZone = getZone(state, action.toZone, action.player);

  if (!hand || !toZone) return;

  const card = removeCardFromZone(hand, action.cardInstanceId);
  if (!card) return;

  // Cards in play are typically public
  card.visibility = toZone.config.defaultVisibility;
  card.status.push('played_this_turn');

  toZone.cards.push(card);
}

function executeAttachCard<T extends CardTemplate>(
  state: GameState<T>,
  action: AttachCardAction
): void {
  const cardResult = findCardInZones(state, action.cardInstanceId);
  const targetResult = findCardInZones(state, action.targetInstanceId);

  if (!cardResult || !targetResult) return;

  // Remove from current location
  const removed = removeCardFromZone(cardResult.zone, action.cardInstanceId);
  if (!removed) return;

  // Attach to target
  targetResult.card.attachments.push(removed);
}

function executePlaceOnZone<T extends CardTemplate>(
  state: GameState<T>,
  action: PlaceOnZoneAction
): void {
  const zone = getZone(state, action.zoneId, action.player);
  if (!zone) return;

  const cardsToPlace: CardInstance<T>[] = [];

  for (const cardId of action.cardInstanceIds) {
    const result = findCardInZones(state, cardId);
    if (result) {
      const removed = removeCardFromZone(result.zone, cardId);
      if (removed) {
        removed.visibility = zone.config.defaultVisibility;
        cardsToPlace.push(removed);
      }
    }
  }

  if (action.position === 'top') {
    zone.cards.unshift(...cardsToPlace);
  } else {
    zone.cards.push(...cardsToPlace);
  }
}

function executeShuffle<T extends CardTemplate>(
  state: GameState<T>,
  action: ShuffleAction
): void {
  const zone = getZone(state, action.zoneId, action.player);
  if (!zone) return;

  shuffleArray(zone.cards);
}

function executeFlipCard<T extends CardTemplate>(
  state: GameState<T>,
  action: FlipCardAction
): void {
  const result = findCardInZones(state, action.cardInstanceId);
  if (!result) return;

  result.card.visibility = action.newVisibility;
}

function executeSetOrientation<T extends CardTemplate>(
  state: GameState<T>,
  action: SetOrientationAction
): void {
  const result = findCardInZones(state, action.cardInstanceId);
  if (!result) return;

  result.card.orientation = action.orientation;
}

function executeAddStatus<T extends CardTemplate>(
  state: GameState<T>,
  action: AddStatusAction
): void {
  const result = findCardInZones(state, action.cardInstanceId);
  if (!result) return;

  if (!result.card.status.includes(action.status)) {
    result.card.status.push(action.status);
  }
}

function executeRemoveStatus<T extends CardTemplate>(
  state: GameState<T>,
  action: RemoveStatusAction
): void {
  const result = findCardInZones(state, action.cardInstanceId);
  if (!result) return;

  const index = result.card.status.indexOf(action.status);
  if (index !== -1) {
    result.card.status.splice(index, 1);
  }
}

function executeAddCounter<T extends CardTemplate>(
  state: GameState<T>,
  action: AddCounterAction
): void {
  const result = findCardInZones(state, action.cardInstanceId);
  if (!result) return;

  const current = result.card.counters[action.counterType] ?? 0;
  result.card.counters[action.counterType] = current + action.amount;
}

function executeRemoveCounter<T extends CardTemplate>(
  state: GameState<T>,
  action: RemoveCounterAction
): void {
  const result = findCardInZones(state, action.cardInstanceId);
  if (!result) return;

  const current = result.card.counters[action.counterType] ?? 0;
  const newValue = Math.max(0, current - action.amount);

  if (newValue === 0) {
    delete result.card.counters[action.counterType];
  } else {
    result.card.counters[action.counterType] = newValue;
  }
}

function executeSetCounter<T extends CardTemplate>(
  state: GameState<T>,
  action: SetCounterAction
): void {
  const result = findCardInZones(state, action.cardInstanceId);
  if (!result) return;

  if (action.value <= 0) {
    delete result.card.counters[action.counterType];
  } else {
    result.card.counters[action.counterType] = action.value;
  }
}

function executeCoinFlip<T extends CardTemplate>(
  _state: GameState<T>,
  action: CoinFlipAction
): boolean[] {
  if (action.results) {
    return action.results;
  }

  const results: boolean[] = [];
  for (let i = 0; i < action.count; i++) {
    results.push(Math.random() < 0.5);
  }
  return results;
}

function executeDiceRoll<T extends CardTemplate>(
  _state: GameState<T>,
  action: DiceRollAction
): number[] {
  if (action.results) {
    return action.results;
  }

  const results: number[] = [];
  for (let i = 0; i < action.count; i++) {
    results.push(Math.floor(Math.random() * action.sides) + 1);
  }
  return results;
}

function executeEndTurn<T extends CardTemplate>(
  state: GameState<T>,
  _action: EndTurnAction
): void {
  state.currentTurn.ended = true;
  state.turnNumber++;
  state.activePlayer = state.activePlayer === 0 ? 1 : 0;
  state.currentTurn = createTurn(state.turnNumber, state.activePlayer);

  // Clear "played_this_turn" status from all cards
  for (const zone of Object.values(state.zones)) {
    for (const card of zone.cards) {
      const idx = card.status.indexOf('played_this_turn');
      if (idx !== -1) {
        card.status.splice(idx, 1);
      }
    }
  }
}

function executeConcede<T extends CardTemplate>(
  state: GameState<T>,
  action: ConcedeAction
): void {
  state.players[action.player].hasConceded = true;
  state.result = {
    winner: action.player === 0 ? 1 : 0,
    reason: 'concede',
  };
}

function executeDeclareVictory<T extends CardTemplate>(
  state: GameState<T>,
  action: DeclareVictoryAction
): void {
  state.players[action.player].hasDeclaredVictory = true;
  state.result = {
    winner: action.player,
    reason: 'victory_declared',
    details: action.reason,
  };
}

function executeReveal<T extends CardTemplate>(
  state: GameState<T>,
  action: RevealAction
): void {
  for (const cardId of action.cardInstanceIds) {
    const result = findCardInZones(state, cardId);
    if (!result) continue;

    if (action.to === 'both') {
      result.card.visibility = VISIBILITY.PUBLIC;
    } else {
      // Reveal to opponent only - toggle the opponent's visibility
      const opponentIndex = action.player === 0 ? 1 : 0;
      result.card.visibility = [
        result.card.visibility[0] || action.player === 0,
        result.card.visibility[1] || opponentIndex === 1,
      ] as Visibility;
    }
  }
}

function executePeek<T extends CardTemplate>(
  state: GameState<T>,
  action: PeekAction
): CardInstance<T>[] {
  const zone = getZone(state, action.zoneId, action.player);
  if (!zone) return [];

  const cards: CardInstance<T>[] = [];
  const count = Math.min(action.count, zone.cards.length);

  if (action.fromPosition === 'top') {
    for (let i = 0; i < count; i++) {
      cards.push(zone.cards[i]);
    }
  } else {
    for (let i = zone.cards.length - count; i < zone.cards.length; i++) {
      cards.push(zone.cards[i]);
    }
  }

  return cards;
}

// ============================================================================
// Main Action Executor
// ============================================================================

export function executeAction<T extends CardTemplate>(
  state: GameState<T>,
  action: Action
): void {
  state.lastActionAt = Date.now();
  state.currentTurn.actions.push(action);

  switch (action.type) {
    case 'draw':
      executeDraw(state, action);
      break;
    case 'move_card':
      executeMoveCard(state, action);
      break;
    case 'play_card':
      executePlayCard(state, action);
      break;
    case 'attach_card':
      executeAttachCard(state, action);
      break;
    case 'place_on_zone':
      executePlaceOnZone(state, action);
      break;
    case 'shuffle':
      executeShuffle(state, action);
      break;
    case 'search_zone':
      // Search is read-only, no state mutation
      break;
    case 'flip_card':
      executeFlipCard(state, action);
      break;
    case 'set_orientation':
      executeSetOrientation(state, action);
      break;
    case 'add_status':
      executeAddStatus(state, action);
      break;
    case 'remove_status':
      executeRemoveStatus(state, action);
      break;
    case 'add_counter':
      executeAddCounter(state, action);
      break;
    case 'remove_counter':
      executeRemoveCounter(state, action);
      break;
    case 'set_counter':
      executeSetCounter(state, action);
      break;
    case 'coin_flip':
      executeCoinFlip(state, action);
      break;
    case 'dice_roll':
      executeDiceRoll(state, action);
      break;
    case 'end_turn':
      executeEndTurn(state, action);
      break;
    case 'concede':
      executeConcede(state, action);
      break;
    case 'declare_victory':
      executeDeclareVictory(state, action);
      break;
    case 'reveal':
      executeReveal(state, action);
      break;
    case 'peek':
      executePeek(state, action);
      break;
  }
}

// ============================================================================
// Player View (Information Hiding)
// ============================================================================

export function getPlayerView<T extends CardTemplate>(
  state: GameState<T>,
  viewingPlayer: PlayerIndex
): GameState<T> {
  const view = deepClone(state);

  for (const zone of Object.values(view.zones)) {
    zone.cards = zone.cards.map((card) => filterCardForPlayer(card, viewingPlayer));
  }

  return view;
}

function filterCardForPlayer<T extends CardTemplate>(
  card: CardInstance<T>,
  viewingPlayer: PlayerIndex
): CardInstance<T> {
  const canSee = card.visibility[viewingPlayer];

  if (!canSee) {
    // Return a hidden card representation
    return {
      instanceId: card.instanceId,
      template: {
        id: 'hidden',
        name: 'Hidden Card',
        supertype: 'unknown',
        subtypes: [],
      } as unknown as T,
      visibility: card.visibility,
      orientation: card.orientation,
      status: [], // Hide status for hidden cards
      counters: {}, // Hide counters for hidden cards
      attachments: card.attachments.map((a) => filterCardForPlayer(a, viewingPlayer)),
      evolutionStack: card.evolutionStack?.map((e) =>
        filterCardForPlayer(e, viewingPlayer)
      ),
    };
  }

  // Card is visible, filter attachments and evolution stack recursively
  return {
    ...card,
    attachments: card.attachments.map((a) => filterCardForPlayer(a, viewingPlayer)),
    evolutionStack: card.evolutionStack?.map((e) =>
      filterCardForPlayer(e, viewingPlayer)
    ),
  };
}
