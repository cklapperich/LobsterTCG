/**
 * index.ts — Pokemon Pocket plugin entry point and facade.
 *
 * Fully independent from the standard Pokemon TCG plugin.
 * Implements the GamePlugin interface for Pokemon Pocket's simplified rules:
 * - 20-card decks, 5-card hands, 3 bench slots
 * - Energy zone: 2-slot queue (current + next preview), auto-advances on consume
 * - Energy counters for tracking attached energy on Pokemon
 * - Manual point system (first to 3 wins, awarded via markers/AI tool)
 * - Simplified weakness (+20), no resistance
 */
import type { GameState, GameConfig } from '../../core/types/game';
import type { Playmat } from '../../core/types/playmat';
import type { DeckList } from '../../core/types/deck';
import type { PlayerIndex, CardTemplate } from '../../core/types/card';
import type { GamePlugin, MarkerState } from '../../core/types/game-plugin';
import type { CounterDefinition } from '../../core/types/counter';
import type { ActionPanel } from '../../core/types/action-panel';
import type { Action } from '../../core/types/action';
import { createGameState, loadDeck, executeAction } from '../../core/engine';
import { loadPlaymat } from '../../core/playmat-loader';
import { shuffle as shuffleAction, draw as drawAction, concede as concedeAction, declareAction, coinFlip as coinFlipAction } from '../../core/action';
import { gameLog, systemLog } from '../../core/game-log';
import { VISIBILITY } from '../../core/types/card';
import { ACTION_TYPES, ORIENTATIONS } from '../../core/types/constants';
import type { ToolContext } from '../../core/ai-tools';
import type { ActionExecutor } from '../../core/action-executor';
import { ZONE_IDS } from './zones';
import type { PocketCardTemplate, PocketDeckMetadata } from './types';
import type { EnergyType } from './types';
import {
  getTemplate as getCardTemplate,
} from './cards';
import { isBasicPokemon, isFieldZone } from './helpers';
import { formatCardReference } from './narrative';
import { getAgentConfig } from './prompt-builder';
import {
  COUNTER_IDS,
  COUNTER_CATEGORIES,
  SETUP,
  POCKET_DECLARATION_TYPES,
  AI_COUNTER_TYPES,
  SUPERTYPES,
  STATUS_CONDITIONS,
  STATUS_TO_DEGREES,
  POINTS_TO_WIN,
  ENERGY_COUNTER_TYPES,
} from './constants';
import { getPluginState, initPluginState, rollEnergy } from './plugin-state';

// Reuse standard Pokemon TCG counter images for damage and status
import damage10Img from '../pokemon/counters/damage-10.png';
import damage50Img from '../pokemon/counters/damage-50.png';
import damage100Img from '../pokemon/counters/damage-100.png';
import burnImg from '../pokemon/counters/burn.png';
import poisonImg from '../pokemon/counters/poison.png';

// Reuse standard Pokemon coin images
import coinFrontImg from '../pokemon/coinfront.png';
import coinBackImg from '../pokemon/coinback.png';

