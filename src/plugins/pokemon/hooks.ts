import type { Action, GameState, DeclareAction } from '../../core/types';
import { VISIBILITY, ACTION_TYPES, PHASES, CARD_FLAGS } from '../../core/types';
import type { PostHookResult, Plugin, PrioritizedPostHook } from '../../core/plugin/types';
import type { PokemonCardTemplate } from './cards';
import { getTemplate } from './cards';
import { findCardInZones, consolidateCountersToTop } from '../../core/engine';
import { unpackMoveAction } from '../../core/action-utils';
import { gameLog, systemLog } from '../../core/game-log';
import {
  isEnergy,
  isBasicPokemon,
  isStage1,
  isStage2,
  isTool,
  isBreakPokemon,
  isFieldZone,
  isGXAttack,
  isGXAttackByName,
  isVSTARPower,
  isVSTARAttack,
} from './helpers';
import { ZONE_IDS } from './zones';
import type { ReadableGameState } from '../../core/readable';
import { formatNarrativeState } from './narrative';
import {
  SUPERTYPES,
  DAMAGE_COUNTER_VALUES,
  DEGREES_TO_STATUS,
  POKEMON_DECLARATION_TYPES,
} from './constants';
import { getPluginState } from './plugin-state';

type PokemonState = Readonly<GameState<PokemonCardTemplate>>;

function getTemplateForCard(state: PokemonState, cardInstanceId: string): PokemonCardTemplate | null {
  const result = findCardInZones(state, cardInstanceId);
  if (!result) return null;
  return getTemplate(result.card.template.id) ?? null;
}

// ── Post-Hooks: Move Card Effects ───────────────────────────────────

// Stamp PLAYED_THIS_TURN on cards placed from hand onto field zones.
// This powers warnEvolutionTiming — a Pokemon played this turn cannot evolve.
function stampPlayedThisTurn(state: PokemonState, action: Action): PostHookResult {
  const move = unpackMoveAction(action);
  if (!move) return {};
  if (!move.fromZone.endsWith('_hand') || !isFieldZone(move.toZone)) return {};

  const mutableState = state as GameState<PokemonCardTemplate>;
  const zone = mutableState.zones[move.toZone];
  if (!zone) return {};

  for (const id of move.allCardIds) {
    const card = zone.cards.find(c => c.instanceId === id);
    if (!card || card.flags.includes(CARD_FLAGS.PLAYED_THIS_TURN)) continue;
    const template = getTemplateForCard(state, card.instanceId);
    if (template?.supertype !== SUPERTYPES.POKEMON) continue;
    card.flags.push(CARD_FLAGS.PLAYED_THIS_TURN);
  }

  return {};
}

// During setup, cards placed on field zones are face-down (hidden from both players)
function setupFaceDown(state: PokemonState, action: Action): PostHookResult {
  if (state.phase !== PHASES.SETUP) return {};

  const move = unpackMoveAction(action);
  if (!move || !isFieldZone(move.toZone)) return {};

  const mutableState = state as GameState<PokemonCardTemplate>;
  const zone = mutableState.zones[move.toZone];
  if (!zone) return {};

  for (const id of move.allCardIds) {
    const card = zone.cards.find(c => c.instanceId === id);
    if (card) card.visibility = VISIBILITY.HIDDEN;
  }

  return {};
}

// Log trainer card text when played to staging
function logTrainerText(state: PokemonState, action: Action): PostHookResult {
  const move = unpackMoveAction(action);
  if (!move) return {};
  if (!move.fromZone.endsWith('_hand') || move.toZone !== 'staging') return {};

  const template = getTemplateForCard(state, move.cardId);
  if (!template || template.supertype !== SUPERTYPES.TRAINER) return {};

  if (template.rules && template.rules.length > 0) {
    const header = `[${template.name}]`;
    const text = template.rules.join(' ');
    gameLog(state as GameState<PokemonCardTemplate>, `${header} ${text}`);
  }

  return {};
}

