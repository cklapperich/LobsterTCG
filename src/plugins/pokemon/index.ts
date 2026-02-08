import type { GameState, Playmat, DeckList, PlayerIndex, CardTemplate, GameConfig, GamePlugin, CounterDefinition, ActionPanel, Action } from '../../core';
import {
  createGameState,
  createCardInstance,
  generateInstanceId,
  loadDeck,
  loadPlaymat,
  shuffle as shuffleAction,
  moveCard,
  moveCardStack,
  draw as drawAction,
  concede as concedeAction,
  executeAction,
  setOrientation,
  resolveCardName,
  declareAction,

  VISIBILITY,
  zoneVisibility,
  ACTION_TYPES,
  PHASES,
  INSTANCE_ID_PREFIX,
  ORIENTATIONS,
} from '../../core';
import { createDefaultTools, type RunnableTool, type ToolContext } from '../../core/ai-tools';
import { ZONE_IDS } from './zones';
import type { PokemonCardTemplate } from './cards';
import {
  getCardBack,
  getTemplate as getCardTemplate,
} from './cards';
import { isBasicPokemon, isFieldZone } from './helpers';
import { formatCardReference } from './narrative';
import {
  STATUS_TO_DEGREES,
  STATUS_CONDITIONS,
  COUNTER_IDS,
  COUNTER_CATEGORIES,
  SETUP,
  POKEMON_DECLARATION_TYPES,
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

  // Shuffle the deck
  executeAction(state, shuffleAction(playerIndex, deckKey));

  // Draw 7 cards
  executeAction(state, { type: ACTION_TYPES.DRAW, player: playerIndex, count: SETUP.HAND_SIZE });

  // Set 6 prize cards (move top card from deck to each individual prize zone)
  for (let i = 0; i < SETUP.PRIZE_COUNT; i++) {
    const prizesKey = `player${playerIndex + 1}_${ZONE_IDS.PRIZES[i]}`;
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
 * - move_card_stack: AI misuses this (dumps entire hand onto field). Use swap_card_stacks instead.
 */
const HIDDEN_DEFAULT_TOOLS: Set<string> = new Set([
  ACTION_TYPES.DICE_ROLL,
  ACTION_TYPES.FLIP_CARD,
  ACTION_TYPES.DECLARE_VICTORY,
  ACTION_TYPES.PLACE_ON_ZONE,
  ACTION_TYPES.SET_ORIENTATION,
  ACTION_TYPES.MOVE_CARD_STACK,
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

/** Translate an AI-perspective zone key using the context's translator. */
function tzp(ctx: ToolContext, key: string): string {
  return ctx.translateZoneKey ? ctx.translateZoneKey(key) : key;
}

/** Reusable set_status tool factory (used by both checkup and executor roles). */
function createSetStatusTool(ctx: ToolContext): RunnableTool {
  const p = ctx.playerIndex;
  return tool({
    name: 'set_status',
    description: 'Set a Pokemon\'s status condition. Only active Pokemon can have status.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cardName: { type: 'string', description: 'Name of the Pokemon' },
        zone: { type: 'string', description: 'Zone key the card is in (e.g. "your_active")' },
        status: { type: 'string', enum: [STATUS_CONDITIONS.NORMAL, STATUS_CONDITIONS.PARALYZED, STATUS_CONDITIONS.ASLEEP, STATUS_CONDITIONS.CONFUSED], description: 'Status condition to apply, or "normal" to clear' },
      },
      required: ['cardName', 'zone', 'status'],
    },
    async run(input) {
      const zone = tzp(ctx, input.zone);
      return ctx.execute((state) => {
        const cardId = input.cardName.startsWith(INSTANCE_ID_PREFIX)
          ? input.cardName
          : resolveCardName(state, input.cardName, zone);
        const degrees = STATUS_TO_DEGREES[input.status] ?? STATUS_TO_DEGREES[STATUS_CONDITIONS.NORMAL];
        return setOrientation(p, cardId, degrees);
      });
    },
  });
}

/** No-op end_phase tool. Just returns a string; AbortController stops the agent. */
function createEndPhaseTool(description: string = 'Signal that this phase is complete.'): RunnableTool {
  return tool({
    name: 'end_phase',
    description,
    inputSchema: { type: 'object' as const, properties: {}, required: [] },
    run() { return 'Phase complete.'; },
  });
}

function createPokemonTools(ctx: ToolContext): RunnableTool[] {
  const p = ctx.playerIndex;
  const isDecision = ctx.isDecisionResponse ?? false;
  const role = ctx.agentRole;

  // ── Planner: no tools ──────────────────────────────────────────
  if (role === 'planner') return [];

  // ── Checkup: limited tools + no-op end_phase ──────────────────
  if (role === 'checkup') {
    const CHECKUP_TOOL_NAMES: Set<string> = new Set([
      ACTION_TYPES.ADD_COUNTER,
      ACTION_TYPES.REMOVE_COUNTER,
      ACTION_TYPES.SET_COUNTER,
      ACTION_TYPES.COIN_FLIP,
      ACTION_TYPES.DRAW,
      ACTION_TYPES.SWAP_CARD_STACKS,
      ACTION_TYPES.CONCEDE,
    ]);
    const checkupTools = createDefaultTools(ctx)
      .filter(t => CHECKUP_TOOL_NAMES.has(t.name));
    checkupTools.push(createSetStatusTool(ctx));
    checkupTools.push(createEndPhaseTool('Signal that checkup is complete.'));
    return checkupTools;
  }

  // ── Setup / Executor / default ─────────────────────────────────

  // Start with filtered defaults
  let tools = createDefaultTools(ctx).filter(
    t => !HIDDEN_DEFAULT_TOOLS.has(t.name)
  );

  // Setup phase: only allow move_card, swap_card_stacks, end_turn, mulligan
  if (ctx.getState().phase === PHASES.SETUP) {
    let setupTools = tools.filter(t => ([ACTION_TYPES.MOVE_CARD, ACTION_TYPES.SWAP_CARD_STACKS, ACTION_TYPES.END_TURN, ACTION_TYPES.MULLIGAN] as string[]).includes(t.name));
    // Add end_phase alias (prompt-sections.md references it)
    const endTurnTool = setupTools.find(t => t.name === ACTION_TYPES.END_TURN);
    if (endTurnTool) {
      setupTools.push({ ...endTurnTool, name: 'end_phase', description: 'End the setup phase' });
    }

    return setupTools;
  }

  // Mulligan is only available during setup (which returns early above)
  tools = tools.filter(t => t.name !== ACTION_TYPES.MULLIGAN);

  // Decision-aware filtering
  if (isDecision) {
    // During a decision mini-turn: hide end_turn, create_decision, and search_zone
    tools = tools.filter(t => t.name !== ACTION_TYPES.END_TURN && t.name !== ACTION_TYPES.CREATE_DECISION && t.name !== ACTION_TYPES.SEARCH_ZONE);
  } else {
    // Normal turn: hide resolve_decision, show end_turn and create_decision
    tools = tools.filter(t => t.name !== ACTION_TYPES.RESOLVE_DECISION);
  }

  // Executor: replace end_turn with end_phase (pipeline handles actual end_turn)
  if (role === 'executor') {
    tools = tools.filter(t => t.name !== ACTION_TYPES.END_TURN);
    tools.push(createEndPhaseTool('Signal that you have finished executing the plan.'));
  }

  // ── Pokemon-specific tools ──────────────────────────────────

  tools.push(tool({
    name: 'declare_attack',
    description: 'Declare that your active Pokemon is using an attack. Validates energy cost and first-turn restrictions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        attackName: { type: 'string', description: 'Name of the attack to use' },
        targetCardName: { type: 'string', description: 'Optional: name of a target card' },
        allowed_by_card_effect: { type: 'boolean', description: 'Set true when a card effect permits bypassing normal rules (e.g. attacking on first turn)' },
      },
      required: ['attackName'],
    },
    async run(input) {
      return ctx.execute((state) => {
        const activeKey = `player${p + 1}_${ZONE_IDS.ACTIVE}`;
        const topCard = state.zones[activeKey]?.cards.at(-1);
        const activeName = topCard?.template?.name ?? 'Active Pokemon';
        const target = input.targetCardName ? ` targeting ${input.targetCardName}` : '';
        const msg = `${activeName} used ${input.attackName}!${target}`;
        const action = declareAction(p, POKEMON_DECLARATION_TYPES.ATTACK, input.attackName, { targetCardName: input.targetCardName }, msg);
        if (input.allowed_by_card_effect) action.allowed_by_card_effect = true;
        return action;
      });
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
      return ctx.execute(declareAction(p, POKEMON_DECLARATION_TYPES.RETREAT, input.cardName, undefined, `${input.cardName} retreated!`));
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
        allowed_by_card_effect: { type: 'boolean', description: 'Set true when a card effect permits bypassing normal rules' },
      },
      required: ['cardName', 'abilityName'],
    },
    async run(input) {
      const msg = `${input.cardName} used ability: ${input.abilityName}`;
      const action = declareAction(p, POKEMON_DECLARATION_TYPES.ABILITY, input.abilityName, { cardName: input.cardName }, msg);
      if (input.allowed_by_card_effect) action.allowed_by_card_effect = true;
      return ctx.execute(action);
    },
  }));

  // ── Status condition tool (Pokemon-specific wrapper around orientation) ──
  tools.push(createSetStatusTool(ctx));

  // ── Discard Zone (move all cards from a zone to discard) ──
  tools.push(tool({
    name: 'discard_pokemon_from_zone',
    description: 'Discard all cards in a zone. Moves every card from the specified zone to your discard pile. Use this when your pokemon get knocked out.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        zone: { type: 'string', description: 'Zone key to discard all cards from (e.g. "your_active", "your_bench_1")' },
      },
      required: ['zone'],
    },
    async run(input) {
      const zoneKey = tzp(ctx, input.zone);
      return ctx.execute((state) => {
        const zone = state.zones[zoneKey];
        if (!zone) throw new Error(`Zone "${input.zone}" not found`);
        if (zone.cards.length === 0) throw new Error(`Zone "${input.zone}" is empty`);
        const cardIds = zone.cards.map(c => c.instanceId);
        const discardKey = `player${p + 1}_${ZONE_IDS.DISCARD}`;
        return moveCardStack(p, cardIds, zoneKey, discardKey);
      });
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

function onActionPanelClick(state: GameState<PokemonCardTemplate>, player: PlayerIndex, panelId: string, buttonId: string): Action | undefined {
  if (panelId === 'attacks') {
    const activeKey = `player${player + 1}_${ZONE_IDS.ACTIVE}`;
    const topCard = state.zones[activeKey]?.cards.at(-1);
    const activeName = topCard?.template?.name ?? 'Active Pokemon';
    return declareAction(player, POKEMON_DECLARATION_TYPES.ATTACK, buttonId, undefined, `${activeName} used ${buttonId}!`);
  }
  if (panelId === 'abilities') {
    const [zoneKey, abilityName] = buttonId.split('::');
    const zone = state.zones[zoneKey];
    const cardName = zone?.cards.at(-1)?.template?.name ?? 'Pokemon';
    return declareAction(player, POKEMON_DECLARATION_TYPES.ABILITY, abilityName, { cardName }, `${cardName} used ability: ${abilityName}`);
  }
  return undefined;
}

// ── Start-of-Turn Skip Hook ──────────────────────────────────────

/** Status orientations that require agent attention. */
const STATUS_ORIENTATIONS: Set<string> = new Set([
  ORIENTATIONS.TAPPED,         // paralyzed
  ORIENTATIONS.COUNTER_TAPPED, // asleep
  ORIENTATIONS.FLIPPED,        // confused
]);

/**
 * Check if the start-of-turn agent can be skipped.
 * Conditions for skipping (all must be true):
 *   - No poison/burn counters on any AI field Pokemon
 *   - No status orientation (sleep/paralyzed/confused) on any AI field Pokemon
 *   - Active slot is occupied (no need to promote)
 *
 * When skipping: auto-draw 1 card, check deck-out → auto-concede.
 */
async function shouldSkipStartOfTurn(ctx: ToolContext): Promise<boolean> {
  const state = ctx.getState();
  const p = ctx.playerIndex;

  // Check active slot — if empty, agent needs to promote
  const activeKey = `player${p + 1}_${ZONE_IDS.ACTIVE}`;
  const activeZone = state.zones[activeKey];
  if (!activeZone || activeZone.cards.length === 0) return false;

  // Check all field zones for status conditions or poison/burn counters
  const fieldZones = [
    `player${p + 1}_${ZONE_IDS.ACTIVE}`,
    ...ZONE_IDS.BENCH.map(b => `player${p + 1}_${b}`),
  ];

  for (const zoneKey of fieldZones) {
    const zone = state.zones[zoneKey];
    if (!zone) continue;
    for (const card of zone.cards) {
      // Check orientation-based status
      if (card.orientation && STATUS_ORIENTATIONS.has(card.orientation)) return false;
      // Check poison/burn counters
      if (card.counters) {
        if (card.counters[COUNTER_IDS.POISON] > 0) return false;
        if (card.counters[COUNTER_IDS.BURN] > 0) return false;
      }
    }
  }

  // Nothing to do — auto-draw and check deck-out
  const deckKey = `player${p + 1}_${ZONE_IDS.DECK}`;
  const deck = state.zones[deckKey];

  if (!deck || deck.cards.length === 0) {
    // Deck-out: auto-concede
    console.log('[AI Pipeline] Deck empty at draw — auto-conceding');
    await ctx.execute(concedeAction(p));
    return true;
  }

  await ctx.execute(drawAction(p, 1));
  console.log('[AI Pipeline] Start-of-turn skipped (no checkup needed), auto-drew 1 card');
  return true;
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
  shouldSkipStartOfTurn,
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
