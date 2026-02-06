import type { Action, GameState, MoveCardAction, MoveCardStackAction, AddCounterAction } from '../../core/types';
import type { PreHookResult, Plugin } from '../../core/plugin/types';
import type { PokemonCardTemplate } from './cards';
import { getTemplate } from './cards';
import { findCardInZones } from '../../core/engine';
import {
  isSupporter,
  isEnergy,
  isEvolution,
  isBasicPokemon,
  isStadium,
  isFieldZone,
  isStadiumZone,
} from './helpers';
import type { ReadableGameState } from '../../core/readable';

type PokemonState = Readonly<GameState<PokemonCardTemplate>>;

/** Return 'block' for AI actions, 'warn' for UI actions (never block human players). */
function blockOrWarn(action: Action, reason: string): PreHookResult {
  if (action.source === 'ai') {
    return { outcome: 'block', reason };
  }
  return { outcome: 'warn', reason };
}

function getTemplateForCard(state: PokemonState, cardInstanceId: string): PokemonCardTemplate | null {
  const result = findCardInZones(state, cardInstanceId);
  if (!result) return null;
  return getTemplate(result.card.template.id) ?? null;
}

// Warning 1: Only one Supporter per turn
// Only hand → staging counts as "playing" a Supporter.
function isSupporterPlayed(state: PokemonState, action: Action): boolean {
  let cardInstanceId: string;
  let fromZone: string | undefined;
  let toZone: string | undefined;

  if (action.type === 'move_card') {
    const a = action as MoveCardAction;
    cardInstanceId = a.cardInstanceId;
    fromZone = a.fromZone;
    toZone = a.toZone;
  } else if (action.type === 'move_card_stack') {
    const a = action as MoveCardStackAction;
    cardInstanceId = a.cardInstanceIds[0];
    fromZone = a.fromZone;
    toZone = a.toZone;
    if (!cardInstanceId) return false;
  } else {
    return false;
  }

  if (!fromZone?.endsWith('_hand') || !toZone?.endsWith('_staging')) return false;
  const template = getTemplateForCard(state, cardInstanceId);
  return !!template && isSupporter(template);
}

function warnOneSupporter(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_effect) return { outcome: 'continue' };
  if (!isSupporterPlayed(state, action)) return { outcome: 'continue' };

  // Check if a Supporter was already played (hand → staging) this turn
  for (const prev of state.currentTurn.actions) {
    if (isSupporterPlayed(state, prev)) {
      return blockOrWarn(action, 'Already played a Supporter this turn. Set allowed_by_effect if a card effect permits this.');
    }
  }

  return { outcome: 'continue' };
}

// Warning 2: Only one Energy attachment per turn
function warnOneEnergyAttachment(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_effect) return { outcome: 'continue' };

  let cardInstanceId: string;
  let toZone: string;
  let fromZone: string | undefined;

  if (action.type === 'move_card') {
    const moveAction = action as MoveCardAction;
    cardInstanceId = moveAction.cardInstanceId;
    toZone = moveAction.toZone;
    fromZone = moveAction.fromZone;
  } else if (action.type === 'move_card_stack') {
    const stackAction = action as MoveCardStackAction;
    cardInstanceId = stackAction.cardInstanceIds[0];
    toZone = stackAction.toZone;
    fromZone = stackAction.fromZone;
    if (!cardInstanceId) return { outcome: 'continue' };
  } else {
    return { outcome: 'continue' };
  }

  // Same-zone rearrangement is not an energy attachment
  if (fromZone && fromZone === toZone) return { outcome: 'continue' };

  // Only care about energy going to field zones
  if (!isFieldZone(toZone)) return { outcome: 'continue' };

  const template = getTemplateForCard(state, cardInstanceId);
  if (!template || !isEnergy(template)) return { outcome: 'continue' };

  // Check if an energy was already attached to a field zone this turn
  for (const prev of state.currentTurn.actions) {
    let prevCardId: string | undefined;
    let prevToZone: string | undefined;
    let prevFromZone: string | undefined;

    if (prev.type === 'move_card') {
      const m = prev as MoveCardAction;
      prevCardId = m.cardInstanceId;
      prevToZone = m.toZone;
      prevFromZone = m.fromZone;
    } else if (prev.type === 'move_card_stack') {
      const s = prev as MoveCardStackAction;
      prevCardId = s.cardInstanceIds[0];
      prevToZone = s.toZone;
      prevFromZone = s.fromZone;
    }

    if (!prevCardId || !prevToZone || !isFieldZone(prevToZone)) continue;
    // Skip same-zone rearrangements in history
    if (prevFromZone && prevFromZone === prevToZone) continue;

    const prevTemplate = getTemplateForCard(state, prevCardId);
    if (prevTemplate && isEnergy(prevTemplate)) {
      return blockOrWarn(action, 'Already attached an Energy this turn. Set allowed_by_effect if a card effect permits this.');
    }
  }

  return { outcome: 'continue' };
}