// Energy symbol SVGs
import fireEnergyImg from './EnergySymbols/Energy Symbols/EnergyType/FireEnergy.svg';
import waterEnergyImg from './EnergySymbols/Energy Symbols/EnergyType/WaterEnergy.svg';
import grassEnergyImg from './EnergySymbols/Energy Symbols/EnergyType/GassEnergy.svg';
import lightningEnergyImg from './EnergySymbols/Energy Symbols/EnergyType/ElecEnergy.svg';
import psychicEnergyImg from './EnergySymbols/Energy Symbols/EnergyType/PsychEnergy.svg';
import fightingEnergyImg from './EnergySymbols/Energy Symbols/EnergyType/FightEnergy.svg';
import darknessEnergyImg from './EnergySymbols/Energy Symbols/EnergyType/DarkEnergy.svg';
import metalEnergyImg from './EnergySymbols/Energy Symbols/EnergyType/SteelEnergy.svg';
// Counter Definitions: damage counters + energy types (no dragon/colorless in Pocket)
const POCKET_COUNTERS: CounterDefinition[] = [
  // Damage counters
  { id: COUNTER_IDS.DAMAGE_10, name: '10 Damage', imageUrl: damage10Img, category: COUNTER_CATEGORIES.DAMAGE, sortOrder: 1 },
  { id: COUNTER_IDS.DAMAGE_50, name: '50 Damage', imageUrl: damage50Img, category: COUNTER_CATEGORIES.DAMAGE, sortOrder: 2 },
  { id: COUNTER_IDS.DAMAGE_100, name: '100 Damage', imageUrl: damage100Img, category: COUNTER_CATEGORIES.DAMAGE, sortOrder: 3 },
  // Status counters
  { id: COUNTER_IDS.BURN, name: 'Burned', imageUrl: burnImg, category: COUNTER_CATEGORIES.STATUS, sortOrder: 1 },
  { id: COUNTER_IDS.POISON, name: 'Poisoned', imageUrl: poisonImg, category: COUNTER_CATEGORIES.STATUS, sortOrder: 2 },
  // Energy counters
  { id: ENERGY_COUNTER_TYPES.fire, name: 'Fire Energy', imageUrl: fireEnergyImg, category: 'energy', sortOrder: 10 },
  { id: ENERGY_COUNTER_TYPES.water, name: 'Water Energy', imageUrl: waterEnergyImg, category: 'energy', sortOrder: 11 },
  { id: ENERGY_COUNTER_TYPES.grass, name: 'Grass Energy', imageUrl: grassEnergyImg, category: 'energy', sortOrder: 12 },
  { id: ENERGY_COUNTER_TYPES.lightning, name: 'Lightning Energy', imageUrl: lightningEnergyImg, category: 'energy', sortOrder: 13 },
  { id: ENERGY_COUNTER_TYPES.psychic, name: 'Psychic Energy', imageUrl: psychicEnergyImg, category: 'energy', sortOrder: 14 },
  { id: ENERGY_COUNTER_TYPES.fighting, name: 'Fighting Energy', imageUrl: fightingEnergyImg, category: 'energy', sortOrder: 15 },
  { id: ENERGY_COUNTER_TYPES.darkness, name: 'Darkness Energy', imageUrl: darknessEnergyImg, category: 'energy', sortOrder: 16 },
  { id: ENERGY_COUNTER_TYPES.metal, name: 'Metal Energy', imageUrl: metalEnergyImg, category: 'energy', sortOrder: 17 },
];

export function getCounterDefinitions(): CounterDefinition[] {
  return POCKET_COUNTERS;
}

export function getCoinFront(): string {
  return coinFrontImg;
}

export function getCoinBack(): string {
  return coinBackImg;
}

// Cached playmat instance
let cachedPlaymat: Playmat | null = null;

export async function getPocketPlaymat(): Promise<Playmat> {
  if (!cachedPlaymat) {
    cachedPlaymat = await loadPlaymat('/playmats/pokemon-pocket.json');
  }
  return cachedPlaymat;
}

function getGameConfig(playmat: Playmat): GameConfig {
  return {
    gameType: playmat.gameType,
    zones: playmat.zones,
    playerCount: 2,
    mulliganDrawCount: SETUP.HAND_SIZE,
  };
}

export async function startPocketGame(
  player1Id: string = 'player1',
  player2Id: string = 'player2'
): Promise<GameState<PocketCardTemplate>> {
  const playmat = await getPocketPlaymat();
  return startPocketGameWithPlaymat(playmat, player1Id, player2Id);
}

export function startPocketGameWithPlaymat(
  playmat: Playmat,
  player1Id: string = 'player1',
  player2Id: string = 'player2'
): GameState<PocketCardTemplate> {
  const config = getGameConfig(playmat);
  const state = createGameState<PocketCardTemplate>(config, player1Id, player2Id);
  initPluginState(state);
  return state;
}

