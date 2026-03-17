import type { Action } from '../../core/types/action';
import type { GameState } from '../../core/types/game';
import { VISIBILITY } from '../../core/types/card';
import { ACTION_TYPES, PHASES, CARD_FLAGS } from '../../core/types/constants';
import type { PostHookResult, Plugin, PrioritizedPostHook } from '../../core/plugin/types';
import type { PocketCardTemplate } from './types';
import { consolidateCountersToTop } from '../../core/engine';
import { unpackMoveAction } from '../../core/action-utils';
import { systemLog } from '../../core/game-log';
import {
  isBasicPokemon,
  isStage1,
  isStage2,
  isFieldZone,
} from './helpers';
import type { ReadableGameState } from '../../core/readable';
import { formatNarrativeState } from './narrative';
import {
  SUPERTYPES,
  DAMAGE_COUNTER_VALUES,
  DEGREES_TO_STATUS,
} from './constants';
import { getPluginState, advanceEnergyZone, seedEnergyZone } from './plugin-state';

type PocketState = Readonly<GameState<PocketCardTemplate>>;

// ── Post-Hooks: Move Card Effects ───────────────────────────────────

// Stamp PLAYED_THIS_TURN on cards placed from hand onto field zones.
function stampPlayedThisTurn(state: PocketState, action: Action): PostHookResult {
  const move = unpackMoveAction(action);
  if (!move) return {};
  if (!move.fromZone.endsWith('_hand') || !isFieldZone(move.toZone)) return {};

  const mutableState = state as GameState<PocketCardTemplate>;
  const zone = mutableState.zones[move.toZone];
  if (!zone) return {};

  for (const id of move.allCardIds) {
    const card = zone.cards.find(c => c.instanceId === id);
    if (!card || card.flags.includes(CARD_FLAGS.PLAYED_THIS_TURN)) continue;
    const template = card.template as PocketCardTemplate;
    if (template?.supertype !== SUPERTYPES.POKEMON) continue;
    card.flags.push(CARD_FLAGS.PLAYED_THIS_TURN);
  }

  return {};
}

// During setup, cards placed on field zones are face-down
function setupFaceDown(state: PocketState, action: Action): PostHookResult {
  if (state.phase !== PHASES.SETUP) return {};

  const move = unpackMoveAction(action);
  if (!move || !isFieldZone(move.toZone)) return {};

  const mutableState = state as GameState<PocketCardTemplate>;
  const zone = mutableState.zones[move.toZone];
  if (!zone) return {};

  for (const id of move.allCardIds) {
    const card = zone.cards.find(c => c.instanceId === id);
    if (card) card.visibility = VISIBILITY.HIDDEN;
  }

  return {};
}

// Re-arrange cards in field zones: Items at bottom, Basic, Stage 1, Stage 2 on top
function reorderFieldZone(state: PocketState, action: Action): PostHookResult {
  const move = unpackMoveAction(action);
  if (!move || !isFieldZone(move.toZone)) return {};

  const mutableState = state as GameState<PocketCardTemplate>;
  const zone = mutableState.zones[move.toZone];
  if (!zone || zone.cards.length <= 1) return {};

  function sortWeight(card: { template: PocketCardTemplate }): number {
    const t = card.template;
    if (!t) return 2;
    if (t.supertype === SUPERTYPES.TRAINER) return 0;
    if (isBasicPokemon(t)) return 2;
    if (isStage1(t)) return 3;
    if (isStage2(t)) return 4;
    return 2;
  }

  zone.cards.sort((a, b) => sortWeight(a) - sortWeight(b));

  return {};
}

// Re-consolidate counters to top card after reorder
function consolidateCountersAfterReorder(state: PocketState, action: Action): PostHookResult {
  const move = unpackMoveAction(action);
  if (!move || !isFieldZone(move.toZone)) return {};

  const mutableState = state as GameState<PocketCardTemplate>;
  const zone = mutableState.zones[move.toZone];
  if (!zone) return {};

  consolidateCountersToTop(zone);
  return {};
}

// ── Post-Hooks: Start Turn ───────────────────────────────────────────

/**
 * Manage the energy zone at the start of each turn.
 * - Turn 1: seed both players' "next" preview (no current energy on turn 1 per Pocket rules)
 * - Turn 2+: advance the active player's zone (next → current, roll new next)
 * Uses deterministic seeds so both P2P peers compute identical results.
 */
