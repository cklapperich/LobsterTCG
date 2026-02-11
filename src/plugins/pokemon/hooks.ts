import type { Action, GameState, AddCounterAction, DeclareAction } from '../../core/types';
import { VISIBILITY, ACTION_TYPES, PHASES, CARD_FLAGS, ACTION_SOURCES } from '../../core/types';
import type { PreHookResult, PostHookResult, Plugin, PrioritizedPreHook, PrioritizedPostHook } from '../../core/plugin/types';
import type { PokemonCardTemplate } from './cards';
import { getTemplate } from './cards';
import { findCardInZones, consolidateCountersToTop } from '../../core/engine';
import { unpackMoveAction } from '../../core/action-utils';
import { gameLog, systemLog } from '../../core/game-log';
import {
  isSupporter,
  isEnergy,
  isEvolution,
  isBasicPokemon,
  isStage1,
  isStage2,
  isStadium,
  isTool,
  isFieldZone,
  isStadiumZone,
} from './helpers';
import { ZONE_IDS } from './zones';
import type { ReadableGameState } from '../../core/readable';
import { formatNarrativeState } from './narrative';
import {
  SUPERTYPES,
  DAMAGE_COUNTER_VALUES,
  DEGREES_TO_STATUS,
  TRAINER_BLOCKED_COUNTERS,
  FIRST_EVOLUTION_TURN,
  FIRST_SUPPORTER_TURN,
  POKEMON_DECLARATION_TYPES,
} from './constants';

type PokemonState = Readonly<GameState<PokemonCardTemplate>>;

// ── AI Enforcement Configuration ────────────────────────────────────
/**
 * Controls whether AI actions are blocked or warned for soft rule violations.
 * - 'strict': AI is blocked for ALL rule violations (safe, default for production)
 * - 'lenient': AI only gets warnings for soft rules; hard rules still block
 *
 * Hard rules = physically impossible plays (wrong evolution chain, etc.)
 * Soft rules = timing/count limits the AI might need flexibility on
 */
let _aiEnforcement: 'strict' | 'lenient' = 'lenient';

export function setAiEnforcement(mode: 'strict' | 'lenient') {
  _aiEnforcement = mode;
}
export function getAiEnforcement(): 'strict' | 'lenient' {
  return _aiEnforcement;
}

/**
 * Return 'block' for AI actions, 'warn' for UI actions (never block human players).
 * @param level 'hard' = always block AI regardless of config.
 *              'soft' = block AI only in strict mode, warn in lenient mode.
 *
 * When the outcome is 'block' (AI), appends guidance telling the AI the action
 * was not executed and to retry with allowed_by_card_effect=true if a card effect
 * permits it. When the outcome is 'warn', the action proceeds normally.
 */
function blockOrWarn(action: Action, reason: string, level: 'hard' | 'soft' = 'soft'): PreHookResult {
  const BLOCK_SUFFIX = ' This action was NOT executed. If a card effect permits this, retry with allowed_by_card_effect=true. Otherwise, undo your actions and try a different approach.';
  const WARN_SUFFIX = ' (Note: this was allowed to proceed. If a card effect permits this, pass allowed_by_card_effect=true next time to suppress this warning.)';

  if (action.source === ACTION_SOURCES.AI) {
    if (level === 'hard' || _aiEnforcement === 'strict') {
      return { outcome: 'block', reason: reason + BLOCK_SUFFIX };
    }
    return { outcome: 'warn', reason: reason + WARN_SUFFIX };
  }
  return { outcome: 'warn', reason };
}

function getTemplateForCard(state: PokemonState, cardInstanceId: string): PokemonCardTemplate | null {
  const result = findCardInZones(state, cardInstanceId);
  if (!result) return null;
  return getTemplate(result.card.template.id) ?? null;
}

// ── Pre-Hooks: Move Card Rules ──────────────────────────────────────

// Warning 1: Only one Supporter per turn
// Only hand → staging counts as "playing" a Supporter.
function isSupporterPlayed(state: PokemonState, action: Action): boolean {
  const move = unpackMoveAction(action);
  if (!move) return false;
  if (!move.fromZone.endsWith('_hand') || move.toZone !== 'staging') return false;
  const template = getTemplateForCard(state, move.cardId);
  return !!template && isSupporter(template);
}

function warnOneSupporter(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_card_effect) return { outcome: 'continue' };
  if (!isSupporterPlayed(state, action)) return { outcome: 'continue' };

  for (const prev of state.currentTurn.actions) {
    if (isSupporterPlayed(state, prev)) {
      return blockOrWarn(action, 'Already played a Supporter this turn (limit 1).', 'hard');
    }
  }

  return { outcome: 'continue' };
}

