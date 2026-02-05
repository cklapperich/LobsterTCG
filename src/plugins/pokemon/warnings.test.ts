import { describe, it, expect } from 'vitest';
import {
  createGameState,
  createCardInstance,
  generateInstanceId,
  makeZoneKey,
  GameLoop,
  PluginManager,
  playCard,
  addCounter,
  VISIBILITY,
} from '../../core';
import type { GameState, Action, ZoneConfig } from '../../core';
import type { PokemonCardTemplate } from './cards';
import { getTemplate } from './cards';
import { pokemonWarningsPlugin } from './warnings';

// ---------------------------------------------------------------------------
// Zone configs (minimal subset matching the pokemon playmat)
// ---------------------------------------------------------------------------
const POKEMON_ZONES: ZoneConfig[] = [
  { id: 'deck', name: 'Deck', ordered: true, defaultVisibility: VISIBILITY.HIDDEN, maxCards: -1, ownerCanSeeContents: false, opponentCanSeeCount: true },
  { id: 'hand', name: 'Hand', ordered: false, defaultVisibility: VISIBILITY.PLAYER_A_ONLY, maxCards: -1, ownerCanSeeContents: true, opponentCanSeeCount: true },
  { id: 'active', name: 'Active', ordered: false, defaultVisibility: VISIBILITY.PUBLIC, maxCards: -1, ownerCanSeeContents: true, opponentCanSeeCount: true },
  { id: 'bench_1', name: 'Bench 1', ordered: false, defaultVisibility: VISIBILITY.PUBLIC, maxCards: -1, ownerCanSeeContents: true, opponentCanSeeCount: true },
  { id: 'discard', name: 'Discard', ordered: true, defaultVisibility: VISIBILITY.PUBLIC, maxCards: -1, ownerCanSeeContents: true, opponentCanSeeCount: true },
];

// ---------------------------------------------------------------------------
// Test card IDs
// ---------------------------------------------------------------------------
const TIERNO = 'tk-xy-w-26';
const TREVOR = 'tk-xy-w-24';
const PIDGEY = 'tk-xy-w-29';
const PIDGEOTTO = 'tk-xy-w-23';
const JIGGLYPUFF = 'tk-xy-w-25';
const FAIRY_ENERGY = 'tk-xy-w-9';
const POTION = 'tk-xy-w-20';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SetupResult {
  state: GameState<PokemonCardTemplate>;
  gameLoop: GameLoop<PokemonCardTemplate>;
  blocked: Array<{ action: Action; reason: string }>;
}

function setupGame(): SetupResult {
  const state = createGameState<PokemonCardTemplate>(
    { gameType: 'pokemon-tcg', zones: POKEMON_ZONES, playerCount: 2 },
    'player-a',
    'player-b',
  );
  // Default to turn 3 so evolution timing doesn't interfere with other tests
  state.turnNumber = 3;
  state.currentTurn.number = 3;

  const pm = new PluginManager<PokemonCardTemplate>();
  pm.register(pokemonWarningsPlugin);
  const gameLoop = new GameLoop<PokemonCardTemplate>(state, pm);

  const blocked: Array<{ action: Action; reason: string }> = [];
  gameLoop.on('action:blocked', (_event, data) => {
    if (data.action && data.reason) {
      blocked.push({ action: data.action, reason: data.reason });
    }
  });

  return { state, gameLoop, blocked };
}

function placeCard(
  state: GameState<PokemonCardTemplate>,
  playerIndex: 0 | 1,
  zoneId: string,
  templateId: string,
): string {
  const template = getTemplate(templateId)!;
  const instanceId = generateInstanceId();
  const zone = state.zones[makeZoneKey(playerIndex, zoneId)];
  const card = createCardInstance(template, instanceId, zone.config.defaultVisibility);
  zone.cards.push(card);
  return instanceId;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('warnOneSupporter', () => {
  it('blocks second Supporter play this turn', () => {
    const { state, gameLoop, blocked } = setupGame();

    const tierno = placeCard(state, 0, 'hand', TIERNO);
    gameLoop.submit(playCard(0, tierno, 'discard'));
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);

    const trevor = placeCard(state, 0, 'hand', TREVOR);
    gameLoop.submit(playCard(0, trevor, 'discard'));
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('Already played a Supporter');
  });

  it('allows second Supporter with allowed_by_effect', () => {
    const { state, gameLoop, blocked } = setupGame();

    const tierno = placeCard(state, 0, 'hand', TIERNO);
    gameLoop.submit(playCard(0, tierno, 'discard'));
    gameLoop.processNext();

    const trevor = placeCard(state, 0, 'hand', TREVOR);
    gameLoop.submit({ ...playCard(0, trevor, 'discard'), allowed_by_effect: true });
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);
  });
});

