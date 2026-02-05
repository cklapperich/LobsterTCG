import type { GameState, Playmat, DeckList, PlayerIndex, CardTemplate, GameConfig, GamePlugin, CounterDefinition, Tool } from '../../core';
import {
  createGameState,
  loadDeck,
  loadPlaymat,
  makeZoneKey,
  shuffle as shuffleAction,
  moveCard,
  executeAction,
} from '../../core';
import type { GameLoop } from '../../core/game-loop';
import { createDefaultTools } from '../../core/ai-tools';
import { toReadableState } from '../../core/readable';
import { ZONE_IDS, PRIZE_ZONE_IDS } from './zones';
import type { PokemonCardTemplate } from './cards';
import {
  getCardBack,
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
  loadDeck(state, playerIndex, ZONE_IDS.DECK, deckList, getTemplate, shuffleDeck);
}

/**
 * Execute the standard game setup for a player.
 * Shuffles the deck, draws 7 cards, and sets 6 prizes.
 */
export function executeSetup(state: GameState<CardTemplate>, playerIndex: PlayerIndex): void {
  const deckKey = makeZoneKey(playerIndex, ZONE_IDS.DECK);

  // Shuffle the deck
  executeAction(state, shuffleAction(playerIndex, ZONE_IDS.DECK));

  // Draw 7 cards
  executeAction(state, { type: 'draw', player: playerIndex, count: 7 });

  // Set 6 prize cards (move top of deck to each prize zone)
  for (const prizeZone of PRIZE_ZONE_IDS) {
    const deckZone = state.zones[deckKey];
    if (deckZone.cards.length > 0) {
      const topCard = deckZone.cards[0];
      executeAction(state, moveCard(playerIndex, topCard.instanceId, ZONE_IDS.DECK, prizeZone));
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
 * - set_orientation: Pokemon doesn't use tap/untap
 * - declare_victory: victory is determined by prize cards, deck-out, or bench-out
 * - search_zone: handled by peek instead for AI
 * - move_card_stack: not a standard Pokemon action
 * - place_on_zone: not a standard Pokemon action for AI
 */
const HIDDEN_DEFAULT_TOOLS = new Set([
  'dice_roll',
  'flip_card',
  'set_orientation',
  'declare_victory',
  'search_zone',
  'move_card_stack',
  'place_on_zone',
]);

function createPokemonTools(
  gameLoop: GameLoop<PokemonCardTemplate>,
  playerIndex: PlayerIndex
): Tool[] {
  const p = playerIndex;

  // Start with filtered defaults
  const tools = createDefaultTools(gameLoop, p).filter(
    t => !HIDDEN_DEFAULT_TOOLS.has(t.name)
  );

  // ── Pokemon-specific tools ──────────────────────────────────

  tools.push({
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
      const state = gameLoop.getState();
      const activeKey = makeZoneKey(p, ZONE_IDS.ACTIVE);
      const activeZone = state.zones[activeKey];
      const activeName = activeZone?.cards[0]?.template?.name ?? 'Active Pokemon';
      const target = input.targetCardName ? ` targeting ${input.targetCardName}` : '';
      state.log.push(`${activeName} used ${input.attackName}!${target}`);
      const readable = toReadableState(state, p);
      return JSON.stringify(readable);
    },
  });

  tools.push({
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
      const state = gameLoop.getState();
      state.log.push(`${input.cardName} retreated!`);
      const readable = toReadableState(state, p);
      return JSON.stringify(readable);
    },
  });

  tools.push({
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
      const state = gameLoop.getState();
      state.log.push(`${input.cardName} used ability: ${input.abilityName}`);
      const readable = toReadableState(state, p);
      return JSON.stringify(readable);
    },
  });

  return tools;
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
};

// Re-exports
export { pokemonWarningsPlugin } from './warnings';
export { ZONE_IDS, BENCH_ZONE_IDS, PRIZE_ZONE_IDS, ALL_ZONE_IDS } from './zones';
export type { PokemonCardTemplate } from './cards';
export {
  POKEMON_TEMPLATE_MAP,
  getTemplate,
  getCardBack,
  parsePTCGODeck,
  type PTCGOParseResult,
} from './cards';
