import type { GameState, Playmat, DeckList, PlayerIndex, CardTemplate, GameConfig, GamePlugin } from '../../core';
import {
  createGameState,
  loadDeck,
  loadPlaymat,
  makeZoneKey,
  shuffle as shuffleAction,
  moveCard,
  executeAction,
} from '../../core';
import { ZONE_IDS, PRIZE_ZONE_IDS } from './zones';
import type { PokemonCardTemplate } from './cards';
import {
  DEFAULT_POKEMON_DECK,
  getTemplate,
  getCardBack,
} from './cards';

export type PokemonGameState = GameState<PokemonCardTemplate>;

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
  const state = createGameState<PokemonCardTemplate>(config, player1Id, player2Id);

  // Auto-load default deck for player 0
  loadDeck(state, 0, ZONE_IDS.DECK, DEFAULT_POKEMON_DECK, getTemplate, false);

  return state;
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
export function executeSetup(state: PokemonGameState, playerIndex: PlayerIndex): void {
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

// Plugin object conforming to GamePlugin interface
export const plugin: GamePlugin<PokemonCardTemplate> = {
  getPlaymat: getPokemonPlaymat,
  startGame: startPokemonGame,
  getCardInfo,
  getCardBack,
};

// Re-exports
export { ZONE_IDS, BENCH_ZONE_IDS, PRIZE_ZONE_IDS, ALL_ZONE_IDS } from './zones';
export type { PokemonCardTemplate } from './cards';
export {
  POKEMON_TEMPLATE_MAP,
  DEFAULT_POKEMON_DECK,
  getTemplate,
  getCardBack,
} from './cards';