describe('warnOneEnergyAttachment', () => {
  it('blocks second energy attachment to field zone', () => {
    const { state, gameLoop, blocked } = setupGame();

    // Need a pokemon on active and bench to attach to
    placeCard(state, 0, 'active', PIDGEY);
    placeCard(state, 0, 'bench_1', JIGGLYPUFF);

    const energy1 = placeCard(state, 0, 'hand', FAIRY_ENERGY);
    gameLoop.submit(playCard(0, energy1, 'active'));
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);

    const energy2 = placeCard(state, 0, 'hand', FAIRY_ENERGY);
    gameLoop.submit(playCard(0, energy2, 'bench_1'));
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('Already attached an Energy');
  });

  it('allows energy to non-field zone', () => {
    const { state, gameLoop, blocked } = setupGame();

    const energy1 = placeCard(state, 0, 'hand', FAIRY_ENERGY);
    gameLoop.submit(playCard(0, energy1, 'active'));
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);

    const energy2 = placeCard(state, 0, 'hand', FAIRY_ENERGY);
    gameLoop.submit(playCard(0, energy2, 'discard'));
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);
  });
});

describe('warnEvolutionChain', () => {
  it('blocks evolution with wrong pre-evolution', () => {
    const { state, gameLoop, blocked } = setupGame();

    placeCard(state, 0, 'active', JIGGLYPUFF);
    const pidgeotto = placeCard(state, 0, 'hand', PIDGEOTTO);
    gameLoop.submit(playCard(0, pidgeotto, 'active'));
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('no Pidgey found');
  });

  it('allows evolution with correct pre-evolution', () => {
    const { state, gameLoop, blocked } = setupGame();

    placeCard(state, 0, 'active', PIDGEY);
    const pidgeotto = placeCard(state, 0, 'hand', PIDGEOTTO);
    gameLoop.submit(playCard(0, pidgeotto, 'active'));
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);
  });
});

describe('warnEvolutionTiming', () => {
  it('blocks evolution on turn 1', () => {
    const { state, gameLoop, blocked } = setupGame();
    state.turnNumber = 1;
    state.currentTurn.number = 1;

    placeCard(state, 0, 'active', PIDGEY);
    const pidgeotto = placeCard(state, 0, 'hand', PIDGEOTTO);
    gameLoop.submit(playCard(0, pidgeotto, 'active'));
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('Cannot evolve on the first turn');
  });

  it('blocks evolution on Pokemon played this turn', () => {
    const { state, gameLoop, blocked } = setupGame();

    // Place Pidgey in active with played_this_turn flag
    const pidgeyTemplate = getTemplate(PIDGEY)!;
    const pidgeyId = generateInstanceId();
    const activeZone = state.zones[makeZoneKey(0, 'active')];
    const pidgeyCard = createCardInstance(pidgeyTemplate, pidgeyId, activeZone.config.defaultVisibility);
    pidgeyCard.flags.push('played_this_turn');
    activeZone.cards.push(pidgeyCard);

    const pidgeotto = placeCard(state, 0, 'hand', PIDGEOTTO);
    gameLoop.submit(playCard(0, pidgeotto, 'active'));
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('Cannot evolve on the first turn or the turn a Pokemon was played');
  });
});

describe('warnCountersOnTrainers', () => {
  it('blocks damage counter on Trainer card', () => {
    const { state, gameLoop, blocked } = setupGame();

    const potion = placeCard(state, 0, 'active', POTION);
    gameLoop.submit(addCounter(0, potion, '10', 1));
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('Cannot place 10 counters on a Trainer');
  });
});

describe('warnNonBasicToEmptyField', () => {
  it('blocks Stage 1 to empty field zone', () => {
    const { state, gameLoop, blocked } = setupGame();

    const pidgeotto = placeCard(state, 0, 'hand', PIDGEOTTO);
    gameLoop.submit(playCard(0, pidgeotto, 'active'));
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('Cannot place Pidgeotto');
    expect(blocked[0].reason).toContain('on empty active');
  });

  it('allows Basic Pokemon to empty field zone', () => {
    const { state, gameLoop, blocked } = setupGame();

    const pidgey = placeCard(state, 0, 'hand', PIDGEY);
    gameLoop.submit(playCard(0, pidgey, 'active'));
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);
  });
});