// Warning 3: Evolution chain must match
function warnEvolutionChain(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_effect) return { outcome: 'continue' };

  let cardInstanceId: string;
  let toZone: string;

  if (action.type === 'move_card') {
    const a = action as MoveCardAction;
    cardInstanceId = a.cardInstanceId;
    toZone = a.toZone;
  } else if (action.type === 'move_card_stack') {
    const a = action as MoveCardStackAction;
    cardInstanceId = a.cardInstanceIds[0];
    toZone = a.toZone;
    if (!cardInstanceId) return { outcome: 'continue' };
  } else {
    return { outcome: 'continue' };
  }

  if (!isFieldZone(toZone)) return { outcome: 'continue' };

  const template = getTemplateForCard(state, cardInstanceId);
  if (!template || !isEvolution(template)) return { outcome: 'continue' };
  if (!template.evolveFrom) return { outcome: 'continue' };

  // Check target zone for a matching pre-evolution
  const zone = state.zones[toZone];
  if (!zone || zone.cards.length === 0) {
    return blockOrWarn(action, `Cannot evolve ${template.name} — no ${template.evolveFrom} found in ${zone?.config.name ?? toZone}. Set allowed_by_effect if a card effect permits this.`);
  }

  const hasPreEvolution = zone.cards.some((card) => {
    const cardTemplate = getTemplate(card.template.id);
    return cardTemplate && cardTemplate.name === template.evolveFrom;
  });

  if (!hasPreEvolution) {
    return blockOrWarn(action, `Cannot evolve ${template.name} — no ${template.evolveFrom} found in ${zone.config.name}. Set allowed_by_effect if a card effect permits this.`);
  }

  return { outcome: 'continue' };
}

// Warning 4: Cannot evolve on first turn or the turn a Pokemon was played
function warnEvolutionTiming(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_effect) return { outcome: 'continue' };

  let cardInstanceId: string;
  let toZone: string;

  if (action.type === 'move_card') {
    const a = action as MoveCardAction;
    cardInstanceId = a.cardInstanceId;
    toZone = a.toZone;
  } else if (action.type === 'move_card_stack') {
    const a = action as MoveCardStackAction;
    cardInstanceId = a.cardInstanceIds[0];
    toZone = a.toZone;
    if (!cardInstanceId) return { outcome: 'continue' };
  } else {
    return { outcome: 'continue' };
  }

  if (!isFieldZone(toZone)) return { outcome: 'continue' };

  const template = getTemplateForCard(state, cardInstanceId);
  if (!template || !isEvolution(template)) return { outcome: 'continue' };

  // First turn for either player (turn 1 = player 0's first, turn 2 = player 1's first)
  if (state.turnNumber <= 2) {
    return blockOrWarn(action, 'Cannot evolve on the first turn or the turn a Pokemon was played. Set allowed_by_effect if a card effect permits this.');
  }

  // Check if the target Pokemon was played this turn
  const zone = state.zones[toZone];
  if (zone) {
    const targetHasPlayedFlag = zone.cards.some(
      (card) => card.flags.includes('played_this_turn')
    );
    if (targetHasPlayedFlag) {
      return blockOrWarn(action, 'Cannot evolve on the first turn or the turn a Pokemon was played. Set allowed_by_effect if a card effect permits this.');
    }
  }

  return { outcome: 'continue' };
}

