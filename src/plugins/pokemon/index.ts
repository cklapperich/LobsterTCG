import type { GameState, Playmat, DeckList, PlayerIndex, CardTemplate, GameConfig, GamePlugin, CounterDefinition, ActionPanel } from '../../core';
import {
  createGameState,
  createCardInstance,
  generateInstanceId,
  loadDeck,
  loadPlaymat,
  shuffle as shuffleAction,
  moveCard,
  executeAction,
  setOrientation,
  resolveCardName,
  findCardInZones,
  VISIBILITY,
  zoneVisibility,
  ACTION_TYPES,
  PHASES,
  INSTANCE_ID_PREFIX,
} from '../../core';
import { createDefaultTools, resolveCardByPosition, type RunnableTool, type ToolContext } from '../../core/ai-tools';
import { ZONE_IDS } from './zones';
import type { PokemonCardTemplate } from './cards';
import {
  getCardBack,
  getTemplate as getCardTemplate,
} from './cards';
import { isBasicPokemon, isFieldZone } from './helpers';
import { formatCardReference } from './narrative';
import {
  SUPERTYPES,
  STATUS_TO_DEGREES,
  STATUS_CONDITIONS,
  COUNTER_IDS,
  COUNTER_CATEGORIES,
  SETUP,
  POKEMON_ACTION_TYPES,
} from './constants';

// Import counter images
import burnImg from './counters/burn.png';
import poisonImg from './counters/poison.png';
import damage10Img from './counters/damage-10.png';
import damage50Img from './counters/damage-50.png';
import damage100Img from './counters/damage-100.png';

// Import coin images
import coinFrontImg from './coinfront.png';
import coinBackImg from './coinback.png';

export type PokemonGameState = GameState<PokemonCardTemplate>;

// Pokemon TCG Counter Definitions
const POKEMON_COUNTERS: CounterDefinition[] = [
  // Status conditions
  { id: COUNTER_IDS.BURN, name: 'Burned', imageUrl: burnImg, category: COUNTER_CATEGORIES.STATUS, sortOrder: 1 },
  { id: COUNTER_IDS.POISON, name: 'Poisoned', imageUrl: poisonImg, category: COUNTER_CATEGORIES.STATUS, sortOrder: 2 },
  // Damage counters
  { id: COUNTER_IDS.DAMAGE_10, name: '10 Damage', imageUrl: damage10Img, category: COUNTER_CATEGORIES.DAMAGE, sortOrder: 1 },
  { id: COUNTER_IDS.DAMAGE_50, name: '50 Damage', imageUrl: damage50Img, category: COUNTER_CATEGORIES.DAMAGE, sortOrder: 2 },
  { id: COUNTER_IDS.DAMAGE_100, name: '100 Damage', imageUrl: damage100Img, category: COUNTER_CATEGORIES.DAMAGE, sortOrder: 3 },
];

export function getCounterDefinitions(): CounterDefinition[] {
  return POKEMON_COUNTERS;
}

export function getCoinFront(): string {
  return coinFrontImg;
}

export function getCoinBack(): string {
  return coinBackImg;
}

// Cached playmat instance
let cachedPlaymat: Playmat | null = null;

/**
 * Load the Pokemon TCG playmat from JSON.
 */
export async function getPokemonPlaymat(): Promise<Playmat> {
  if (!cachedPlaymat) {
    cachedPlaymat = await loadPlaymat('/playmats/pokemon-tcg.json');
  }
  return cachedPlaymat;
}

/**
 * Clear playmat cache (useful for testing).
 */
export function clearPlaymatCache(): void {
  cachedPlaymat = null;
}

/**
 * Derive GameConfig from playmat.
 */
function getGameConfig(playmat: Playmat): GameConfig {
  return {
    gameType: playmat.gameType,
    zones: playmat.zones,
    playerCount: 2,
  };
}

/**
 * Start a new Pokemon TCG game.
 * Loads the playmat from JSON and creates initial game state.
 */
export async function startPokemonGame(
  player1Id: string = 'player1',
  player2Id: string = 'player2'
): Promise<PokemonGameState> {
  const playmat = await getPokemonPlaymat();
  return startPokemonGameWithPlaymat(playmat, player1Id, player2Id);
}

/**
 * Start Pokemon TCG with an already-loaded playmat.
 * Automatically loads the default deck for player 0.
 */
export function startPokemonGameWithPlaymat(
  playmat: Playmat,
  player1Id: string = 'player1',
  player2Id: string = 'player2'
): PokemonGameState {
  const config = getGameConfig(playmat);
  return createGameState<PokemonCardTemplate>(config, player1Id, player2Id);
}