export function loadPlayerDeck(
  state: GameState<PocketCardTemplate>,
  playerIndex: PlayerIndex,
  deckList: DeckList,
  getTemplate: (id: string) => CardTemplate | undefined,
  shuffleDeck: boolean = true
): void {
  const deckKey = `player${playerIndex + 1}_${ZONE_IDS.DECK}`;
  loadDeck(state, playerIndex, deckKey, deckList, getTemplate, shuffleDeck);

  // Derive energy type pool from deck metadata or Pokemon types, and seed initial next energy
  deriveEnergyPool(state, deckList, playerIndex);
}

/**
 * Build the energy type pool for the energy zone.
 * Prefers deck metadata (energy_types key) if available,
 * falls back to scanning Pokemon types in the deck.
 */
function deriveEnergyPool(state: GameState<PocketCardTemplate>, deckList: DeckList, playerIndex: PlayerIndex): void {
  const ps = getPluginState(state);
  const meta = deckList.metadata as PocketDeckMetadata | undefined;

  if (meta?.energy_types && meta.energy_types.length > 0) {
    ps.energyTypePool = [...meta.energy_types];
  } else {
    // Fallback: scan deck cards for Pokemon types
    const typeSet = new Set<EnergyType>();
    for (const zone of Object.values(state.zones)) {
      for (const card of zone.cards) {
        const template = card.template as PocketCardTemplate;
        if (template.supertype === SUPERTYPES.POKEMON && template.types) {
          for (const t of template.types) {
            typeSet.add(t);
          }
        }
      }
    }

    ps.energyTypePool = Array.from(typeSet);
    if (ps.energyTypePool.length === 0) {
      ps.energyTypePool = ['colorless'];
    }
  }

  // Seed initial "next" energy preview for this player.
  // Random seed is fine here — deck loading runs on the host before state_sync,
  // so the guest receives the already-rolled value.
  ps.energyZone[playerIndex].next = rollEnergy(ps.energyTypePool);
}

/**
 * Execute the standard game setup for a player.
 * Shuffles the deck and draws 5 cards. No prize cards in Pocket.
 */
export function executeSetup(state: GameState<CardTemplate>, playerIndex: PlayerIndex): void {
  const deckKey = `player${playerIndex + 1}_${ZONE_IDS.DECK}`;

  // Shuffle the deck
  executeAction(state, shuffleAction(playerIndex, deckKey));

  // Draw 5 cards
  executeAction(state, { type: ACTION_TYPES.DRAW, player: playerIndex, count: SETUP.HAND_SIZE });
}

export function getCardName(template: CardTemplate): string {
  return template.name ?? 'Unknown Card';
}

// ── Setup Phase Helpers ──────────────────────────────────────────

export function autoMulligan(state: GameState<CardTemplate>, playerIndex: PlayerIndex): number {
  let count = 0;
  const handKey = `player${playerIndex + 1}_hand`;
  const deckKey = `player${playerIndex + 1}_deck`;

  while (count < SETUP.MAX_MULLIGANS) {
    const hand = state.zones[handKey];
    const hasBasic = hand.cards.some(c => isBasicPokemon(c.template as PocketCardTemplate));
    if (hasBasic) break;

    count++;
    while (hand.cards.length > 0) {
      const card = hand.cards.pop()!;
      state.zones[deckKey].cards.push(card);
    }
    executeAction(state, shuffleAction(playerIndex, deckKey));
    executeAction(state, { type: ACTION_TYPES.DRAW, player: playerIndex, count: SETUP.HAND_SIZE });
    gameLog(state, 'Mulliganed (no Basic Pokemon)');
  }
  return count;
}

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

function getFieldZoneKeys(player: PlayerIndex): string[] {
  const p = `player${player + 1}`;
  return [
    `${p}_${ZONE_IDS.ACTIVE}`,
    ...ZONE_IDS.BENCH.map(b => `${p}_${b}`),
  ];
}