// Warning 5: Cannot place damage/status counters on Trainer cards
function warnCountersOnTrainers(state: PokemonState, action: Action): PreHookResult {
  if (action.type !== 'add_counter') return { outcome: 'continue' };
  if (action.allowed_by_effect) return { outcome: 'continue' };

  const counterAction = action as AddCounterAction;
  const template = getTemplateForCard(state, counterAction.cardInstanceId);
  if (!template) return { outcome: 'continue' };

  if (template.supertype !== 'Trainer') return { outcome: 'continue' };

  // Block damage and status counters on trainers
  const blockedCounters = ['10', '50', '100', 'burn', 'poison'];
  if (blockedCounters.includes(counterAction.counterType)) {
    return blockOrWarn(action, `Cannot place ${counterAction.counterType} counters on a Trainer card. Set allowed_by_effect if a card effect permits this.`);
  }

  return { outcome: 'continue' };
}

// Warning 6: Only Basic Pokemon can be placed on empty field zones
function warnNonBasicToEmptyField(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_effect) return { outcome: 'continue' };

  let cardInstanceId: string;
  let toZone: string;

  if (action.type === 'move_card') {
    const moveAction = action as MoveCardAction;
    cardInstanceId = moveAction.cardInstanceId;
    toZone = moveAction.toZone;
  } else if (action.type === 'move_card_stack') {
    const stackAction = action as MoveCardStackAction;
    cardInstanceId = stackAction.cardInstanceIds[0];
    toZone = stackAction.toZone;
    if (!cardInstanceId) return { outcome: 'continue' };
  } else {
    return { outcome: 'continue' };
  }

  if (!isFieldZone(toZone)) return { outcome: 'continue' };

  const template = getTemplateForCard(state, cardInstanceId);
  if (!template) return { outcome: 'continue' };
  if (isBasicPokemon(template)) return { outcome: 'continue' };

  // Check if the target zone is empty
  const zone = state.zones[toZone];
  if (!zone || zone.cards.length === 0) {
    const label = template.supertype === 'Pokemon'
      ? `${template.name} (${template.subtypes.join('/')})`
      : `${template.name} (${template.supertype})`;
    const zoneName = zone?.config.name?.toLowerCase() ?? toZone;
    return blockOrWarn(action, `Cannot place ${label} on empty ${zoneName}. Only Basic Pokemon can be placed directly. Set allowed_by_effect if a card effect permits this.`);
  }

  return { outcome: 'continue' };
}

// Warning 7: Energy should not be placed on top of a Pokemon in a field zone
function warnEnergyOnTopOfPokemon(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_effect) return { outcome: 'continue' };

  let cardInstanceId: string;
  let toZone: string;
  let fromZone: string | undefined;
  let position: number | undefined;

  if (action.type === 'move_card') {
    const moveAction = action as MoveCardAction;
    cardInstanceId = moveAction.cardInstanceId;
    toZone = moveAction.toZone;
    fromZone = moveAction.fromZone;
    position = moveAction.position;
  } else if (action.type === 'move_card_stack') {
    const stackAction = action as MoveCardStackAction;
    cardInstanceId = stackAction.cardInstanceIds[0];
    toZone = stackAction.toZone;
    fromZone = stackAction.fromZone;
    position = stackAction.position;
    if (!cardInstanceId) return { outcome: 'continue' };
  } else {
    return { outcome: 'continue' };
  }

  // Same-zone rearrangement is not a new attachment
  if (fromZone && fromZone === toZone) return { outcome: 'continue' };

  if (!isFieldZone(toZone)) return { outcome: 'continue' };

  const template = getTemplateForCard(state, cardInstanceId);
  if (!template || !isEnergy(template)) return { outcome: 'continue' };

  // Array convention: index 0 = visual bottom, end of array = visual top.
  // Energy at the visual bottom (position 0) is fine — it's underneath the Pokemon.
  // Warn when energy would land on top: position undefined (append to end) or
  // position >= zone length (explicit top).
  const zone = state.zones[toZone];
  if (zone && zone.cards.length > 0) {
    const isTop = position === undefined || position >= zone.cards.length;
    if (isTop) {
      const zoneName = zone.config.name?.toLowerCase() ?? toZone;
      return blockOrWarn(action, `Cannot place energy on top of Pokemon in ${zoneName}. Energy should be attached underneath. Set allowed_by_effect if a card effect permits this.`);
    }
  }

  return { outcome: 'continue' };
}

