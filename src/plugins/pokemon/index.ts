import type { GameState, Playmat, DeckList, PlayerIndex, CardTemplate, GameConfig, GamePlugin, CounterDefinition, ActionPanel } from '../../core';
import {
  createGameState,
  loadDeck,
  loadPlaymat,
  shuffle as shuffleAction,
  moveCard,
  executeAction,
  setOrientation,
  resolveCardName,
} from '../../core';
import { createDefaultTools, type RunnableTool, type ToolContext } from '../../core/ai-tools';
import { ZONE_IDS } from './zones';
import type { PokemonCardTemplate } from './cards';
import {
  getCardBack,
  getTemplate as getCardTemplate,
} from './cards';

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
  { id: 'burn', name: 'Burned', imageUrl: burnImg, category: 'status', sortOrder: 1 },
  { id: 'poison', name: 'Poisoned', imageUrl: poisonImg, category: 'status', sortOrder: 2 },
  // Damage counters
  { id: '10', name: '10 Damage', imageUrl: damage10Img, category: 'damage', sortOrder: 1 },
  { id: '50', name: '50 Damage', imageUrl: damage50Img, category: 'damage', sortOrder: 2 },
  { id: '100', name: '100 Damage', imageUrl: damage100Img, category: 'damage', sortOrder: 3 },
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
  const deckKey = `player${playerIndex}_${ZONE_IDS.DECK}`;
  loadDeck(state, playerIndex, deckKey, deckList, getTemplate, shuffleDeck);
}

/**
 * Execute the standard game setup for a player.
 * Shuffles the deck, draws 7 cards, and sets 6 prizes.
 */
export function executeSetup(state: GameState<CardTemplate>, playerIndex: PlayerIndex): void {
  const deckKey = `player${playerIndex}_${ZONE_IDS.DECK}`;
  const prizesKey = `player${playerIndex}_${ZONE_IDS.PRIZES}`;

  // Shuffle the deck
  executeAction(state, shuffleAction(playerIndex, deckKey));

  // Draw 7 cards
  executeAction(state, { type: 'draw', player: playerIndex, count: 7 });

  // Set 6 prize cards (move top 6 from deck to prizes zone)
  for (let i = 0; i < 6; i++) {
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

// ── AI Tools ─────────────────────────────────────────────────────

/**
 * Actions that don't apply to Pokemon TCG.
 * - dice_roll: Pokemon uses coins, not dice
 * - flip_card: visibility is managed by zones, not manual flips
 * - declare_victory: victory is determined by prize cards, deck-out, or bench-out
 * - search_zone: handled by peek instead for AI
 * - place_on_zone: not a standard Pokemon action for AI
 */
const HIDDEN_DEFAULT_TOOLS = new Set([
  'dice_roll',
  'flip_card',
  'declare_victory',
  'search_zone',
  'place_on_zone',
  'set_orientation',
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

function createPokemonTools(ctx: ToolContext): RunnableTool[] {
  const p = ctx.playerIndex;
  const isDecision = ctx.isDecisionResponse ?? false;

  // Start with filtered defaults
  let tools = createDefaultTools(ctx).filter(
    t => !HIDDEN_DEFAULT_TOOLS.has(t.name)
  );

  // Decision-aware filtering
  if (isDecision) {
    // During a decision mini-turn: hide end_turn and create_decision, show resolve_decision
    tools = tools.filter(t => t.name !== 'end_turn' && t.name !== 'create_decision');
  } else {
    // Normal turn: hide resolve_decision, show end_turn and create_decision
    tools = tools.filter(t => t.name !== 'resolve_decision');
  }

  // ── Pokemon-specific tools ──────────────────────────────────

  tools.push(tool({
    name: 'declare_attack',
    description: 'Declare that your active Pokemon is using an attack. Logs the declaration to the game log.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        attackName: { type: 'string', description: 'Name of the attack to use' },
        targetCardName: { type: 'string', description: 'Optional: name of a target card' },
      },
      required: ['attackName'],
    },
    async run(input) {
      const state = ctx.getState();
      const activeKey = `player${p}_${ZONE_IDS.ACTIVE}`;
      const activeZone = state.zones[activeKey];
      const activeName = activeZone?.cards.at(-1)?.template?.name ?? 'Active Pokemon';
      const target = input.targetCardName ? ` targeting ${input.targetCardName}` : '';
      state.log.push(`${activeName} used ${input.attackName}!${target}`);
      return ctx.getReadableState();
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
    description: 'Declare that a Pokemon is using an ability. Logs the declaration to the game log.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cardName: { type: 'string', description: 'Name of the Pokemon with the ability' },
        abilityName: { type: 'string', description: 'Name of the ability to use' },
      },
      required: ['cardName', 'abilityName'],
    },
    async run(input) {
      const state = ctx.getState();
      state.log.push(`${input.cardName} used ability: ${input.abilityName}`);
      return ctx.getReadableState();
    },
  }));

  // ── Status condition tool (Pokemon-specific wrapper around orientation) ──
  const STATUS_TO_DEGREES: Record<string, string> = {
    normal: '0',
    paralyzed: '90',
    asleep: '-90',
    confused: '180',
  };

  tools.push(tool({
    name: 'set_status',
    description: 'Set a Pokemon\'s status condition. Only active Pokemon can have status.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cardName: { type: 'string', description: 'Name of the Pokemon' },
        zone: { type: 'string', description: 'Zone key the card is in' },
        status: { type: 'string', enum: ['normal', 'paralyzed', 'asleep', 'confused'], description: 'Status condition to apply, or "normal" to clear' },
      },
      required: ['cardName', 'zone', 'status'],
    },
    async run(input) {
      const state = ctx.getState();
      const cardId = input.cardName.startsWith('card_')
        ? input.cardName
        : resolveCardName(state, input.cardName, input.zone);
      const degrees = STATUS_TO_DEGREES[input.status] ?? '0';
      return ctx.execute(setOrientation(p, cardId, degrees));
    },
  }));

  return tools;
}