function getActionPanels(state: GameState<PocketCardTemplate>, player: PlayerIndex): ActionPanel[] {
  const panels: ActionPanel[] = [];

  // ATTACKS panel — from active Pokemon
  const activeKey = `player${player + 1}_${ZONE_IDS.ACTIVE}`;
  const activeZone = state.zones[activeKey];
  const activeCard = activeZone?.cards.at(-1);
  const template = activeCard ? getCardTemplate(activeCard.template.id) : undefined;

  const attackButtons: ActionPanel['buttons'] = (template?.attacks ?? []).map(atk => ({
    id: atk.name,
    label: atk.name,
    tooltip: atk.effect,
    zoneKey: activeKey,
  }));

  panels.push({
    id: 'attacks',
    title: 'ATTACKS',
    buttons: attackButtons,
    emptyMessage: 'No active Pokemon',
  });

  // ABILITIES panel — from all field Pokemon
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
        zoneKey,
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
        tooltip: stadiumTemplate?.effect ?? 'Click to view stadium card details',
        zoneKey: ZONE_IDS.STADIUM,
      }],
    });
  }

  // ENERGY ZONE panel — show current (attachable) + next (preview)
  const ps = getPluginState(state);
  const zone = ps.energyZone[player];
  const energyButtons: ActionPanel['buttons'] = [];

  if (zone.current) {
    const label = zone.current.charAt(0).toUpperCase() + zone.current.slice(1);
    energyButtons.push({
      id: 'attach-energy',
      label: `${label} Energy`,
      tooltip: 'Attach this energy to a Pokemon on your field (consumes from zone)',
      disabled: zone.attached,
    });
  }

  const nextLabel = zone.next
    ? `Next: ${zone.next.charAt(0).toUpperCase() + zone.next.slice(1)}`
    : 'Next: none';

  panels.push({
    id: 'energy-zone',
    title: 'ENERGY ZONE',
    buttons: energyButtons,
    emptyMessage: zone.current ? undefined : `No energy available | ${nextLabel}`,
  });

  return panels;
}

function onActionPanelClick(state: GameState<PocketCardTemplate>, player: PlayerIndex, panelId: string, buttonId: string): Action | undefined {
  if (panelId === 'attacks') {
    const activeKey = `player${player + 1}_${ZONE_IDS.ACTIVE}`;
    const topCard = state.zones[activeKey]?.cards.at(-1);
    const activeName = topCard?.template?.name ?? 'Active Pokemon';
    return declareAction(player, POCKET_DECLARATION_TYPES.ATTACK, buttonId, undefined, `${activeName} used ${buttonId}!`);
  }
  if (panelId === 'abilities') {
    const [zoneKey, abilityName] = buttonId.split('::');
    const zone = state.zones[zoneKey];
    const cardName = zone?.cards.at(-1)?.template?.name ?? 'Pokemon';
    return declareAction(player, POCKET_DECLARATION_TYPES.ABILITY, abilityName, { cardName }, `${cardName} used ability: ${abilityName}`);
  }
  if (panelId === 'stadium') {
    const stadiumZone = state.zones[ZONE_IDS.STADIUM];
    const stadiumCard = stadiumZone?.cards.at(-1);
    const cardName = stadiumCard?.template?.name ?? 'Stadium Card';
    const cardText = (stadiumCard?.template as PocketCardTemplate)?.effect ?? '';
    const message = cardText ? `Activated stadium: ${cardName}. ${cardText}` : `Activated stadium: ${cardName}.`;
    return declareAction(player, POCKET_DECLARATION_TYPES.STADIUM, cardName, undefined, message);
  }
  // Energy zone click — the actual attachment target selection is handled by UI flow
  // (player clicks attach, then clicks a field zone to place the counter)
  return undefined;
}

// ── Between-Turns Skip Hook ──────────────────────────────────────

const STATUS_ORIENTATIONS: Set<string> = new Set([
  ORIENTATIONS.TAPPED,         // paralyzed
  ORIENTATIONS.COUNTER_TAPPED, // asleep
]);