/**
 * Load a deck for a player into their deck zone.
 */
export function loadPlayerDeck(
  state: PokemonGameState,
  playerIndex: PlayerIndex,
  deckList: DeckList,
  getTemplate: (id: string) => CardTemplate | undefined,
  shuffleDeck: boolean = true
): void {
  const deckKey = `player${playerIndex + 1}_${ZONE_IDS.DECK}`;
  loadDeck(state, playerIndex, deckKey, deckList, getTemplate, shuffleDeck);
}

/**
 * Execute the standard game setup for a player.
 * Shuffles the deck, draws 7 cards, and sets 6 prizes.
 */
export function executeSetup(state: GameState<CardTemplate>, playerIndex: PlayerIndex): void {
  const deckKey = `player${playerIndex + 1}_${ZONE_IDS.DECK}`;
  const prizesKey = `player${playerIndex + 1}_${ZONE_IDS.PRIZES}`;

  // Shuffle the deck
  executeAction(state, shuffleAction(playerIndex, deckKey));

  // Draw 7 cards
  executeAction(state, { type: ACTION_TYPES.DRAW, player: playerIndex, count: SETUP.HAND_SIZE });

  // Set 6 prize cards (move top 6 from deck to prizes zone)
  for (let i = 0; i < SETUP.PRIZE_COUNT; i++) {
    const deckZone = state.zones[deckKey];
    if (deckZone.cards.length > 0) {
      const topCard = deckZone.cards[0];
      executeAction(state, moveCard(playerIndex, topCard.instanceId, deckKey, prizesKey));
    }
  }
}

/**
 * Initialize a complete game with both players' decks loaded and setup complete.
 */
export async function initializeGame(
  player1Deck: DeckList,
  player2Deck: DeckList,
  getTemplate: (id: string) => CardTemplate | undefined,
  player1Id: string = 'player1',
  player2Id: string = 'player2'
): Promise<PokemonGameState> {
  const state = await startPokemonGame(player1Id, player2Id);

  // Load decks
  loadPlayerDeck(state, 0, player1Deck, getTemplate);
  loadPlayerDeck(state, 1, player2Deck, getTemplate);

  // Execute setup for both players
  executeSetup(state, 0);
  executeSetup(state, 1);

  return state;
}

// Get card info string for modals
export function getCardInfo(template: CardTemplate): string {
  return template.name ?? 'Unknown Card';
}

// ── Setup Phase Helpers ──────────────────────────────────────────

/**
 * Auto-mulligan: shuffle hand back into deck and redraw 7 until hand
 * contains at least one Basic Pokemon. Returns the number of mulligans.
 */
export function autoMulligan(state: GameState<CardTemplate>, playerIndex: PlayerIndex): number {
  let count = 0;
  const handKey = `player${playerIndex + 1}_hand`;
  const deckKey = `player${playerIndex + 1}_deck`;

  while (count < SETUP.MAX_MULLIGANS) {
    const hand = state.zones[handKey];
    const hasBasic = hand.cards.some(c => isBasicPokemon(c.template as PokemonCardTemplate));
    if (hasBasic) break;

    count++;
    // Move all hand cards back to deck
    while (hand.cards.length > 0) {
      const card = hand.cards.pop()!;
      state.zones[deckKey].cards.push(card);
    }
    // Shuffle and redraw 7
    executeAction(state, shuffleAction(playerIndex, deckKey));
    executeAction(state, { type: ACTION_TYPES.DRAW, player: playerIndex, count: SETUP.HAND_SIZE });
    state.log.push(`Player ${playerIndex + 1} mulliganed (no Basic Pokemon)`);
  }
  return count;
}


/**
 * Conjure a card into a player's hand (debug/test helper).
 * Creates a fresh card instance with correct hand visibility and pushes it in.
 * @param templateId - Card template ID (e.g. "base1-75" for Lass)
 */
export function ensureCardInHand(state: GameState<CardTemplate>, playerIndex: PlayerIndex, templateId: string): void {
  const handKey = `player${playerIndex + 1}_${ZONE_IDS.HAND}`;
  const hand = state.zones[handKey];
  const template = getCardTemplate(templateId);
  if (!template) {
    console.warn(`ensureCardInHand: template "${templateId}" not found`);
    return;
  }
  const visibility = zoneVisibility(handKey, hand.config);
  const card = createCardInstance(template, generateInstanceId(), visibility);
  hand.cards.push(card);
}