// Re-arrange cards in field zones to maintain proper stacking order.
// Visual bottom (index 0) → top (end): Tools, Energy, Basic, Stage 1, Stage 2.
function reorderFieldZone(state: PokemonState, action: Action): PostHookResult {
  const move = unpackMoveAction(action);
  if (!move || !isFieldZone(move.toZone)) return {};

  const mutableState = state as GameState<PokemonCardTemplate>;
  const zone = mutableState.zones[move.toZone];
  if (!zone || zone.cards.length <= 1) return {};

  function sortWeight(card: { template: PokemonCardTemplate }): number {
    const t = getTemplate(card.template.id);
    if (!t) return 2;
    if (isTool(t)) return 0;
    if (isEnergy(t)) return 1;
    if (isBasicPokemon(t)) return 2;
    if (isStage1(t)) return 3;
    if (isStage2(t)) return 4;
    if (isBreakPokemon(t)) return 5;
    return 2;
  }

  zone.cards.sort((a, b) => sortWeight(a) - sortWeight(b));

  return {};
}

// Re-consolidate counters to top card after reorder
function consolidateCountersAfterReorder(state: PokemonState, action: Action): PostHookResult {
  const move = unpackMoveAction(action);
  if (!move || !isFieldZone(move.toZone)) return {};

  const mutableState = state as GameState<PokemonCardTemplate>;
  const zone = mutableState.zones[move.toZone];
  if (!zone) return {};

  consolidateCountersToTop(zone);
  return {};
}

// Log Pokemon-specific mulligan message (opponent draws extra)
function logMulliganMessage(state: PokemonState, action: Action): PostHookResult {
  if (action.type !== ACTION_TYPES.MULLIGAN) return {};
  const otherPlayer = action.player === 0 ? 2 : 1;
  systemLog(state as GameState<PokemonCardTemplate>,
    `Player ${action.player + 1} mulliganed. Don't forget to draw 1 extra card Player ${otherPlayer}!`
  );
  return {};
}

// ── Declare Action Hooks ─────────────────────────────────────────

/** Post-hook: auto-flip GX/VSTAR marker when the corresponding action succeeds. */
function autoFlipMarkerOnDeclare(state: PokemonState, action: Action): PostHookResult {
  if (action.type !== ACTION_TYPES.DECLARE_ACTION) return {};
  const da = action as DeclareAction;
  const mutableState = state as GameState<PokemonCardTemplate>;
  const ps = getPluginState(mutableState);

  if (da.declarationType === POKEMON_DECLARATION_TYPES.ATTACK) {
    const activeKey = `player${da.player + 1}_${ZONE_IDS.ACTIVE}`;
    const topCard = mutableState.zones[activeKey]?.cards.at(-1);
    const template = topCard ? getTemplate((topCard.template as PokemonCardTemplate).id) : undefined;
    const attack = template?.attacks?.find(a => a.name.toLowerCase() === da.name.toLowerCase());
    if (attack) {
      if ((isGXAttack(attack) || isGXAttackByName(attack.name)) && !ps.gxUsed[da.player]) {
        ps.gxUsed[da.player] = true;
        gameLog(mutableState, `Player ${da.player + 1} used their GX attack!`);
      }
      if (isVSTARAttack(attack) && !ps.vstarUsed[da.player]) {
        ps.vstarUsed[da.player] = true;
        gameLog(mutableState, `Player ${da.player + 1} used their VSTAR Power!`);
      }
    }
  }

  if (da.declarationType === POKEMON_DECLARATION_TYPES.ABILITY) {
    const cardName = (da.metadata as any)?.cardName as string | undefined;
    if (cardName) {
      for (const zone of Object.values(mutableState.zones)) {
        for (const card of zone.cards) {
          if (card.template.name === cardName) {
            const template = getTemplate((card.template as PokemonCardTemplate).id);
            const ability = template?.abilities?.find(a => a.name.toLowerCase() === da.name.toLowerCase());
            if (ability && isVSTARPower(ability) && !ps.vstarUsed[da.player]) {
              ps.vstarUsed[da.player] = true;
              gameLog(mutableState, `Player ${da.player + 1} used their VSTAR Power!`);
            }
            break;
          }
        }
      }
    }
  }

  return {};
}

