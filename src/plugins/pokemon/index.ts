import type { GameState, Playmat, DeckList, PlayerIndex, CardTemplate, CardInstance, GameConfig, GamePlugin, CounterDefinition, ActionPanel, Action, MarkerState } from '../../core';
import {
  createGameState,
  createCardInstance,
  generateInstanceId,
  loadDeck,
  loadPlaymat,
  shuffle as shuffleAction,
  moveCard,
  draw as drawAction,
  concede as concedeAction,
  executeAction,
  declareAction,
  gameLog,
  systemLog,

  VISIBILITY,
  zoneVisibility,
  ACTION_TYPES,
  ORIENTATIONS,
} from '../../core';
import type { ToolContext } from '../../core/ai-tools';
import type { ActionExecutor } from '../../core/action-executor';
import { ZONE_IDS } from './zones';
import type { PokemonCardTemplate } from './cards';
import {
  getCardBack,
  getTemplate as getCardTemplate,
} from './cards';
import { isBasicPokemon, isFieldZone, isLegendPokemon, isVUnionPokemon } from './helpers';
import { formatCardReference } from './narrative';
import { getAgentConfig } from './prompt-builder';
import {
  COUNTER_IDS,
  COUNTER_CATEGORIES,
  SETUP,
  POKEMON_DECLARATION_TYPES,
  AI_COUNTER_TYPES,
  MARKER_IDS,
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
  const state = createGameState<PokemonCardTemplate>(config, player1Id, player2Id);
  initPluginState(state);
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

// Get card info string for modals
export function getCardName(template: CardTemplate): string {
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
    gameLog(state, 'Mulliganed (no Basic Pokemon)');
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
  systemLog(state, 'All Pokemon flipped face-up!');
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

  // STADIUM panel — shows only if a card is in the stadium zone
  const stadiumZone = state.zones[ZONE_IDS.STADIUM];
  const stadiumCard = stadiumZone?.cards.at(-1);
  if (stadiumCard) {
    const stadiumTemplate = getCardTemplate(stadiumCard.template.id);
    panels.push({
      id: 'stadium',
      title: 'ACTIVE STADIUM',
      buttons: [{
        id: 'view-stadium',
        label: stadiumTemplate?.name ?? 'Stadium Card',
        tooltip: 'Click to view stadium card details',
      }],
    });
  }

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
  if (panelId === 'stadium') {
    const stadiumZone = state.zones[ZONE_IDS.STADIUM];
    const stadiumCard = stadiumZone?.cards.at(-1);
    const cardName = stadiumCard?.template?.name ?? 'Stadium Card';
    const cardText = (stadiumCard?.template as PokemonCardTemplate)?.rules?.join(' ') ?? '';
    const message = cardText ? `Activated stadium: ${cardName}. ${cardText}` : `Activated stadium: ${cardName}.`;
    return declareAction(player, POKEMON_DECLARATION_TYPES.STADIUM, buttonId, undefined, message);
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

// ── GX / VSTAR Plugin State ──────────────────────────────────────

import { getPluginState, initPluginState } from './plugin-state';
export { getPluginState, initPluginState } from './plugin-state';
export type { PokemonPluginState } from './plugin-state';

function getMarkers(state: GameState<PokemonCardTemplate>, playerIndex: PlayerIndex): MarkerState[] {
  const ps = getPluginState(state);
  const opp = (playerIndex === 0 ? 1 : 0) as PlayerIndex;
  return [
    { id: `p${playerIndex}_${MARKER_IDS.GX}`, label: 'GX', sublabel: 'You', used: ps.gxUsed[playerIndex], clickable: true },
    { id: `p${playerIndex}_${MARKER_IDS.VSTAR}`, label: 'VSTAR', sublabel: 'You', used: ps.vstarUsed[playerIndex], clickable: true },
    { id: `p${opp}_${MARKER_IDS.GX}`, label: 'GX', sublabel: 'Opp', used: ps.gxUsed[opp], clickable: false },
    { id: `p${opp}_${MARKER_IDS.VSTAR}`, label: 'VSTAR', sublabel: 'Opp', used: ps.vstarUsed[opp], clickable: false },
  ];
}

function onMarkerClick(state: GameState<PokemonCardTemplate>, playerIndex: PlayerIndex, markerId: string): void {
  const ps = getPluginState(state);
  if (markerId.endsWith(`_${MARKER_IDS.GX}`) && !ps.gxUsed[playerIndex]) {
    ps.gxUsed[playerIndex] = true;
    gameLog(state, `Player ${playerIndex + 1} flipped GX marker`);
  }
  if (markerId.endsWith(`_${MARKER_IDS.VSTAR}`) && !ps.vstarUsed[playerIndex]) {
    ps.vstarUsed[playerIndex] = true;
    gameLog(state, `Player ${playerIndex + 1} flipped VSTAR marker`);
  }
}

// ── Composite Preview (LEGEND / V-UNION) ────────────────────────

function getCompositePreview(
  card: CardInstance<PokemonCardTemplate>,
  state: GameState<PokemonCardTemplate>
): CardInstance<PokemonCardTemplate>[] | undefined {
  const t = getCardTemplate(card.template.id);
  if (!t || (!isLegendPokemon(t) && !isVUnionPokemon(t))) return undefined;

  // Find related cards in the same zone (LEGEND/V-UNION parts share the same name)
  const baseName = card.template.name;
  for (const zone of Object.values(state.zones)) {
    const related = zone.cards.filter(c => c.template.name === baseName);
    if (related.length > 1 && related.some(c => c.instanceId === card.instanceId)) {
      return related;
    }
  }
  return undefined;
}

// Plugin object conforming to GamePlugin interface
export const plugin: GamePlugin<PokemonCardTemplate> = {
  getPlaymat: getPokemonPlaymat,
  startGame: startPokemonGame,
  getCardName,
  getCardBack,
  getCounterDefinitions,
  getCoinFront,
  getCoinBack,
  formatCardForSearch: (template) => formatCardReference(template as any).join('\n'),
  getAICounterTypes: () => Object.values(AI_COUNTER_TYPES),
  shouldSkipStartOfTurn,
  getAgentConfig,
  getActionPanels,
  onActionPanelClick,
  getMarkers,
  onMarkerClick,
  getCompositePreview,
};

/**
 * Post-setup: flip field cards face-up, coin flip to determine first player.
 */
export async function onSetupComplete(state: GameState<CardTemplate>, executor: ActionExecutor): Promise<PlayerIndex> {
  flipFieldCardsFaceUp(state);

  // Coin flip to determine who goes first (return winner, don't mutate —
  // addLog causes gameState reassignment which makes `state` ref stale)
  const isHeads = await executor.flipCoin();
  const firstPlayer: PlayerIndex = isHeads ? 0 : 1;
  executor.addLog(`Coin flip: ${isHeads ? 'HEADS' : 'TAILS'} — Player ${firstPlayer + 1} goes first!`);
  return firstPlayer;
}

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