// Warning 1b: No Supporters on first turn
function warnNoSupporterFirstTurn(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_card_effect) return { outcome: 'continue' };
  if (!isSupporterPlayed(state, action)) return { outcome: 'continue' };

  if (state.turnNumber <= FIRST_SUPPORTER_TURN) {
    return blockOrWarn(action, 'Cannot play a Supporter on the first turn.', 'hard');
  }

  return { outcome: 'continue' };
}

// Warning 2: Only one Energy attachment per turn
// ONLY applies when toZone is active or bench (field zones). Moving energy
// to discard, hand, staging, etc. is never restricted by this rule.
function warnOneEnergyAttachment(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_card_effect) return { outcome: 'continue' };

  const move = unpackMoveAction(action);
  if (!move) return { outcome: 'continue' };

  if (!isFieldZone(move.toZone)) return { outcome: 'continue' };
  if (!move.fromZone.endsWith('_hand')) return { outcome: 'continue' };

  const template = getTemplateForCard(state, move.cardId);
  if (!template || !isEnergy(template)) return { outcome: 'continue' };

  // Check if an energy was already attached (hand → field) this turn
  for (const prev of state.currentTurn.actions) {
    if (prev.allowed_by_card_effect) continue;

    const prevMove = unpackMoveAction(prev);
    if (!prevMove || !isFieldZone(prevMove.toZone)) continue;
    if (!prevMove.fromZone.endsWith('_hand')) continue;

    const prevTemplate = getTemplateForCard(state, prevMove.cardId);
    if (prevTemplate && isEnergy(prevTemplate)) {
      return blockOrWarn(action, 'Already attached an Energy from hand this turn (limit 1).', 'hard');
    }
  }

  return { outcome: 'continue' };
}

// Warning 3: Evolution chain must match (hand → field only)
function warnEvolutionChain(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_card_effect) return { outcome: 'continue' };

  const move = unpackMoveAction(action);
  if (!move) return { outcome: 'continue' };

  if (!move.fromZone.endsWith('_hand')) return { outcome: 'continue' };
  if (!isFieldZone(move.toZone)) return { outcome: 'continue' };

  const template = getTemplateForCard(state, move.topCardId);
  if (!template || !isEvolution(template)) return { outcome: 'continue' };
  if (!template.evolveFrom) return { outcome: 'continue' };

  const zone = state.zones[move.toZone];
  if (!zone || zone.cards.length === 0) {
    return blockOrWarn(action, `Cannot evolve ${template.name} — no ${template.evolveFrom} found in ${zone?.config.name ?? move.toZone}.`);
  }

  const hasPreEvolution = zone.cards.some((card) => {
    const cardTemplate = getTemplate(card.template.id);
    return cardTemplate && cardTemplate.name === template.evolveFrom;
  });

  if (!hasPreEvolution) {
    return blockOrWarn(action, `Cannot evolve ${template.name} — no ${template.evolveFrom} found in ${zone.config.name}.`);
  }

  return { outcome: 'continue' };
}

// Warning 4: Cannot evolve on first turn or the turn a Pokemon was played
function warnEvolutionTiming(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_card_effect) return { outcome: 'continue' };

  const move = unpackMoveAction(action);
  if (!move) return { outcome: 'continue' };

  if (!move.fromZone.endsWith('_hand')) return { outcome: 'continue' };
  if (!isFieldZone(move.toZone)) return { outcome: 'continue' };

  const template = getTemplateForCard(state, move.topCardId);
  if (!template || !isEvolution(template)) return { outcome: 'continue' };

  if (state.turnNumber <= FIRST_EVOLUTION_TURN) {
    return blockOrWarn(action, 'Cannot evolve on the first turn.', 'hard');
  }

  const zone = state.zones[move.toZone];
  if (zone) {
    const topCard = zone.cards.at(-1);
    if (topCard?.flags.includes(CARD_FLAGS.PLAYED_THIS_TURN)) {
      return blockOrWarn(action, 'Cannot evolve a Pokemon the same turn it was played or evolved.');
    }
  }

  return { outcome: 'continue' };
}

// Warning 5: Cannot place damage/status counters on Trainer cards
function warnCountersOnTrainers(state: PokemonState, action: Action): PreHookResult {
  if (action.type !== ACTION_TYPES.ADD_COUNTER) return { outcome: 'continue' };
  if (action.allowed_by_card_effect) return { outcome: 'continue' };

  const counterAction = action as AddCounterAction;
  const template = getTemplateForCard(state, counterAction.cardInstanceId);
  if (!template) return { outcome: 'continue' };

  if (template.supertype !== SUPERTYPES.TRAINER) return { outcome: 'continue' };

  if ((TRAINER_BLOCKED_COUNTERS as readonly string[]).includes(counterAction.counterType)) {
    return blockOrWarn(action, `Cannot place ${counterAction.counterType} counters on a Trainer card.`);
  }

  return { outcome: 'continue' };
}

