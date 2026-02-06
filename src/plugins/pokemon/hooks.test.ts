import { describe, it, expect } from 'vitest';
import {
  createGameState,
  createCardInstance,
  generateInstanceId,
  GameLoop,
  PluginManager,
  moveCard,
  moveCardStack,
  addCounter,
  VISIBILITY,
} from '../../core';
import type { GameState, Action, ZoneConfig } from '../../core';
import type { PokemonCardTemplate } from './cards';
import { getTemplate } from './cards';
import { pokemonHooksPlugin } from './hooks';

// ---------------------------------------------------------------------------
// Zone configs (minimal subset matching the pokemon playmat)
// ---------------------------------------------------------------------------
const POKEMON_ZONES: Record<string, ZoneConfig> = {
  deck: { name: 'Deck', ordered: true, defaultVisibility: VISIBILITY.HIDDEN, maxCards: -1, ownerCanSeeContents: false, opponentCanSeeCount: true },
  hand: { name: 'Hand', ordered: false, defaultVisibility: VISIBILITY.PLAYER_A_ONLY, maxCards: -1, ownerCanSeeContents: true, opponentCanSeeCount: true },
  active: { name: 'Active', ordered: false, defaultVisibility: VISIBILITY.PUBLIC, maxCards: -1, ownerCanSeeContents: true, opponentCanSeeCount: true },
  bench_1: { name: 'Bench 1', ordered: false, defaultVisibility: VISIBILITY.PUBLIC, maxCards: -1, ownerCanSeeContents: true, opponentCanSeeCount: true },
  discard: { name: 'Discard', ordered: true, defaultVisibility: VISIBILITY.PUBLIC, maxCards: -1, ownerCanSeeContents: true, opponentCanSeeCount: true },
  stadium: { name: 'Stadium', ordered: false, defaultVisibility: VISIBILITY.PUBLIC, maxCards: -1, ownerCanSeeContents: true, opponentCanSeeCount: true, shared: true },
  staging: { name: 'Staging', ordered: false, defaultVisibility: VISIBILITY.PUBLIC, maxCards: -1, ownerCanSeeContents: true, opponentCanSeeCount: true },
};

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
const STADIUM_CARD = 'sv5-156'; // A Stadium trainer card

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
  pm.register(pokemonHooksPlugin);
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
  const zone = state.zones[`player${playerIndex}_${zoneId}`];
  const card = createCardInstance(template, instanceId, zone.config.defaultVisibility);
  zone.cards.push(card);
  return instanceId;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('warnOneSupporter', () => {
  it('blocks AI second Supporter play (hand → staging) this turn', () => {
    const { state, gameLoop, blocked } = setupGame();

    const tierno = placeCard(state, 0, 'hand', TIERNO);
    gameLoop.submit({ ...moveCard(0, tierno, 'player0_hand', 'player0_staging'), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);

    const trevor = placeCard(state, 0, 'hand', TREVOR);
    gameLoop.submit({ ...moveCard(0, trevor, 'player0_hand', 'player0_staging'), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('Already played a Supporter');
  });

  it('warns but allows UI second Supporter play this turn', () => {
    const { state, gameLoop, blocked } = setupGame();

    const tierno = placeCard(state, 0, 'hand', TIERNO);
    gameLoop.submit(moveCard(0, tierno, 'player0_hand', 'player0_staging'));
    gameLoop.processNext();

    const trevor = placeCard(state, 0, 'hand', TREVOR);
    gameLoop.submit(moveCard(0, trevor, 'player0_hand', 'player0_staging'));
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);
    expect(state.log.some(l => l.includes('Already played a Supporter'))).toBe(true);
  });

  it('allows second Supporter with allowed_by_effect', () => {
    const { state, gameLoop, blocked } = setupGame();

    const tierno = placeCard(state, 0, 'hand', TIERNO);
    gameLoop.submit(moveCard(0, tierno, 'player0_hand', 'player0_staging'));
    gameLoop.processNext();

    const trevor = placeCard(state, 0, 'hand', TREVOR);
    gameLoop.submit({ ...moveCard(0, trevor, 'player0_hand', 'player0_staging'), allowed_by_effect: true });
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);
  });

  it('does not count Supporter moved to discard as played', () => {
    const { state, gameLoop, blocked } = setupGame();

    // Discard a supporter (e.g. card effect) — should NOT count
    const tierno = placeCard(state, 0, 'hand', TIERNO);
    gameLoop.submit({ ...moveCard(0, tierno, 'player0_hand', 'player0_discard'), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);

    // Now actually play a supporter to staging — should be allowed
    const trevor = placeCard(state, 0, 'hand', TREVOR);
    gameLoop.submit({ ...moveCard(0, trevor, 'player0_hand', 'player0_staging'), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);
  });
});

describe('warnOneEnergyAttachment', () => {
  it('blocks AI second energy attachment to field zone', () => {
    const { state, gameLoop, blocked } = setupGame();

    // Need a pokemon on active and bench to attach to
    placeCard(state, 0, 'active', PIDGEY);
    placeCard(state, 0, 'bench_1', JIGGLYPUFF);

    const energy1 = placeCard(state, 0, 'hand', FAIRY_ENERGY);
    gameLoop.submit({ ...moveCard(0, energy1, 'player0_hand', 'player0_active', 0), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);

    const energy2 = placeCard(state, 0, 'hand', FAIRY_ENERGY);
    gameLoop.submit({ ...moveCard(0, energy2, 'player0_hand', 'player0_bench_1', 0), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('Already attached an Energy');
  });

  it('allows energy to non-field zone', () => {
    const { state, gameLoop, blocked } = setupGame();

    const energy1 = placeCard(state, 0, 'hand', FAIRY_ENERGY);
    gameLoop.submit(moveCard(0, energy1, 'player0_hand', 'player0_active', 0));
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);

    const energy2 = placeCard(state, 0, 'hand', FAIRY_ENERGY);
    gameLoop.submit(moveCard(0, energy2, 'player0_hand', 'player0_discard'));
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);
  });
});

describe('warnEvolutionChain', () => {
  it('blocks AI evolution with wrong pre-evolution', () => {
    const { state, gameLoop, blocked } = setupGame();

    placeCard(state, 0, 'active', JIGGLYPUFF);
    const pidgeotto = placeCard(state, 0, 'hand', PIDGEOTTO);
    gameLoop.submit({ ...moveCard(0, pidgeotto, 'player0_hand', 'player0_active'), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('no Pidgey found');
  });

  it('allows evolution with correct pre-evolution', () => {
    const { state, gameLoop, blocked } = setupGame();

    placeCard(state, 0, 'active', PIDGEY);
    const pidgeotto = placeCard(state, 0, 'hand', PIDGEOTTO);
    gameLoop.submit(moveCard(0, pidgeotto, 'player0_hand', 'player0_active'));
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);
  });

  it('blocks AI Stage 1 move_card to zone with wrong pre-evolution', () => {
    const { state, gameLoop, blocked } = setupGame();

    placeCard(state, 0, 'active', JIGGLYPUFF);
    const pidgeotto = placeCard(state, 0, 'hand', PIDGEOTTO);
    gameLoop.submit({ ...moveCard(0, pidgeotto, 'player0_hand', 'player0_active'), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('no Pidgey found');
  });

  it('allows Stage 1 move_card to zone with correct pre-evolution', () => {
    const { state, gameLoop, blocked } = setupGame();

    placeCard(state, 0, 'active', PIDGEY);
    const pidgeotto = placeCard(state, 0, 'hand', PIDGEOTTO);
    gameLoop.submit(moveCard(0, pidgeotto, 'player0_hand', 'player0_active'));
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);
  });

  it('skips evolution check for non-field zones', () => {
    const { state, gameLoop, blocked } = setupGame();

    const pidgeotto = placeCard(state, 0, 'hand', PIDGEOTTO);
    gameLoop.submit(moveCard(0, pidgeotto, 'player0_hand', 'player0_discard'));
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);
  });
});

describe('warnEvolutionTiming', () => {
  it('blocks AI evolution on turn 1', () => {
    const { state, gameLoop, blocked } = setupGame();
    state.turnNumber = 1;
    state.currentTurn.number = 1;

    placeCard(state, 0, 'active', PIDGEY);
    const pidgeotto = placeCard(state, 0, 'hand', PIDGEOTTO);
    gameLoop.submit({ ...moveCard(0, pidgeotto, 'player0_hand', 'player0_active'), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('Cannot evolve on the first turn');
  });

  it('blocks AI evolution on Pokemon played this turn', () => {
    const { state, gameLoop, blocked } = setupGame();

    // Place Pidgey in active with played_this_turn flag
    const pidgeyTemplate = getTemplate(PIDGEY)!;
    const pidgeyId = generateInstanceId();
    const activeZone = state.zones['player0_active'];
    const pidgeyCard = createCardInstance(pidgeyTemplate, pidgeyId, activeZone.config.defaultVisibility);
    pidgeyCard.flags.push('played_this_turn');
    activeZone.cards.push(pidgeyCard);

    const pidgeotto = placeCard(state, 0, 'hand', PIDGEOTTO);
    gameLoop.submit({ ...moveCard(0, pidgeotto, 'player0_hand', 'player0_active'), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('Cannot evolve on the first turn or the turn a Pokemon was played');
  });
});

describe('warnCountersOnTrainers', () => {
  it('blocks AI damage counter on Trainer card', () => {
    const { state, gameLoop, blocked } = setupGame();

    const potion = placeCard(state, 0, 'active', POTION);
    gameLoop.submit({ ...addCounter(0, potion, '10', 1), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('Cannot place 10 counters on a Trainer');
  });
});

describe('warnNonBasicToEmptyField', () => {
  it('blocks AI Stage 1 to empty field zone', () => {
    const { state, gameLoop, blocked } = setupGame();

    const pidgeotto = placeCard(state, 0, 'hand', PIDGEOTTO);
    gameLoop.submit({ ...moveCard(0, pidgeotto, 'player0_hand', 'player0_active'), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('Cannot place Pidgeotto');
    expect(blocked[0].reason).toContain('on empty active');
  });

  it('allows Basic Pokemon to empty field zone', () => {
    const { state, gameLoop, blocked } = setupGame();

    const pidgey = placeCard(state, 0, 'hand', PIDGEY);
    gameLoop.submit(moveCard(0, pidgey, 'player0_hand', 'player0_active'));
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);
  });

  it('blocks AI energy to empty field zone', () => {
    const { state, gameLoop, blocked } = setupGame();

    const energy = placeCard(state, 0, 'hand', FAIRY_ENERGY);
    gameLoop.submit({ ...moveCard(0, energy, 'player0_hand', 'player0_active'), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('on empty active');
    expect(blocked[0].reason).toContain('Only Basic Pokemon');
  });

  it('blocks AI trainer to empty field zone', () => {
    const { state, gameLoop, blocked } = setupGame();

    const potion = placeCard(state, 0, 'hand', POTION);
    gameLoop.submit({ ...moveCard(0, potion, 'player0_hand', 'player0_active'), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('on empty active');
    expect(blocked[0].reason).toContain('Only Basic Pokemon');
  });

  it('blocks AI Stage 1 via move_card_stack to empty field zone', () => {
    const { state, gameLoop, blocked } = setupGame();

    const pidgeotto = placeCard(state, 0, 'hand', PIDGEOTTO);
    gameLoop.submit({ ...moveCardStack(0, [pidgeotto], 'player0_hand', 'player0_active'), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('Cannot place Pidgeotto');
    expect(blocked[0].reason).toContain('on empty active');
  });
});

describe('warnOneEnergyAttachment (same-zone)', () => {
  it('does not trigger warning for same-zone energy rearrangement', () => {
    const { state, gameLoop, blocked } = setupGame();

    placeCard(state, 0, 'active', PIDGEY);
    const energy = placeCard(state, 0, 'active', FAIRY_ENERGY);

    // Move energy within the same zone (rearrange)
    gameLoop.submit({ ...moveCard(0, energy, 'player0_active', 'player0_active'), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);
  });
});

// Array convention: index 0 = visual bottom, end of array = visual top.
// Energy at position 0 (visual bottom, underneath Pokemon) is correct.
// Energy at end of array (visual top, on top of Pokemon) should warn.
describe('warnEnergyOnTopOfPokemon', () => {
  it('allows energy at position 0 (visual bottom, underneath Pokemon)', () => {
    const { state, gameLoop, blocked } = setupGame();

    placeCard(state, 0, 'active', PIDGEY);
    const energy = placeCard(state, 0, 'hand', FAIRY_ENERGY);

    // position 0 = visual bottom = underneath = correct for energy
    gameLoop.submit({ ...moveCard(0, energy, 'player0_hand', 'player0_active', 0), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);
  });

  it('blocks AI energy with no position (appends to top of stack)', () => {
    const { state, gameLoop, blocked } = setupGame();

    placeCard(state, 0, 'active', PIDGEY);
    const energy = placeCard(state, 0, 'hand', FAIRY_ENERGY);

    // No position = append to end = visual top = on top of Pokemon
    gameLoop.submit({ ...moveCard(0, energy, 'player0_hand', 'player0_active'), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('Cannot place energy on top of Pokemon');
  });

  it('blocks AI energy move_card_stack with no position (appends to top)', () => {
    const { state, gameLoop, blocked } = setupGame();

    placeCard(state, 0, 'active', PIDGEY);
    const energy = placeCard(state, 0, 'hand', FAIRY_ENERGY);

    // No position = append to end = visual top
    gameLoop.submit({ ...moveCardStack(0, [energy], 'player0_hand', 'player0_active'), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('Cannot place energy on top of Pokemon');
  });
});

describe('warnStadiumOnly', () => {
  it('blocks AI non-stadium card to stadium zone via move_card', () => {
    const { state, gameLoop, blocked } = setupGame();

    const energy = placeCard(state, 0, 'hand', FAIRY_ENERGY);
    gameLoop.submit({ ...moveCard(0, energy, 'player0_hand', 'player0_stadium'), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('Only Stadium cards');
  });

  it('blocks AI non-stadium card to stadium zone via move_card', () => {
    const { state, gameLoop, blocked } = setupGame();

    const pidgey = placeCard(state, 0, 'hand', PIDGEY);
    gameLoop.submit({ ...moveCard(0, pidgey, 'player0_hand', 'player0_stadium'), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('Only Stadium cards');
  });

  it('blocks AI non-stadium card to stadium zone via move_card_stack', () => {
    const { state, gameLoop, blocked } = setupGame();

    const potion = placeCard(state, 0, 'hand', POTION);
    gameLoop.submit({ ...moveCardStack(0, [potion], 'player0_hand', 'player0_stadium'), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain('Only Stadium cards');
  });

  it('allows stadium card to stadium zone', () => {
    const { state, gameLoop, blocked } = setupGame();

    const stadium = placeCard(state, 0, 'hand', STADIUM_CARD);
    gameLoop.submit(moveCard(0, stadium, 'player0_hand', 'player0_stadium'));
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);
  });
});

// Note: opponent zone checks are now in the core engine (checkOpponentZone),
// tested in the core test suite. The GameLoop applies them automatically.