/**
 * Flip all field Pokemon face-up (PUBLIC visibility).
 * Called once when setup phase transitions to playing.
 */
export function flipFieldCardsFaceUp(state: GameState<CardTemplate>): void {
  for (const [zoneKey, zone] of Object.entries(state.zones)) {
    if (isFieldZone(zoneKey)) {
      for (const card of zone.cards) {
        card.visibility = VISIBILITY.PUBLIC;
      }
    }
  }
  state.log.push('All Pokemon flipped face-up!');
}

// ── AI Tools ─────────────────────────────────────────────────────

/**
 * Actions that don't apply to Pokemon TCG.
 * - dice_roll: Pokemon uses coins, not dice
 * - flip_card: visibility is managed by zones, not manual flips
 * - declare_victory: victory is determined by prize cards, deck-out, or bench-out
 * - place_on_zone: not a standard Pokemon action for AI
 */
const HIDDEN_DEFAULT_TOOLS: Set<string> = new Set([
  ACTION_TYPES.DICE_ROLL,
  ACTION_TYPES.FLIP_CARD,
  ACTION_TYPES.DECLARE_VICTORY,
  ACTION_TYPES.PLACE_ON_ZONE,
  ACTION_TYPES.SET_ORIENTATION,
]);

/** Local tool factory matching RunnableTool shape. */
function tool(options: {
  name: string;
  description: string;
  inputSchema: Record<string, unknown> & { type: 'object' };
  run: (input: any) => Promise<string> | string;
}): RunnableTool {
  return {
    name: options.name,
    description: options.description,
    parameters: options.inputSchema,
    execute: options.run,
  };
}

/**
 * Auto-determine card position in a target zone based on Pokemon card type.
 * Pokemon on top, Energy in the middle, Trainer/Item on bottom.
 */
function getAutoPosition(
  state: PokemonGameState,
  toZone: string,
  cardId: string,
): number | undefined {
  const found = findCardInZones(state, cardId);
  if (!found) return undefined; // face-down / unknown → top

  const template = found.card.template as PokemonCardTemplate;
  if (!template.supertype) return undefined;

  if (template.supertype === SUPERTYPES.POKEMON) {
    return undefined; // top (push to end)
  }

  if (template.supertype === SUPERTYPES.ENERGY) {
    // Insert before the first Pokemon card in the zone
    const zoneCards = state.zones[toZone]?.cards;
    if (!zoneCards) return undefined;
    for (let i = 0; i < zoneCards.length; i++) {
      const t = zoneCards[i].template as PokemonCardTemplate;
      if (t.supertype === SUPERTYPES.POKEMON) return i;
    }
    return undefined; // no Pokemon → top
  }

  // Trainer/Item → bottom
  return 0;
}