// Warning 6: Pokemon placement — basics on empty only, evolutions on occupied only
// Only applies to single card moves — stack moves preserve existing validity.
function warnPokemonPlacement(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_card_effect) return { outcome: 'continue' };
  if (action.type !== ACTION_TYPES.MOVE_CARD) return { outcome: 'continue' };

  const move = unpackMoveAction(action);
  if (!move) return { outcome: 'continue' };

  if (move.fromZone === 'staging') return { outcome: 'continue' };
  if (!isFieldZone(move.toZone)) return { outcome: 'continue' };

  const template = getTemplateForCard(state, move.cardId);
  if (!template) return { outcome: 'continue' };
  if (template.supertype !== SUPERTYPES.POKEMON) return { outcome: 'continue' };

  const zone = state.zones[move.toZone];
  const isEmpty = !zone || zone.cards.length === 0;
  const zoneName = zone?.config.name ?? move.toZone;

  if (isBasicPokemon(template)) {
    if (!isEmpty) {
      return blockOrWarn(action, `Cannot place ${template.name} (Basic) on occupied ${zoneName}. Basic Pokemon can only go on empty field zones.`);
    }
    return { outcome: 'continue' };
  }

  if (isEmpty) {
    return blockOrWarn(action, `Cannot place ${template.name} (${template.subtypes.join('/')}) on empty ${zoneName.toLowerCase()}. Only Basic Pokemon can be placed on empty zones.`);
  }

  return { outcome: 'continue' };
}

// Warning 8: Trainer Items/Supporters cannot be placed on field zones
// (Only Pokemon, Energy, and Pokemon Tools belong on the field.)
function warnTrainerToField(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_card_effect) return { outcome: 'continue' };

  const move = unpackMoveAction(action);
  if (!move) return { outcome: 'continue' };

  if (!isFieldZone(move.toZone)) return { outcome: 'continue' };

  for (const cardId of move.allCardIds) {
    const template = getTemplateForCard(state, cardId);
    if (!template) continue;

    if (template.supertype === SUPERTYPES.POKEMON) continue;
    if (isEnergy(template)) continue;

    if (template.supertype === SUPERTYPES.TRAINER) {
      if (isTool(template)) continue;

      return blockOrWarn(action,
        `Cannot place ${template.name} (Trainer) on a field zone. Trainers go to staging first, then discard after resolving.`
      );
    }
  }

  return { outcome: 'continue' };
}

// Warning 9: Only Stadium cards can be placed in the stadium zone
function warnStadiumOnly(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_card_effect) return { outcome: 'continue' };

  const move = unpackMoveAction(action);
  if (!move) return { outcome: 'continue' };

  if (!isStadiumZone(move.toZone)) return { outcome: 'continue' };

  const template = getTemplateForCard(state, move.cardId);
  if (!template) return { outcome: 'continue' };
  if (isStadium(template)) return { outcome: 'continue' };

  return blockOrWarn(action, `Cannot place ${template.name} (${template.supertype}) in stadium zone. Only Stadium cards can be placed there.`);
}

// Warning 10: Only one Pokemon Tool per Pokemon
function warnOneToolPerPokemon(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_card_effect) return { outcome: 'continue' };

  const move = unpackMoveAction(action);
  if (!move) return { outcome: 'continue' };

  if (!isFieldZone(move.toZone)) return { outcome: 'continue' };

  const template = getTemplateForCard(state, move.cardId);
  if (!template || !isTool(template)) return { outcome: 'continue' };

  const zone = state.zones[move.toZone];
  if (!zone) return { outcome: 'continue' };

  const existingTool = zone.cards.find(c => {
    const t = getTemplate(c.template.id);
    return t && isTool(t);
  });

  if (existingTool) {
    return blockOrWarn(action, `${zone.config.name ?? move.toZone} already has a Pokemon Tool (${existingTool.template.name}). Only one Tool per Pokemon.`);
  }

  return { outcome: 'continue' };
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

/** Pre-hook: cannot end turn with cards still in the staging zone. */
function warnStagingNotEmpty(state: PokemonState, action: Action): PreHookResult {
  if (action.type !== ACTION_TYPES.END_TURN) return { outcome: 'continue' };

  const staging = state.zones['staging'];
  if (staging && staging.cards.length > 0) {
    return blockOrWarn(action, 'Cannot end turn with cards still in the staging zone. Resolve or discard them first.', 'hard');
  }

  return { outcome: 'continue' };
}