/** Post-hook: log attack/ability effect text after declaration. */
function logDeclareEffectText(state: PokemonState, action: Action): PostHookResult {
  if (action.type !== ACTION_TYPES.DECLARE_ACTION) return {};
  const da = action as DeclareAction;
  const mutableState = state as GameState<PokemonCardTemplate>;

  if (da.declarationType === POKEMON_DECLARATION_TYPES.ATTACK) {
    const activeKey = `player${da.player + 1}_${ZONE_IDS.ACTIVE}`;
    const topCard = mutableState.zones[activeKey]?.cards.at(-1);
    if (topCard) {
      const template = getTemplate((topCard.template as PokemonCardTemplate).id);
      const attack = template?.attacks?.find(a => a.name.toLowerCase() === da.name.toLowerCase());
      if (attack?.effect) {
        gameLog(mutableState, `[${attack.name}] ${attack.effect}`);
      }
    }
  } else if (da.declarationType === POKEMON_DECLARATION_TYPES.ABILITY) {
    const cardName = (da.metadata as any)?.cardName as string | undefined;
    if (cardName) {
      for (const zone of Object.values(mutableState.zones)) {
        for (const card of zone.cards) {
          if (card.template.name === cardName) {
            const template = getTemplate((card.template as PokemonCardTemplate).id);
            const ability = template?.abilities?.find(a => a.name.toLowerCase() === da.name.toLowerCase());
            if (ability?.effect) {
              gameLog(mutableState, `[${ability.name}] ${ability.effect}`);
            }
            return {};
          }
        }
      }
    }
  }

  return {};
}

// ── Readable State Modifier ──────────────────────────────────────

/**
 * Modify readable state for Pokemon TCG:
 * - Compute totalDamage from damage counters (10/50/100)
 * - Convert retreatCost from string[] to integer (count)
 */
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

      // Convert retreatCost from list to integer
      if (Array.isArray(card.retreatCost)) {
        card.retreatCost = card.retreatCost.length;
      }

      // Translate degree-based orientation to human-readable status field
      const orientation = card.orientation as string | undefined;
      if (orientation && DEGREES_TO_STATUS[orientation]) {
        card.status = DEGREES_TO_STATUS[orientation];
      }
      // Remove raw orientation — AI should use 'status' field instead
      delete card.orientation;
    }

    // Strip pre-evolved Pokemon from field zones — they're evolution stages
    // buried under the top Pokemon, irrelevant to AI decision-making.
    // Keeps top card (active Pokemon) and non-Pokemon (energy, tools).
    // Exception: BREAK keeps pre-evolution's attacks, so include the direct pre-evo.
    if (isFieldZone(zoneKey) && zone.cards.length > 1) {
      const topIdx = zone.cards.length - 1;
      const topCard = zone.cards[topIdx];
      const topIsBreak = topCard.supertype === SUPERTYPES.POKEMON &&
        (topCard.subtypes as string[] ?? []).includes('BREAK');

      zone.cards = zone.cards.filter((card, i) => {
        if (i === topIdx) return true;
        if (card.supertype !== SUPERTYPES.POKEMON) return true;
        // Keep the highest-index non-BREAK Pokemon under a BREAK top
        if (topIsBreak) {
          const isHighestPreEvo = !zone.cards.slice(i + 1, topIdx).some(c =>
            c.supertype === SUPERTYPES.POKEMON && !(c.subtypes as string[] ?? []).includes('BREAK')
          );
          return isHighestPreEvo;
        }
        return false;
      });
      zone.count = zone.cards.length;
    }
  }
  return readable;
}

// ── Hook Registration ────────────────────────────────────────────
// Zero pre-hooks — every rule has card effect exceptions.
// AI legality handled by prompts/narrative state.

const MOVE_POST_HOOKS: PrioritizedPostHook<PokemonCardTemplate>[] = [
  { hook: setupFaceDown, priority: 50 },
  { hook: stampPlayedThisTurn, priority: 60 },
  { hook: logTrainerText, priority: 100 },
  { hook: reorderFieldZone, priority: 200 },
  { hook: consolidateCountersAfterReorder, priority: 250 },
];

export const pokemonHooksPlugin: Plugin<PokemonCardTemplate> = {
  id: 'pokemon-hooks',
  name: 'Pokemon TCG Hooks',
  version: '1.0.0',
  readableStateModifier: modifyReadableState,
  readableStateFormatter: formatNarrativeState,
  postHooks: {
    [ACTION_TYPES.MOVE_CARD]: MOVE_POST_HOOKS,
    [ACTION_TYPES.MOVE_CARD_STACK]: MOVE_POST_HOOKS,
    [ACTION_TYPES.MULLIGAN]: [
      { hook: logMulliganMessage, priority: 100 },
    ],
    [ACTION_TYPES.DECLARE_ACTION]: [
      { hook: autoFlipMarkerOnDeclare, priority: 50 },
      { hook: logDeclareEffectText, priority: 100 },
    ],
  },
  // No pre-hooks — all rules enforcement handled by AI via prompts
  preHooks: {},
};