async function shouldSkipBetweenTurns(ctx: ToolContext): Promise<boolean> {
  const state = ctx.getState();
  const p = ctx.playerIndex;

  // Check active slot — if empty, agent needs to promote
  const activeKey = `player${p + 1}_${ZONE_IDS.ACTIVE}`;
  const activeZone = state.zones[activeKey];
  if (!activeZone || activeZone.cards.length === 0) return false;

  // Check for status conditions on field Pokemon
  const fieldZones = [
    `player${p + 1}_${ZONE_IDS.ACTIVE}`,
    ...ZONE_IDS.BENCH.map(b => `player${p + 1}_${b}`),
  ];

  for (const zoneKey of fieldZones) {
    const zone = state.zones[zoneKey];
    if (!zone) continue;
    for (const card of zone.cards) {
      if (card.orientation && STATUS_ORIENTATIONS.has(card.orientation)) return false;
    }
  }

  // Nothing to do — auto-draw and check deck-out
  const deckKey = `player${p + 1}_${ZONE_IDS.DECK}`;
  const deck = state.zones[deckKey];

  if (!deck || deck.cards.length === 0) {
    console.log('[AI Pipeline] Deck empty at draw — auto-conceding');
    await ctx.execute(concedeAction(p));
    return true;
  }

  await ctx.execute(drawAction(p, 1));
  console.log('[AI Pipeline] Between-turns skipped (no checkup needed), auto-drew 1 card');
  return true;
}

/**
 * Deterministic end-of-turn cleanup.
 * Clears paralysis if the AI's active Pokemon is paralyzed.
 */
async function onAfterTurn(ctx: ToolContext): Promise<void> {
  const state = ctx.getState();
  const p = ctx.playerIndex;
  const activeKey = `player${p + 1}_${ZONE_IDS.ACTIVE}`;
  const topCard = state.zones[activeKey]?.cards.at(-1);
  if (topCard?.orientation === ORIENTATIONS.TAPPED) {
    const { setOrientation } = await import('../../core/action');
    const degrees = STATUS_TO_DEGREES[STATUS_CONDITIONS.NORMAL];
    await ctx.execute(state2 => setOrientation(p, state2.zones[activeKey]!.cards.at(-1)!.instanceId, degrees));
    console.log('[AI Pipeline] Paralysis cleared after turn (deterministic)');
  }
}

// ── Point Markers (clickable to increment) ───────────────────────

function getMarkers(state: GameState<PocketCardTemplate>, playerIndex: PlayerIndex): MarkerState[] {
  const ps = getPluginState(state);
  const opp = (playerIndex === 0 ? 1 : 0) as PlayerIndex;
  return [
    { id: `p${playerIndex}_points`, label: `${ps.points[playerIndex]}`, sublabel: 'Your Pts', used: ps.points[playerIndex] >= POINTS_TO_WIN, clickable: true, usedLabel: 'WIN!' },
    { id: `p${opp}_points`, label: `${ps.points[opp]}`, sublabel: 'Opp Pts', used: ps.points[opp] >= POINTS_TO_WIN, clickable: true, usedLabel: 'WIN!' },
  ];
}

function onMarkerClick(state: GameState<PocketCardTemplate>, _playerIndex: PlayerIndex, markerId: string): Action | void {
  const ps = getPluginState(state);

  // Extract which player's points to increment from the marker ID
  const match = markerId.match(/^p(\d)_points$/);
  if (!match) return;
  const targetPlayer = parseInt(match[1], 10);
  if (targetPlayer !== 0 && targetPlayer !== 1) return;

  const newTotal = ps.points[targetPlayer] + 1;
  return declareAction(
    _playerIndex,
    POCKET_DECLARATION_TYPES.AWARD_POINTS,
    `Point Awarded! (${newTotal}/${POINTS_TO_WIN})`,
    { targetPlayer, amount: 1 },
    `Player ${targetPlayer + 1} earned 1 point! (Total: ${newTotal}/${POINTS_TO_WIN})`
  );
}

// ── Energy image lookup ──────────────────────────────────────────

const ENERGY_IMAGES: Record<string, string> = {
  fire: fireEnergyImg,
  water: waterEnergyImg,
  grass: grassEnergyImg,
  lightning: lightningEnergyImg,
  psychic: psychicEnergyImg,
  fighting: fightingEnergyImg,
  darkness: darknessEnergyImg,
  metal: metalEnergyImg,
};

// ── Board Widgets (energy zone display) ─────────────────────────

import type { BoardWidget } from '../../core/types/board-widget';