function advanceEnergyOnStartTurn(state: PocketState, action: Action): PostHookResult {
  if (action.type !== ACTION_TYPES.START_TURN) return {};
  console.log('[advanceEnergy] phase:', state.phase, 'turnNumber:', state.turnNumber, 'activePlayer:', state.activePlayer);
  if (state.phase !== PHASES.PLAYING) return {};

  const mutableState = state as GameState<PocketCardTemplate>;
  const ps = getPluginState(mutableState);

  if (state.turnNumber === 1) {
    // Turn 1: seed both players with a "next" preview only (no current)
    console.log('[advanceEnergy] SEEDING both players');
    seedEnergyZone(ps, 0, 100);
    seedEnergyZone(ps, 1, 101);
    console.log('[advanceEnergy] AFTER seed', JSON.stringify(ps.energyZone));
    return {};
  }

  // Turn 2+: advance active player's zone
  const seed = state.turnNumber * 100 + state.activePlayer;
  console.log('[advanceEnergy] BEFORE advance P' + state.activePlayer, JSON.stringify(ps.energyZone));
  advanceEnergyZone(ps, state.activePlayer, seed);
  console.log('[advanceEnergy] AFTER advance P' + state.activePlayer, JSON.stringify(ps.energyZone));

  return {};
}

// ── Post-Hooks: End Turn ────────────────────────────────────────────

/** Post-hook: when setup transitions to playing, flip all field Pokemon face-up. */
function flipFieldFaceUpOnSetupComplete(state: PocketState, action: Action): PostHookResult {
  if (action.type !== ACTION_TYPES.END_TURN) return {};
  if (state.phase !== PHASES.PLAYING || state.turnNumber !== 1) return {};

  for (const [zoneKey, zone] of Object.entries(state.zones)) {
    if (isFieldZone(zoneKey)) {
      for (const card of zone.cards) {
        card.visibility = VISIBILITY.PUBLIC;
      }
    }
  }
  systemLog(state, 'All Pokemon flipped face-up!');
  return {};
}

// ── Readable State Modifier ──────────────────────────────────────

export function modifyReadableState(
  readable: ReadableGameState,
): ReadableGameState {
  for (const [zoneKey, zone] of Object.entries(readable.zones)) {
    for (const card of zone.cards) {
      // Auto-count total damage from damage counters
      const counters = card.counters as Record<string, number> | undefined;
      if (counters) {
        let total = 0;
        for (const [id, value] of Object.entries(DAMAGE_COUNTER_VALUES)) {
          if (counters[id]) total += counters[id] * value;
        }
        if (total > 0) card.totalDamage = total;
      }

      // Convert retreatCost from list to integer if needed
      if (Array.isArray(card.retreatCost)) {
        card.retreatCost = card.retreatCost.length;
      }

      // Translate degree-based orientation to human-readable status
      const orientation = card.orientation as string | undefined;
      if (orientation && DEGREES_TO_STATUS[orientation]) {
        card.status = DEGREES_TO_STATUS[orientation];
      }
      delete card.orientation;
    }

    // Strip pre-evolved Pokemon from field zones
    if (isFieldZone(zoneKey) && zone.cards.length > 1) {
      const topIdx = zone.cards.length - 1;
      zone.cards = zone.cards.filter((card, i) =>
        i === topIdx || card.supertype !== SUPERTYPES.POKEMON
      );
      zone.count = zone.cards.length;
    }
  }
  return readable;
}

// ── Hook Registration ────────────────────────────────────────────

const MOVE_POST_HOOKS: PrioritizedPostHook<PocketCardTemplate>[] = [
  { hook: setupFaceDown, priority: 50 },
  { hook: stampPlayedThisTurn, priority: 60 },
  { hook: reorderFieldZone, priority: 200 },
  { hook: consolidateCountersAfterReorder, priority: 250 },
];

export const pocketHooksPlugin: Plugin<PocketCardTemplate> = {
  id: 'pokemon-pocket-hooks',
  name: 'Pokemon Pocket Hooks',
  version: '1.0.0',
  readableStateModifier: modifyReadableState,
  readableStateFormatter: formatNarrativeState,
  postHooks: {
    [ACTION_TYPES.MOVE_CARD]: MOVE_POST_HOOKS,
    [ACTION_TYPES.MOVE_CARD_STACK]: MOVE_POST_HOOKS,
    [ACTION_TYPES.START_TURN]: [
      { hook: advanceEnergyOnStartTurn, priority: 100 },
    ],
    [ACTION_TYPES.END_TURN]: [
      { hook: flipFieldFaceUpOnSetupComplete, priority: 100 },
    ],
  },
  preHooks: {},
};