function createPokemonTools(ctx: ToolContext): RunnableTool[] {
  const p = ctx.playerIndex;
  const isDecision = ctx.isDecisionResponse ?? false;

  // Start with filtered defaults (remove hidden tools and default move_card)
  let tools = createDefaultTools(ctx).filter(
    t => !HIDDEN_DEFAULT_TOOLS.has(t.name) && t.name !== ACTION_TYPES.MOVE_CARD
  );

  // Setup phase: only allow move_card, move_card_stack, end_turn
  if (ctx.getState().phase === PHASES.SETUP) {
    let setupTools = tools.filter(t => ([ACTION_TYPES.MOVE_CARD_STACK, ACTION_TYPES.END_TURN] as string[]).includes(t.name));
    // Add end_phase alias (agent0.md references it)
    const endTurnTool = setupTools.find(t => t.name === ACTION_TYPES.END_TURN);
    if (endTurnTool) {
      setupTools.push({ ...endTurnTool, name: 'end_phase', description: 'End the setup phase' });
    }
    // We still need the custom move_card tool below, so add it after the Pokemon tools section
    // For now, filter and we'll add move_card below
    tools = setupTools;

    // Add the Pokemon move_card with auto-position
    tools.push(tool({
      name: 'move_card',
      description: 'Move a card from one zone to another. Position is auto-determined: Pokemon on top, Energy in middle, Trainer/Item on bottom. Use cardName for visible cards. Omit cardName to take from top of zone (e.g. prize cards).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          cardName: { type: 'string', description: 'Name of the card to move (optional — omit for face-down cards)' },
          fromZone: { type: 'string', description: 'Zone key (e.g. "player2_hand")' },
          toZone: { type: 'string', description: 'Zone key to move the card to (e.g. "player2_active")' },
          fromPosition: { type: 'string', description: 'Position to pick from when cardName is omitted: "top" (default), "bottom", or numeric index' },
        },
        required: ['fromZone', 'toZone'],
      },
      async run(input) {
        const state = ctx.getState() as PokemonGameState;
        const cardId = input.cardName
          ? resolveCardName(state, input.cardName, input.fromZone)
          : resolveCardByPosition(state, input.fromZone, input.fromPosition);
        const position = getAutoPosition(state, input.toZone, cardId);
        return ctx.execute(moveCard(p, cardId, input.fromZone, input.toZone, position));
      },
    }));

    return setupTools;
  }

  // Decision-aware filtering
  if (isDecision) {
    // During a decision mini-turn: hide end_turn, create_decision, and search_zone
    tools = tools.filter(t => t.name !== ACTION_TYPES.END_TURN && t.name !== ACTION_TYPES.CREATE_DECISION && t.name !== ACTION_TYPES.SEARCH_ZONE);
  } else {
    // Normal turn: hide resolve_decision, show end_turn and create_decision
    tools = tools.filter(t => t.name !== ACTION_TYPES.RESOLVE_DECISION);
  }

  // ── Pokemon move_card with auto-position ────────────────────
  tools.push(tool({
    name: 'move_card',
    description: 'Move a card from one zone to another. Position is auto-determined: Pokemon on top, Energy in middle, Trainer/Item on bottom. Use cardName for visible cards. Omit cardName to take from top of zone (e.g. prize cards).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cardName: { type: 'string', description: 'Name of the card to move (optional — omit for face-down cards)' },
        fromZone: { type: 'string', description: 'Zone key (e.g. "player1_hand")' },
        toZone: { type: 'string', description: 'Zone key to move the card to (e.g. "player1_active")' },
        fromPosition: { type: 'string', description: 'Position to pick from when cardName is omitted: "top" (default), "bottom", or numeric index' },
      },
      required: ['fromZone', 'toZone'],
    },
    async run(input) {
      const state = ctx.getState() as PokemonGameState;
      const cardId = input.cardName
        ? resolveCardName(state, input.cardName, input.fromZone)
        : resolveCardByPosition(state, input.fromZone, input.fromPosition);
      const position = getAutoPosition(state, input.toZone, cardId);
      return ctx.execute(moveCard(p, cardId, input.fromZone, input.toZone, position));
    },
  }));

  // ── Pokemon-specific tools ──────────────────────────────────

  tools.push(tool({
    name: 'declare_attack',
    description: 'Declare that your active Pokemon is using an attack. Validates energy cost and first-turn restrictions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        attackName: { type: 'string', description: 'Name of the attack to use' },
        targetCardName: { type: 'string', description: 'Optional: name of a target card' },
      },
      required: ['attackName'],
    },
    async run(input) {
      return ctx.execute({
        type: POKEMON_ACTION_TYPES.DECLARE_ATTACK,
        player: p,
        attackName: input.attackName,
        targetCardName: input.targetCardName,
      } as any);
    },
  }));

  tools.push(tool({
    name: 'declare_retreat',
    description: 'Declare that your active Pokemon is retreating. Logs the declaration to the game log.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cardName: { type: 'string', description: 'Name of the Pokemon retreating' },
      },
      required: ['cardName'],
    },
    async run(input) {
      const state = ctx.getState();
      state.log.push(`${input.cardName} retreated!`);
      return ctx.getReadableState();
    },
  }));

  tools.push(tool({
    name: 'declare_ability',
    description: 'Declare that a Pokemon is using an ability. Logs the declaration and effect text to the game log.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cardName: { type: 'string', description: 'Name of the Pokemon with the ability' },
        abilityName: { type: 'string', description: 'Name of the ability to use' },
      },
      required: ['cardName', 'abilityName'],
    },
    async run(input) {
      return ctx.execute({
        type: POKEMON_ACTION_TYPES.DECLARE_ABILITY,
        player: p,
        cardName: input.cardName,
        abilityName: input.abilityName,
      } as any);
    },
  }));

  // ── Status condition tool (Pokemon-specific wrapper around orientation) ──
  tools.push(tool({
    name: 'set_status',
    description: 'Set a Pokemon\'s status condition. Only active Pokemon can have status.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cardName: { type: 'string', description: 'Name of the Pokemon' },
        zone: { type: 'string', description: 'Zone key the card is in' },
        status: { type: 'string', enum: [STATUS_CONDITIONS.NORMAL, STATUS_CONDITIONS.PARALYZED, STATUS_CONDITIONS.ASLEEP, STATUS_CONDITIONS.CONFUSED], description: 'Status condition to apply, or "normal" to clear' },
      },
      required: ['cardName', 'zone', 'status'],
    },
    async run(input) {
      const state = ctx.getState();
      const cardId = input.cardName.startsWith(INSTANCE_ID_PREFIX)
        ? input.cardName
        : resolveCardName(state, input.cardName, input.zone);
      const degrees = STATUS_TO_DEGREES[input.status] ?? STATUS_TO_DEGREES[STATUS_CONDITIONS.NORMAL];
      return ctx.execute(setOrientation(p, cardId, degrees));
    },
  }));

  return tools;
}