// Warning 8: Only Stadium cards can be placed in the stadium zone
function warnStadiumOnly(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_effect) return { outcome: 'continue' };

  let cardInstanceId: string;
  let toZone: string;

  if (action.type === 'move_card') {
    const moveAction = action as MoveCardAction;
    cardInstanceId = moveAction.cardInstanceId;
    toZone = moveAction.toZone;
  } else if (action.type === 'move_card_stack') {
    const stackAction = action as MoveCardStackAction;
    cardInstanceId = stackAction.cardInstanceIds[0];
    toZone = stackAction.toZone;
    if (!cardInstanceId) return { outcome: 'continue' };
  } else {
    return { outcome: 'continue' };
  }

  if (!isStadiumZone(toZone)) return { outcome: 'continue' };

  const template = getTemplateForCard(state, cardInstanceId);
  if (!template) return { outcome: 'continue' };
  if (isStadium(template)) return { outcome: 'continue' };

  return blockOrWarn(action, `Cannot place ${template.name} (${template.supertype}) in stadium zone. Only Stadium cards can be placed there. Set allowed_by_effect if a card effect permits this.`);
}

// ── Readable State Modifier ──────────────────────────────────────

/** Damage counter IDs and their point values. */
const DAMAGE_COUNTER_VALUES: Record<string, number> = { '10': 10, '50': 50, '100': 100 };

/**
 * Modify readable state for Pokemon TCG:
 * - Compute totalDamage from damage counters (10/50/100)
 * - Convert retreatCost from string[] to integer (count)
 */
export function modifyReadableState(
  readable: ReadableGameState,
): ReadableGameState {
  for (const zone of Object.values(readable.zones)) {
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

      // Translate orientation to human-readable status field
      const STATUS_ORIENTATIONS = new Set(['paralyzed', 'asleep', 'confused']);
      const orientation = card.orientation as string | undefined;
      if (orientation && STATUS_ORIENTATIONS.has(orientation)) {
        card.status = orientation;
      }
      // Remove raw orientation — AI should use 'status' field instead
      delete card.orientation;
    }
  }
  return readable;
}

export const pokemonWarningsPlugin: Plugin<PokemonCardTemplate> = {
  id: 'pokemon-warnings',
  name: 'Pokemon TCG Warnings',
  version: '1.0.0',
  readableStateModifier: modifyReadableState,
  preHooks: {
    'move_card': [
      { hook: warnOneSupporter, priority: 100 },
      { hook: warnOneEnergyAttachment, priority: 100 },
      { hook: warnEvolutionChain, priority: 100 },
      { hook: warnEvolutionTiming, priority: 110 },
      { hook: warnNonBasicToEmptyField, priority: 90 },
      { hook: warnEnergyOnTopOfPokemon, priority: 90 },
      { hook: warnStadiumOnly, priority: 90 },
    ],
    'move_card_stack': [
      { hook: warnOneSupporter, priority: 100 },
      { hook: warnOneEnergyAttachment, priority: 100 },
      { hook: warnEvolutionChain, priority: 100 },
      { hook: warnEvolutionTiming, priority: 110 },
      { hook: warnNonBasicToEmptyField, priority: 90 },
      { hook: warnEnergyOnTopOfPokemon, priority: 90 },
      { hook: warnStadiumOnly, priority: 90 },
    ],
    'add_counter': [
      { hook: warnCountersOnTrainers, priority: 100 },
    ],
  },
};