/** Pre-hook: the player who goes first (turnNumber <= 1) cannot attack. */
function warnAttackFirstTurn(state: PokemonState, action: Action): PreHookResult {
  if (action.type !== ACTION_TYPES.DECLARE_ACTION) return { outcome: 'continue' };
  if ((action as DeclareAction).declarationType !== POKEMON_DECLARATION_TYPES.ATTACK) return { outcome: 'continue' };
  if (action.allowed_by_card_effect) return { outcome: 'continue' };
  if (state.turnNumber <= 1) {
    return blockOrWarn(action, 'Cannot attack on the first turn of the game.', 'hard');
  }
  return { outcome: 'continue' };
}

/** Pre-hook: validate energy cost — count attached energy vs attack cost. */
function warnAttackEnergyCost(state: PokemonState, action: Action): PreHookResult {
  if (action.type !== ACTION_TYPES.DECLARE_ACTION) return { outcome: 'continue' };
  const da = action as DeclareAction;
  if (da.declarationType !== POKEMON_DECLARATION_TYPES.ATTACK) return { outcome: 'continue' };
  if (action.allowed_by_card_effect) return { outcome: 'continue' };

  const activeKey = `player${da.player + 1}_${ZONE_IDS.ACTIVE}`;
  const activeZone = state.zones[activeKey];
  const topCard = activeZone?.cards.at(-1);
  if (!topCard || !activeZone) return { outcome: 'continue' };

  const template = getTemplate((topCard.template as PokemonCardTemplate).id);
  if (!template?.attacks) return { outcome: 'continue' };

  const attack = template.attacks.find(
    a => a.name.toLowerCase() === da.name.toLowerCase(),
  );
  if (!attack || attack.cost.length === 0) return { outcome: 'continue' };

  let totalAttached = 0;
  for (const card of activeZone.cards) {
    const t = card.template as PokemonCardTemplate;
    if (isEnergy(t)) totalAttached++;
  }

  if (totalAttached < attack.cost.length) {
    const costStr = attack.cost.join('/');
    const activeName = topCard.template.name ?? 'Active Pokemon';
    const reason = `${activeName} needs ${attack.cost.length} energy for ${attack.name} (cost: ${costStr}, attached: ${totalAttached}).`;

    if (action.source === ACTION_SOURCES.AI) {
      // Custom suffix — don't use generic blockOrWarn suffixes.
      // Special energy cards (e.g. Double Colorless) may satisfy multi-energy costs
      // with fewer cards, so this is never a definitive block.
      const suffix = ' Verify that the attached energy satisfies the full cost (some energy cards provide multiple energy). If it does, retry with allowed_by_card_effect=true.';
      if (_aiEnforcement === 'strict') {
        return { outcome: 'block', reason: reason + suffix };
      }
      return { outcome: 'warn', reason: reason + suffix };
    }
    return { outcome: 'warn', reason };
  }

  return { outcome: 'continue' };
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
// Shared arrays for move_card and move_card_stack (identical hooks for both).

const MOVE_PRE_HOOKS: PrioritizedPreHook<PokemonCardTemplate>[] = [
  { hook: warnOneSupporter, priority: 100 },
  { hook: warnNoSupporterFirstTurn, priority: 100 },
  { hook: warnOneEnergyAttachment, priority: 100 },
  { hook: warnEvolutionTiming, priority: 95 },
  { hook: warnEvolutionChain, priority: 100 },
  { hook: warnPokemonPlacement, priority: 90 },
  { hook: warnStadiumOnly, priority: 90 },
  { hook: warnTrainerToField, priority: 85 },
  { hook: warnOneToolPerPokemon, priority: 90 },
];

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
      { hook: logDeclareEffectText, priority: 100 },
    ],
  },
  preHooks: {
    [ACTION_TYPES.MOVE_CARD]: MOVE_PRE_HOOKS,
    [ACTION_TYPES.MOVE_CARD_STACK]: MOVE_PRE_HOOKS,
    [ACTION_TYPES.ADD_COUNTER]: [
      { hook: warnCountersOnTrainers, priority: 100 },
    ],
    [ACTION_TYPES.DECLARE_ACTION]: [
      { hook: warnAttackFirstTurn, priority: 90 },
      { hook: warnAttackEnergyCost, priority: 100 },
    ],
    [ACTION_TYPES.END_TURN]: [
      { hook: warnStagingNotEmpty, priority: 90 },
    ],
  },
};
