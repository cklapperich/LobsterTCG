import type { Action } from '../../core/types/action';
import type { GameState } from '../../core/types/game';
import { VISIBILITY } from '../../core/types/card';
import { ACTION_TYPES, PHASES, CARD_FLAGS } from '../../core/types/constants';
import type { PostHookResult, PreHookResult, Plugin, PrioritizedPostHook } from '../../core/plugin/types';
import type { PocketCardTemplate } from './types';
import { consolidateCountersToTop } from '../../core/engine';
import { unpackMoveAction } from '../../core/action-utils';
import { addZoneCounter } from '../../core/action';
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
  POCKET_DECLARATION_TYPES,
  POINTS_TO_WIN,
  ENERGY_COUNTER_TYPES,
} from './constants';
import { ZONE_IDS } from './zones';
import { getPluginState, advanceEnergyZone } from './plugin-state';

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
 * - Turn 1: skip (both players' "next" already seeded at deck load)
 * - Turn 2+: advance the active player's zone (next → current, roll new next)
 * Uses the random seed from the StartTurnAction so both P2P peers produce identical results.
 */
function advanceEnergyOnStartTurn(state: PocketState, action: Action): PostHookResult {
  if (action.type !== ACTION_TYPES.START_TURN) return {};
  console.log('[advanceEnergy] phase:', state.phase, 'turnNumber:', state.turnNumber, 'activePlayer:', state.activePlayer);
  if (state.phase !== PHASES.PLAYING) return {};

  // Turn 1: no advance — both players already have "next" seeded from deck load
  if (state.turnNumber === 1) {
    console.log('[advanceEnergy] Turn 1 — skipping (next already seeded at deck load)');
    return {};
  }

  // Turn 2+: advance active player's zone (next → current, roll new next)
  const mutableState = state as GameState<PocketCardTemplate>;
  const ps = getPluginState(mutableState);
  const seed = (action as import('../../core/types/action').StartTurnAction).seed;
  console.log('[advanceEnergy] BEFORE advance P' + state.activePlayer, JSON.stringify(ps.energyZone));
  advanceEnergyZone(ps, state.activePlayer, seed);
  console.log('[advanceEnergy] AFTER advance P' + state.activePlayer, JSON.stringify(ps.energyZone));

  return {};
}

// ── Post-Hooks: Declare Action ──────────────────────────────────────

/** Post-hook: apply point mutation when award_points is declared. */
function applyAwardPoints(state: PocketState, action: Action): PostHookResult {
  if (action.type !== ACTION_TYPES.DECLARE_ACTION) return {};
  if ((action as any).declarationType !== POCKET_DECLARATION_TYPES.AWARD_POINTS) return {};

  const meta = (action as any).metadata as { targetPlayer: number; amount: number } | undefined;
  if (!meta) return {};

  const mutableState = state as GameState<PocketCardTemplate>;
  const ps = getPluginState(mutableState);
  ps.points[meta.targetPlayer] += meta.amount;
  systemLog(state, `Player ${meta.targetPlayer + 1} now has ${ps.points[meta.targetPlayer]}/${POINTS_TO_WIN} points.`);

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

// Set of all energy counter type strings for quick lookup
const ENERGY_COUNTER_TYPE_SET = new Set(Object.values(ENERGY_COUNTER_TYPES));

// ── Post-Hooks: Auto-Tally Energy on KO/Discard ─────────────────

/**
 * When Pokemon are moved from field zones to discard, tally their energy
 * counters into the owner's energy_discard zone. Uses prevState to read
 * counters before transferCountersOnRemoval clears them.
 */
function tallyEnergyOnDiscard(_state: PocketState, action: Action, prevState: PocketState): PostHookResult {
  const move = unpackMoveAction(action);
  if (!move) return {};
  if (!move.toZone.endsWith('_discard') || move.toZone.endsWith('_energy_discard')) return {};
  if (!isFieldZone(move.fromZone)) return {};

  const followUpActions: Action[] = [];
  const ownerPrefix = move.toZone.split('_')[0]; // "player1" or "player2"
  const energyDiscardKey = `${ownerPrefix}_${ZONE_IDS.ENERGY_DISCARD}`;
  const ownerIndex = ownerPrefix === 'player1' ? 0 : 1;

  // Read counters from ALL cards in the source zone in prevState (before move)
  const prevFromZone = prevState.zones[move.fromZone];
  if (!prevFromZone) return {};

  for (const cardId of move.allCardIds) {
    const prevCard = prevFromZone.cards.find(c => c.instanceId === cardId);
    if (!prevCard) continue;

    for (const [counterType, amount] of Object.entries(prevCard.counters)) {
      if (!ENERGY_COUNTER_TYPE_SET.has(counterType) || amount <= 0) continue;
      followUpActions.push(addZoneCounter(ownerIndex as 0 | 1, energyDiscardKey, counterType, amount));
    }
  }

  // Also check if counters were consolidated to the top card (transferCountersOnRemoval)
  // If the moved card was the top card, counters from below would have been transferred to it
  // before this hook runs. prevState captures the state before the move, so we already
  // have the correct counter values.

  return followUpActions.length > 0 ? { followUpActions } : {};
}

// ── Pre-Hooks: Redirect Energy Counters on Discard Pile ─────────

/**
 * If an energy counter is added to a card in the discard pile,
 * redirect it to the owner's energy_discard zone instead.
 */
function redirectEnergyOnDiscard(state: PocketState, action: Action): PreHookResult {
  if (action.type !== ACTION_TYPES.ADD_COUNTER) return { outcome: 'continue' as const };
  const { counterType, cardInstanceId } = action as import('../../core/types/action').AddCounterAction;

  if (!ENERGY_COUNTER_TYPE_SET.has(counterType)) return { outcome: 'continue' as const };

  // Find which zone the target card is in
  for (const [zoneKey, zone] of Object.entries(state.zones)) {
    if (!zoneKey.endsWith('_discard') || zoneKey.endsWith('_energy_discard')) continue;
    const found = zone.cards.some(c => c.instanceId === cardInstanceId);
    if (!found) continue;

    // Redirect to energy_discard
    const ownerPrefix = zoneKey.split('_')[0];
    const energyDiscardKey = `${ownerPrefix}_${ZONE_IDS.ENERGY_DISCARD}`;
    return {
      outcome: 'replace' as const,
      action: addZoneCounter(action.player, energyDiscardKey, counterType, (action as any).amount ?? 1),
    };
  }

  return { outcome: 'continue' as const };
}

/**
 * If a zone counter is added to a regular discard zone (not energy_discard),
 * redirect it to the owner's energy_discard zone.
 * This handles the case where a user drags a counter onto the discard pile background.
 */
function redirectZoneCounterOnDiscard(_state: PocketState, action: Action): PreHookResult {
  if (action.type !== ACTION_TYPES.ADD_ZONE_COUNTER) return { outcome: 'continue' as const };
  const { zoneKey, counterType, amount } = action as import('../../core/types/action').AddZoneCounterAction;

  // Only redirect for regular discard zones, not energy_discard
  if (!zoneKey.endsWith('_discard') || zoneKey.endsWith('_energy_discard')) {
    return { outcome: 'continue' as const };
  }

  const ownerPrefix = zoneKey.split('_')[0];
  const energyDiscardKey = `${ownerPrefix}_${ZONE_IDS.ENERGY_DISCARD}`;
  return {
    outcome: 'replace' as const,
    action: addZoneCounter(action.player, energyDiscardKey, counterType, amount),
  };
}

// ── Hook Registration ────────────────────────────────────────────

const MOVE_POST_HOOKS: PrioritizedPostHook<PocketCardTemplate>[] = [
  { hook: setupFaceDown, priority: 50 },
  { hook: stampPlayedThisTurn, priority: 60 },
  { hook: reorderFieldZone, priority: 200 },
  { hook: consolidateCountersAfterReorder, priority: 250 },
  { hook: tallyEnergyOnDiscard, priority: 300 },
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
    [ACTION_TYPES.DECLARE_ACTION]: [
      { hook: applyAwardPoints, priority: 100 },
    ],
    [ACTION_TYPES.END_TURN]: [
      { hook: flipFieldFaceUpOnSetupComplete, priority: 100 },
    ],
  },
  preHooks: {
    [ACTION_TYPES.ADD_COUNTER]: [
      { hook: redirectEnergyOnDiscard, priority: 100 },
    ],
    [ACTION_TYPES.ADD_ZONE_COUNTER]: [
      { hook: redirectZoneCounterOnDiscard, priority: 100 },
    ],
  },
};
