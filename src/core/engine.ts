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
  MoveCardStackAction,
  PlaceOnZoneAction,
  ShuffleAction,
  FlipCardAction,
  SetOrientationAction,
  AddCounterAction,
  RemoveCounterAction,
  SetCounterAction,
  CoinFlipAction,
  DiceRollAction,
  EndTurnAction,
  ConcedeAction,
  DeclareVictoryAction,
  CreateDecisionAction,
  ResolveDecisionAction,
  RevealHandAction,
  RevealAction,
  PeekAction,
  PlayerInfo,
  GameConfig,
  GameState,
  Turn,
} from './types';
import { VISIBILITY } from './types';

// ============================================================================
// Staging Zone Configuration
// ============================================================================

export const STAGING_ZONE_CONFIG: ZoneConfig = {
  name: 'Staging',
  ordered: false,
  defaultVisibility: VISIBILITY.PUBLIC,
  maxCards: -1,
  ownerCanSeeContents: true,
  opponentCanSeeCount: true,
};

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
    flags: [],
    counters: {},
  };
}

function createZone<T extends CardTemplate>(
  config: ZoneConfig,
  owner: PlayerIndex,
  key: string
): Zone<T> {
  return {
    key,
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
    for (const [zoneId, zoneConfig] of Object.entries(config.zones)) {
      const key = `player${playerIndex}_${zoneId}`;
      zones[key] = createZone(zoneConfig, playerIndex as PlayerIndex, key);
    }

    // Inject staging zone for each player
    const stagingKey = `player${playerIndex}_staging`;
    zones[stagingKey] = createZone(STAGING_ZONE_CONFIG, playerIndex as PlayerIndex, stagingKey);
  }

  return {
    id: `game_${now}_${Math.random().toString(36).slice(2, 9)}`,
    config,
    phase: 'setup',
    setupComplete: [false, false],
    turnNumber: 0,
    activePlayer: 0,
    zones,
    players: [
      createPlayerInfo(0, player1Id),
      createPlayerInfo(1, player2Id),
    ],
    currentTurn: createTurn(0, 0),
    pendingDecision: null,
    result: null,
    startedAt: now,
    lastActionAt: now,
    log: [],
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
  zoneKey: string,
  deckList: DeckList,
  getTemplate: (templateId: string) => T | undefined,
  shuffle: boolean = true
): void {
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

export function findCardInZones<T extends CardTemplate>(
  state: GameState<T>,
  cardInstanceId: string
): { card: CardInstance<T>; zone: Zone<T>; index: number } | null {
  for (const zone of Object.values(state.zones)) {
    const index = zone.cards.findIndex((c) => c.instanceId === cardInstanceId);
    if (index !== -1) {
      return { card: zone.cards[index], zone, index };
    }
  }
  return null;
}

export function getCardName<T extends CardTemplate>(
  state: GameState<T>,
  cardInstanceId: string,
  fallback: string = 'Card'
): string {
  const result = findCardInZones(state, cardInstanceId);
  return result?.card.template.name ?? fallback;
}

function getZone<T extends CardTemplate>(
  state: GameState<T>,
  zoneKey: string
): Zone<T> | null {
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
// Counter Position Locking
// ============================================================================

/**
 * When a card is removed from a zone, transfer its counters to the
 * new top card so counters "stay" at the top position.
 */
function transferCountersOnRemoval<T extends CardTemplate>(
  zone: Zone<T>,
  removedCard: CardInstance<T>
): void {
  const counterEntries = Object.entries(removedCard.counters);
  if (counterEntries.length === 0 || zone.cards.length === 0) return;

  const newTop = zone.cards[zone.cards.length - 1];
  for (const [counterType, amount] of counterEntries) {
    if (amount > 0) {
      newTop.counters[counterType] = (newTop.counters[counterType] ?? 0) + amount;
    }
  }
  removedCard.counters = {};
}

/**
 * Ensure all counters in a zone are on the top card.
 * Called after adding a card or reordering to keep counters locked on top.
 */
function consolidateCountersToTop<T extends CardTemplate>(zone: Zone<T>): void {
  if (zone.cards.length <= 1) return;

  const topCard = zone.cards[zone.cards.length - 1];
  for (let i = 0; i < zone.cards.length - 1; i++) {
    const card = zone.cards[i];
    const counterEntries = Object.entries(card.counters);
    if (counterEntries.length === 0) continue;
    for (const [counterType, amount] of counterEntries) {
      if (amount > 0) {
        topCard.counters[counterType] = (topCard.counters[counterType] ?? 0) + amount;
      }
    }
    card.counters = {};
  }
}

// ============================================================================
// Zone Visibility Helper
// ============================================================================

/**
 * Compute the correct visibility for a card entering a zone.
 * - Public zones → PUBLIC
 * - Hidden zones with ownerCanSeeContents → owner-only visibility
 * - Hidden zones without ownerCanSeeContents → HIDDEN
 */
function zoneVisibility(zoneKey: string, config: ZoneConfig): Visibility {
  if (config.defaultVisibility[0] && config.defaultVisibility[1]) {
    return VISIBILITY.PUBLIC;
  }
  if (config.ownerCanSeeContents) {
    const ownerIndex = zoneKey.startsWith('player0_') ? 0 : 1;
    return ownerIndex === 0 ? VISIBILITY.PLAYER_A_ONLY : VISIBILITY.PLAYER_B_ONLY;
  }
  return VISIBILITY.HIDDEN;
}

// ============================================================================
// Individual Action Executors
// ============================================================================

function executeDraw<T extends CardTemplate>(
  state: GameState<T>,
  action: DrawAction
): void {
  const deckKey = `player${action.player}_deck`;
  const handKey = `player${action.player}_hand`;
  const deck = getZone(state, deckKey);
  const hand = getZone(state, handKey);

  if (!deck || !hand) return;

  for (let i = 0; i < action.count && deck.cards.length > 0; i++) {
    const card = deck.cards.shift();
    if (card) {
      card.visibility = zoneVisibility(handKey, hand.config);
      card.orientation = undefined;
      hand.cards.push(card);
    }
  }
}

function executeMoveCard<T extends CardTemplate>(
  state: GameState<T>,
  action: MoveCardAction
): void {
  const fromZone = getZone(state, action.fromZone);
  const toZone = getZone(state, action.toZone);

  if (!fromZone || !toZone) return;

  const card = removeCardFromZone(fromZone, action.cardInstanceId);
  if (!card) return;

  transferCountersOnRemoval(fromZone, card);

  card.visibility = zoneVisibility(action.toZone, toZone.config);
  card.orientation = undefined;

  if (action.position !== undefined && action.position >= 0) {
    toZone.cards.splice(action.position, 0, card);
  } else {
    toZone.cards.push(card);
  }

  consolidateCountersToTop(toZone);
}

function executeMoveCardStack<T extends CardTemplate>(
  state: GameState<T>,
  action: MoveCardStackAction
): void {
  const fromZone = getZone(state, action.fromZone);
  const toZone = getZone(state, action.toZone);

  if (!fromZone || !toZone) return;

  const cards: CardInstance<T>[] = [];
  for (const cardId of action.cardInstanceIds) {
    const card = removeCardFromZone(fromZone, cardId);
    if (card) {
      transferCountersOnRemoval(fromZone, card);
      card.visibility = zoneVisibility(action.toZone, toZone.config);
      card.orientation = undefined;
      cards.push(card);
    }
  }

  if (action.position !== undefined && action.position >= 0) {
    toZone.cards.splice(action.position, 0, ...cards);
  } else {
    toZone.cards.push(...cards);
  }

  consolidateCountersToTop(toZone);
}

function executePlaceOnZone<T extends CardTemplate>(
  state: GameState<T>,
  action: PlaceOnZoneAction
): void {
  const zone = getZone(state, action.zoneId);
  if (!zone) return;

  const cardsToPlace: CardInstance<T>[] = [];

  for (const cardId of action.cardInstanceIds) {
    const result = findCardInZones(state, cardId);
    if (result) {
      const removed = removeCardFromZone(result.zone, cardId);
      if (removed) {
        transferCountersOnRemoval(result.zone, removed);
        removed.visibility = zoneVisibility(action.zoneId, zone.config);
        removed.orientation = undefined;
        cardsToPlace.push(removed);
      }
    }
  }

  if (action.position === 'top') {
    zone.cards.unshift(...cardsToPlace);
  } else {
    zone.cards.push(...cardsToPlace);
  }

  consolidateCountersToTop(zone);
}

function executeShuffle<T extends CardTemplate>(
  state: GameState<T>,
  action: ShuffleAction
): void {
  const zone = getZone(state, action.zoneId);
  if (!zone) return;

  shuffleArray(zone.cards);
  consolidateCountersToTop(zone);
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
  // Safety net: if a decision is pending, auto-resolve instead of ending turn
  if (state.pendingDecision) {
    // Un-reveal cards if needed
    if (state.pendingDecision.revealedZone) {
      const zone = state.zones[state.pendingDecision.revealedZone];
      if (zone) {
        const vis = zoneVisibility(state.pendingDecision.revealedZone, zone.config);
        for (const card of zone.cards) {
          card.visibility = vis;
        }
      }
    }
    const creator = state.pendingDecision.createdBy;
    state.pendingDecision = null;
    state.activePlayer = creator;
    state.log.push('Decision auto-resolved (end_turn called during decision)');
    return;
  }

  // Setup phase: track per-player completion, transition to playing when both done
  if (state.phase === 'setup') {
    state.setupComplete[state.activePlayer] = true;
    state.currentTurn.ended = true;

    if (state.setupComplete[0] && state.setupComplete[1]) {
      // Both done → transition to playing phase
      state.phase = 'playing';
      state.turnNumber = 1;
      state.activePlayer = 0;
      state.currentTurn = createTurn(1, 0);
    } else {
      // Switch to the other player's setup turn
      state.activePlayer = state.activePlayer === 0 ? 1 : 0;
      state.currentTurn = createTurn(0, state.activePlayer);
    }
    return;
  }

  state.currentTurn.ended = true;
  state.turnNumber++;
  state.activePlayer = state.activePlayer === 0 ? 1 : 0;
  state.currentTurn = createTurn(state.turnNumber, state.activePlayer);

  // Clear "played_this_turn" flag from all cards
  for (const zone of Object.values(state.zones)) {
    for (const card of zone.cards) {
      const idx = card.flags.indexOf('played_this_turn');
      if (idx !== -1) {
        card.flags.splice(idx, 1);
      }
    }
  }
}

function executeConcede<T extends CardTemplate>(
  state: GameState<T>,
  action: ConcedeAction
): void {
  state.pendingDecision = null;
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
  state.pendingDecision = null;
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
  const zone = getZone(state, action.zoneId);
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
// Decision Executors
// ============================================================================

function executeCreateDecision<T extends CardTemplate>(
  state: GameState<T>,
  action: CreateDecisionAction
): string | null {
  if (state.pendingDecision) {
    return 'A decision is already pending';
  }
  state.pendingDecision = {
    createdBy: action.player,
    targetPlayer: action.targetPlayer,
    message: action.message,
  };
  state.activePlayer = action.targetPlayer;
  state.log.push(`Decision requested: ${action.message ?? 'Action needed'} (Player ${action.targetPlayer + 1} to respond)`);
  return null;
}

function executeResolveDecision<T extends CardTemplate>(
  state: GameState<T>,
  action: ResolveDecisionAction
): string | null {
  if (!state.pendingDecision) {
    return 'No pending decision to resolve';
  }
  if (action.player !== state.pendingDecision.targetPlayer) {
    return `Only Player ${state.pendingDecision.targetPlayer + 1} can resolve this decision`;
  }

  // Un-reveal cards if this decision revealed a zone
  if (state.pendingDecision.revealedZone) {
    const zone = state.zones[state.pendingDecision.revealedZone];
    if (zone) {
      const vis = zoneVisibility(state.pendingDecision.revealedZone, zone.config);
      for (const card of zone.cards) {
        card.visibility = vis;
      }
    }
  }

  const creator = state.pendingDecision.createdBy;
  state.pendingDecision = null;
  state.activePlayer = creator;
  state.log.push(`Decision resolved by Player ${action.player + 1}`);
  return null;
}

function executeRevealHand<T extends CardTemplate>(
  state: GameState<T>,
  action: RevealHandAction
): string | null {
  if (state.pendingDecision) {
    return 'A decision is already pending';
  }

  const zone = state.zones[action.zoneKey];
  if (!zone) return `Zone "${action.zoneKey}" not found`;

  // Reveal all cards to both players
  for (const card of zone.cards) {
    card.visibility = VISIBILITY.PUBLIC;
  }

  // Log the card names
  const cardNames = zone.cards.map(c => c.template.name);
  const zoneName = zone.config.name ?? action.zoneKey;
  state.log.push(`Player ${action.player + 1} revealed ${zoneName}: ${cardNames.join(', ')}`);

  // Create a decision so opponent acknowledges
  const opponent = (action.player === 0 ? 1 : 0) as PlayerIndex;
  state.pendingDecision = {
    createdBy: action.player,
    targetPlayer: opponent,
    message: `Player ${action.player + 1} revealed their ${zoneName}`,
    revealedZone: action.zoneKey,
  };
  state.activePlayer = opponent;

  return null;
}

// ============================================================================
// Zone Capacity Checks
// ============================================================================

function isZoneAtCapacity(zone: Zone<any>, additionalCards = 1): boolean {
  if (zone.config.maxCards === -1) return false;
  return zone.cards.length + additionalCards > zone.config.maxCards;
}

function checkZoneCapacity<T extends CardTemplate>(
  state: GameState<T>,
  action: Action
): string | null {
  switch (action.type) {
    case 'move_card': {
      const toZone = getZone(state, action.toZone);
      if (toZone && isZoneAtCapacity(toZone))
        return `Move blocked: ${toZone.config.name} is full (${toZone.config.maxCards}/${toZone.config.maxCards} cards)`;
      return null;
    }
    case 'move_card_stack': {
      const toZone = getZone(state, action.toZone);
      if (toZone && isZoneAtCapacity(toZone, action.cardInstanceIds.length))
        return `Move blocked: ${toZone.config.name} is full (${toZone.config.maxCards}/${toZone.config.maxCards} cards)`;
      return null;
    }
    case 'place_on_zone': {
      const zone = getZone(state, action.zoneId);
      if (zone && isZoneAtCapacity(zone, action.cardInstanceIds.length))
        return `Place blocked: ${zone.config.name} is full (${zone.config.maxCards}/${zone.config.maxCards} cards)`;
      return null;
    }
    default:
      return null;
  }
}

// ============================================================================
// Opponent Zone Check
// ============================================================================

/**
 * Check if an action targets an opponent's zone. Returns null if allowed,
 * otherwise returns { shouldBlock, reason }. Counter actions are always
 * allowed (placing damage on opponent's Pokemon is normal gameplay).
 * Shared zones (e.g., stadium) are also allowed for any player.
 */
export function checkOpponentZone<T extends CardTemplate>(
  state: GameState<T>,
  action: Action
): { shouldBlock: boolean; reason: string } | null {
  if (action.allowed_by_effect) return null;

  // Only check actions that place/move cards into zones
  let zoneKey: string | undefined;
  switch (action.type) {
    case 'move_card':
      zoneKey = action.toZone;
      break;
    case 'move_card_stack':
      zoneKey = action.toZone;
      break;
    case 'place_on_zone':
      zoneKey = action.zoneId;
      break;
    default:
      return null;
  }

  if (!zoneKey) return null;
  if (action.player === state.activePlayer) return null;

  // Moving cards to opponent's discard is normal gameplay (e.g., knockout)
  if (zoneKey.endsWith('_discard')) return null;

  // Check if the target zone is shared
  const zone = state.zones[zoneKey];
  if (zone?.config.shared) return null;

  const zoneName = zone?.config.name ?? zoneKey;
  const reason = `Cannot move cards to opponent's ${zoneName}. Set allowed_by_effect if a card effect permits this.`;
  return {
    shouldBlock: action.source === 'ai',
    reason,
  };
}

// ============================================================================
// Main Action Executor
// ============================================================================

export function executeAction<T extends CardTemplate>(
  state: GameState<T>,
  action: Action
): string | null {
  // Capacity pre-check (before recording in action history)
  if (!action.allowed_by_effect) {
    const blocked = checkZoneCapacity(state, action);
    if (blocked) {
      state.log.push(blocked);
      return blocked;
    }
  }

  state.lastActionAt = Date.now();
  state.currentTurn.actions.push(action);

  switch (action.type) {
    case 'draw':
      executeDraw(state, action);
      break;
    case 'move_card':
      executeMoveCard(state, action);
      break;
    case 'move_card_stack':
      executeMoveCardStack(state, action);
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
    case 'create_decision': {
      const decErr = executeCreateDecision(state, action);
      if (decErr) {
        state.log.push(decErr);
        return decErr;
      }
      break;
    }
    case 'resolve_decision': {
      const resErr = executeResolveDecision(state, action);
      if (resErr) {
        state.log.push(resErr);
        return resErr;
      }
      break;
    }
    case 'reveal_hand': {
      const rhErr = executeRevealHand(state, action);
      if (rhErr) {
        state.log.push(rhErr);
        return rhErr;
      }
      break;
    }
    case 'reveal':
      executeReveal(state, action);
      break;
    case 'peek':
      executePeek(state, action);
      break;
  }

  return null;
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
      } as unknown as T,
      visibility: card.visibility,
      orientation: card.orientation,
      flags: [],
      counters: {},
    };
  }

  return { ...card };
}