function getBoardWidgets(state: GameState<PocketCardTemplate>, playerIndex: PlayerIndex): BoardWidget[] {
  const ps = getPluginState(state);
  const widgets: BoardWidget[] = [];
  const opponent: PlayerIndex = playerIndex === 0 ? 1 : 0;

  // Render order: local player first (bottom of board), then opponent (top)
  for (const p of [playerIndex, opponent] as const) {
    const zone = ps.energyZone[p];
    const isLocal = p === playerIndex;

    // p1_deck slot = bottom (local player's deck after perspective flip)
    // p2_deck slot = top (opponent's deck after perspective flip)
    const slotId = isLocal ? 'p1_deck' : 'p2_deck';
    const position = 'above';

    const items: BoardWidget['items'] = [];

    // Next energy (left) — dimmed preview, not draggable
    if (zone.next) {
      items.push({
        id: `energy-next-${p}`,
        imageUrl: ENERGY_IMAGES[zone.next] ?? null,
        label: `${zone.next} Energy (next)`,
        dimmed: true,
      });
    } else {
      items.push({
        id: `energy-next-${p}`,
        imageUrl: null,
        label: 'No next energy',
        dimmed: true,
      });
    }

    // Current energy (right) — draggable only for local player and if not yet attached
    if (zone.current && !zone.attached) {
      const counterId = ENERGY_COUNTER_TYPES[zone.current];
      items.push({
        id: `energy-current-${p}`,
        imageUrl: ENERGY_IMAGES[zone.current] ?? null,
        label: `${zone.current} Energy (current)`,
        counterId: isLocal ? counterId : undefined,
      });
    } else {
      items.push({
        id: `energy-current-${p}`,
        imageUrl: null,
        label: zone.attached ? 'Energy attached' : 'No energy',
      });
    }

    widgets.push({ id: `energy-zone-${p}`, slotId, position, items });
  }

  return widgets;
}

// ── Plugin object ────────────────────────────────────────────────

export const plugin: GamePlugin<PocketCardTemplate> = {
  getPlaymat: getPocketPlaymat,
  startGame: startPocketGame,
  getCardName,
  getCounterDefinitions,
  getCoinFront,
  getCoinBack,
  formatCardForSearch: (template) => formatCardReference(template as any).join('\n'),
  getAICounterTypes: () => [...Object.values(AI_COUNTER_TYPES), ...Object.values(ENERGY_COUNTER_TYPES)],
  shouldSkipBetweenTurns,
  onAfterTurn,
  getAgentConfig,
  getActionPanels,
  onActionPanelClick,
  getMarkers,
  onMarkerClick,
  getBoardWidgets,
};

/**
 * Post-setup: coin flip to determine first player.
 * Initialize the energy zone queue for both players.
 * First player: no current energy on turn 1 (Pocket rule), only next.
 * Second player: current + next both filled.
 */
export async function onSetupComplete(_state: GameState<CardTemplate>, executor: ActionExecutor): Promise<void> {
  const isHeads = await executor.flipCoin();
  const winner: PlayerIndex = isHeads ? 0 : 1;
  executor.addLog(`Coin flip: ${isHeads ? 'HEADS' : 'TAILS'} — Player ${winner + 1} wins the flip!`);
  const firstPlayer = await executor.chooseFirstOrSecond(winner, [isHeads]);
  executor.addLog(`Player ${firstPlayer + 1} goes first!`);
  executor.tryAction(coinFlipAction(0, 1, [isHeads], firstPlayer));

  // Energy zones are pre-seeded during loadPlayerDeck → deriveEnergyPool,
  // so both P2P peers have identical initial "next" values before state_sync.
}

// Re-exports
export { pocketHooksPlugin, modifyReadableState } from './hooks';
export { ZONE_IDS, BENCH_ZONE_IDS, ALL_ZONE_IDS } from './zones';
export type { PocketCardTemplate } from './types';
export { getTemplate } from './cards';
export { formatCardReference } from './narrative';
export { buildPrompt } from './prompt-builder';
export { getPluginState, initPluginState } from './plugin-state';
export type { PocketPluginState } from './plugin-state';