// ── Action Panels ────────────────────────────────────────────────

function getActionPanels(state: GameState<PokemonCardTemplate>, player: PlayerIndex): ActionPanel[] {
  const panels: ActionPanel[] = [];

  // ATTACKS panel — shows attacks from the active Pokemon
  const activeKey = `player${player}_${ZONE_IDS.ACTIVE}`;
  const activeZone = state.zones[activeKey];
  const activeCard = activeZone?.cards.at(-1);
  const template = activeCard ? getCardTemplate(activeCard.template.id) : undefined;

  const attackButtons = (template?.attacks ?? []).map(atk => {
    const costStr = atk.cost.length > 0 ? atk.cost.join('') : 'Free';
    const damageStr = atk.damage || '';
    const sublabel = damageStr ? `${costStr} — ${damageStr}` : costStr;
    return {
      id: atk.name,
      label: atk.name,
      sublabel,
      tooltip: atk.effect,
    };
  });

  panels.push({
    id: 'attacks',
    title: 'ATTACKS',
    buttons: attackButtons,
    emptyMessage: 'No active Pokemon',
  });

  // MULLIGAN panel
  panels.push({
    id: 'mulligan',
    title: 'MULLIGAN',
    buttons: [{
      id: 'mulligan',
      label: 'Mulligan',
      sublabel: 'Shuffle hand, draw 7',
    }],
  });

  return panels;
}

function onActionPanelClick(state: GameState<PokemonCardTemplate>, player: PlayerIndex, panelId: string, buttonId: string): void {
  if (panelId === 'attacks') {
    const activeKey = `player${player}_${ZONE_IDS.ACTIVE}`;
    const activeZone = state.zones[activeKey];
    const activeName = activeZone?.cards.at(-1)?.template?.name ?? 'Active Pokemon';
    state.log.push(`${activeName} used ${buttonId}!`);
  } else if (panelId === 'mulligan') {
    const handKey = `player${player}_${ZONE_IDS.HAND}`;
    const deckKey = `player${player}_${ZONE_IDS.DECK}`;
    const handZone = state.zones[handKey];

    // Move all hand cards to deck
    const cardIds = handZone.cards.map(c => c.instanceId);
    for (const id of cardIds) {
      executeAction(state, moveCard(player, id, handKey, deckKey));
    }

    // Shuffle deck
    executeAction(state, shuffleAction(player, deckKey));

    // Draw 7
    executeAction(state, { type: 'draw', player, count: 7 });

    const otherPlayer = player === 0 ? 2 : 1;
    state.log.push(`Player ${player + 1} mulliganed. Don't forget to draw 1 extra card Player ${otherPlayer}!`);
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