// ── Action Panels ────────────────────────────────────────────────

/** Collect all field zone keys for a player (active + bench). */
function getFieldZoneKeys(player: PlayerIndex): string[] {
  const p = `player${player + 1}`;
  return [
    `${p}_${ZONE_IDS.ACTIVE}`,
    ...ZONE_IDS.BENCH.map(b => `${p}_${b}`),
  ];
}

function getActionPanels(state: GameState<PokemonCardTemplate>, player: PlayerIndex): ActionPanel[] {
  const panels: ActionPanel[] = [];

  // ATTACKS panel — shows attacks from the active Pokemon
  const activeKey = `player${player + 1}_${ZONE_IDS.ACTIVE}`;
  const activeZone = state.zones[activeKey];
  const activeCard = activeZone?.cards.at(-1);
  const template = activeCard ? getCardTemplate(activeCard.template.id) : undefined;

  const attackButtons = (template?.attacks ?? []).map(atk => {
    return {
      id: atk.name,
      label: atk.name,
      tooltip: atk.effect,
    };
  });

  panels.push({
    id: 'attacks',
    title: 'ATTACKS',
    buttons: attackButtons,
    emptyMessage: 'No active Pokemon',
  });

  // ABILITIES panel — shows abilities from all field Pokemon
  const abilityButtons: ActionPanel['buttons'] = [];
  for (const zoneKey of getFieldZoneKeys(player)) {
    const zone = state.zones[zoneKey];
    const topCard = zone?.cards.at(-1);
    if (!topCard) continue;
    const tmpl = getCardTemplate(topCard.template.id);
    if (!tmpl?.abilities) continue;
    for (const ability of tmpl.abilities) {
      abilityButtons.push({
        id: `${zoneKey}::${ability.name}`,
        label: ability.name,
        sublabel: tmpl.name,
        tooltip: ability.effect,
      });
    }
  }

  panels.push({
    id: 'abilities',
    title: 'ABILITIES',
    buttons: abilityButtons,
    emptyMessage: 'No abilities',
  });

  return panels;
}

function onActionPanelClick(state: GameState<PokemonCardTemplate>, player: PlayerIndex, panelId: string, buttonId: string): any {
  if (panelId === 'attacks') {
    return {
      type: POKEMON_ACTION_TYPES.DECLARE_ATTACK,
      player,
      attackName: buttonId,
    };
  }
  if (panelId === 'abilities') {
    const [zoneKey, abilityName] = buttonId.split('::');
    const zone = state.zones[zoneKey];
    const cardName = zone?.cards.at(-1)?.template?.name ?? 'Pokemon';
    return {
      type: POKEMON_ACTION_TYPES.DECLARE_ABILITY,
      player,
      cardName,
      abilityName,
    };
  }
}

// Plugin object conforming to GamePlugin interface
export const plugin: GamePlugin<PokemonCardTemplate> = {
  getPlaymat: getPokemonPlaymat,
  startGame: startPokemonGame,
  getCardInfo,
  getCardBack,
  getCounterDefinitions,
  getCoinFront,
  getCoinBack,
  formatCardForSearch: (template) => formatCardReference(template as any).join('\n'),
  listTools: createPokemonTools,
  getActionPanels,
  onActionPanelClick,
};

// Re-exports
export { pokemonHooksPlugin, modifyReadableState } from './hooks';
export { ZONE_IDS, BENCH_ZONE_IDS, PRIZE_ZONE_IDS, ALL_ZONE_IDS } from './zones';
export type { PokemonCardTemplate } from './cards';
export {
  POKEMON_TEMPLATE_MAP,
  getTemplate,
  getCardBack,
  parsePTCGODeck,
  type PTCGOParseResult,
} from './cards';
