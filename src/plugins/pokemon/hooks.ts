import type { Action, GameState, MoveCardAction, MoveCardStackAction, AddCounterAction } from '../../core/types';
import { VISIBILITY, ACTION_TYPES, PHASES, CARD_FLAGS, ACTION_SOURCES } from '../../core/types';
import type { PreHookResult, PostHookResult, Plugin } from '../../core/plugin/types';
import type { PokemonCardTemplate } from './cards';
import { getTemplate } from './cards';
import { findCardInZones, consolidateCountersToTop } from '../../core/engine';
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
import { getTemplate as getCardTemplate } from './cards';
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
  POKEMON_ACTION_TYPES,
} from './constants';

type PokemonState = Readonly<GameState<PokemonCardTemplate>>;

/** Return 'block' for AI actions, 'warn' for UI actions (never block human players). */
function blockOrWarn(action: Action, reason: string): PreHookResult {
  if (action.source === ACTION_SOURCES.AI) {
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

  if (action.type === ACTION_TYPES.MOVE_CARD) {
    const a = action as MoveCardAction;
    cardInstanceId = a.cardInstanceId;
    fromZone = a.fromZone;
    toZone = a.toZone;
  } else if (action.type === ACTION_TYPES.MOVE_CARD_STACK) {
    const a = action as MoveCardStackAction;
    cardInstanceId = a.cardInstanceIds[0];
    fromZone = a.fromZone;
    toZone = a.toZone;
    if (!cardInstanceId) return false;
  } else {
    return false;
  }

  if (!fromZone?.endsWith('_hand') || toZone !== 'staging') return false;
  const template = getTemplateForCard(state, cardInstanceId);
  return !!template && isSupporter(template);
}

function warnOneSupporter(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_card_effect) return { outcome: 'continue' };
  if (!isSupporterPlayed(state, action)) return { outcome: 'continue' };

  // Check if a Supporter was already played (hand → staging) this turn
  for (const prev of state.currentTurn.actions) {
    if (isSupporterPlayed(state, prev)) {
      return blockOrWarn(action, 'Already played a Supporter this turn. Set allowed_by_card_effect if a card effect permits this.');
    }
  }

  return { outcome: 'continue' };
}

// Warning 1b: No Supporters on first turn
function warnNoSupporterFirstTurn(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_card_effect) return { outcome: 'continue' };
  if (!isSupporterPlayed(state, action)) return { outcome: 'continue' };

  if (state.turnNumber <= FIRST_SUPPORTER_TURN) {
    return blockOrWarn(action, 'Cannot play a Supporter on the first turn. Set allowed_by_card_effect if a card effect permits this.');
  }

  return { outcome: 'continue' };
}

// Warning 2: Only one Energy attachment per turn
function warnOneEnergyAttachment(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_card_effect) return { outcome: 'continue' };

  let cardInstanceId: string;
  let toZone: string;
  let fromZone: string | undefined;

  if (action.type === ACTION_TYPES.MOVE_CARD) {
    const moveAction = action as MoveCardAction;
    cardInstanceId = moveAction.cardInstanceId;
    toZone = moveAction.toZone;
    fromZone = moveAction.fromZone;
  } else if (action.type === ACTION_TYPES.MOVE_CARD_STACK) {
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

    if (prev.type === ACTION_TYPES.MOVE_CARD) {
      const m = prev as MoveCardAction;
      prevCardId = m.cardInstanceId;
      prevToZone = m.toZone;
      prevFromZone = m.fromZone;
    } else if (prev.type === ACTION_TYPES.MOVE_CARD_STACK) {
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
      return blockOrWarn(action, 'Already attached an Energy this turn. Set allowed_by_card_effect if a card effect permits this.');
    }
  }

  return { outcome: 'continue' };
}

// Warning 3: Evolution chain must match
function warnEvolutionChain(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_card_effect) return { outcome: 'continue' };

  let cardInstanceId: string;
  let toZone: string;

  if (action.type === ACTION_TYPES.MOVE_CARD) {
    const a = action as MoveCardAction;
    cardInstanceId = a.cardInstanceId;
    toZone = a.toZone;
  } else if (action.type === ACTION_TYPES.MOVE_CARD_STACK) {
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
    return blockOrWarn(action, `Cannot evolve ${template.name} — no ${template.evolveFrom} found in ${zone?.config.name ?? toZone}. Set allowed_by_card_effect if a card effect permits this.`);
  }

  const hasPreEvolution = zone.cards.some((card) => {
    const cardTemplate = getTemplate(card.template.id);
    return cardTemplate && cardTemplate.name === template.evolveFrom;
  });

  if (!hasPreEvolution) {
    return blockOrWarn(action, `Cannot evolve ${template.name} — no ${template.evolveFrom} found in ${zone.config.name}. Set allowed_by_card_effect if a card effect permits this.`);
  }

  return { outcome: 'continue' };
}

// Warning 4: Cannot evolve on first turn or the turn a Pokemon was played
function warnEvolutionTiming(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_card_effect) return { outcome: 'continue' };

  let cardInstanceId: string;
  let toZone: string;

  if (action.type === ACTION_TYPES.MOVE_CARD) {
    const a = action as MoveCardAction;
    cardInstanceId = a.cardInstanceId;
    toZone = a.toZone;
  } else if (action.type === ACTION_TYPES.MOVE_CARD_STACK) {
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
  if (state.turnNumber <= FIRST_EVOLUTION_TURN) {
    return blockOrWarn(action, 'Cannot evolve on the first turn or the turn a Pokemon was played. Set allowed_by_card_effect if a card effect permits this.');
  }

  // Check if the target Pokemon was played this turn
  const zone = state.zones[toZone];
  if (zone) {
    const targetHasPlayedFlag = zone.cards.some(
      (card) => card.flags.includes(CARD_FLAGS.PLAYED_THIS_TURN)
    );
    if (targetHasPlayedFlag) {
      return blockOrWarn(action, 'Cannot evolve on the first turn or the turn a Pokemon was played. Set allowed_by_card_effect if a card effect permits this.');
    }
  }

  return { outcome: 'continue' };
}

// Warning 4b: Cannot evolve a Pokemon that already evolved this turn
// Tracks by Pokemon identity (top card of target zone), not by zone —
// so switching a freshly-evolved Pokemon away frees the zone for another evolution.
function warnDoubleEvolution(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_card_effect) return { outcome: 'continue' };

  let cardInstanceId: string;
  let toZone: string;

  if (action.type === ACTION_TYPES.MOVE_CARD) {
    const a = action as MoveCardAction;
    cardInstanceId = a.cardInstanceId;
    toZone = a.toZone;
  } else if (action.type === ACTION_TYPES.MOVE_CARD_STACK) {
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

  // The top card of the target zone is the Pokemon we're evolving FROM.
  // If that card was itself placed as an evolution this turn, this is a double evolution.
  const zone = state.zones[toZone];
  if (!zone || zone.cards.length === 0) return { outcome: 'continue' };

  const topCard = zone.cards.at(-1);
  if (!topCard) return { outcome: 'continue' };

  // Collect all evolution card instance IDs placed this turn
  for (const prev of state.currentTurn.actions) {
    let prevCardId: string | undefined;
    let prevToZone: string | undefined;

    if (prev.type === ACTION_TYPES.MOVE_CARD) {
      const m = prev as MoveCardAction;
      prevCardId = m.cardInstanceId;
      prevToZone = m.toZone;
    } else if (prev.type === ACTION_TYPES.MOVE_CARD_STACK) {
      const s = prev as MoveCardStackAction;
      prevCardId = s.cardInstanceIds[0];
      prevToZone = s.toZone;
    }

    if (!prevCardId || !prevToZone || !isFieldZone(prevToZone)) continue;

    const prevTemplate = getTemplateForCard(state, prevCardId);
    if (!prevTemplate || !isEvolution(prevTemplate)) continue;

    // The top card we're evolving from was itself an evolution placed this turn
    if (prevCardId === topCard.instanceId) {
      return blockOrWarn(action, `Cannot evolve ${topCard.template.name} again — it already evolved this turn. Set allowed_by_card_effect if a card effect permits this.`);
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

  // Block damage and status counters on trainers
  if ((TRAINER_BLOCKED_COUNTERS as readonly string[]).includes(counterAction.counterType)) {
    return blockOrWarn(action, `Cannot place ${counterAction.counterType} counters on a Trainer card. Set allowed_by_card_effect if a card effect permits this.`);
  }

  return { outcome: 'continue' };
}

// Warning 6: Only Basic Pokemon can be placed on empty field zones
function warnNonBasicToEmptyField(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_card_effect) return { outcome: 'continue' };

  let cardInstanceId: string;
  let toZone: string;

  if (action.type === ACTION_TYPES.MOVE_CARD) {
    const moveAction = action as MoveCardAction;
    cardInstanceId = moveAction.cardInstanceId;
    toZone = moveAction.toZone;
  } else if (action.type === ACTION_TYPES.MOVE_CARD_STACK) {
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
    const label = template.supertype === SUPERTYPES.POKEMON
      ? `${template.name} (${template.subtypes.join('/')})`
      : `${template.name} (${template.supertype})`;
    const zoneName = zone?.config.name?.toLowerCase() ?? toZone;
    return blockOrWarn(action, `Cannot place ${label} on empty ${zoneName}. Only Basic Pokemon can be placed directly. Set allowed_by_card_effect if a card effect permits this.`);
  }

  return { outcome: 'continue' };
}


// Post-hook: Stamp PLAYED_THIS_TURN on cards placed from hand onto field zones.
// This powers warnEvolutionTiming — a Pokemon played this turn cannot evolve.
// Covers normal play AND scooped-then-replayed cards (e.g. Devolution Spray → replay).
function stampPlayedThisTurn(state: PokemonState, action: Action): PostHookResult {
  let cardIds: string[] = [];
  let fromZone: string | undefined;
  let toZone: string | undefined;

  if (action.type === ACTION_TYPES.MOVE_CARD) {
    const a = action as MoveCardAction;
    cardIds = [a.cardInstanceId];
    fromZone = a.fromZone;
    toZone = a.toZone;
  } else if (action.type === ACTION_TYPES.MOVE_CARD_STACK) {
    const a = action as MoveCardStackAction;
    cardIds = a.cardInstanceIds;
    fromZone = a.fromZone;
    toZone = a.toZone;
  }

  if (!fromZone?.endsWith('_hand') || !toZone || !isFieldZone(toZone)) return {};

  const mutableState = state as GameState<PokemonCardTemplate>;
  const zone = mutableState.zones[toZone];
  if (!zone) return {};

  for (const id of cardIds) {
    const card = zone.cards.find(c => c.instanceId === id);
    if (card && !card.flags.includes(CARD_FLAGS.PLAYED_THIS_TURN)) {
      card.flags.push(CARD_FLAGS.PLAYED_THIS_TURN);
    }
  }

  return {};
}

// Post-hook: During setup, cards placed on field zones are face-down (hidden from both players)
function setupFaceDown(state: PokemonState, action: Action): PostHookResult {
  if (state.phase !== PHASES.SETUP) return {};

  let toZone: string | undefined;
  let cardIds: string[] = [];

  if (action.type === ACTION_TYPES.MOVE_CARD) {
    const a = action as MoveCardAction;
    toZone = a.toZone;
    cardIds = [a.cardInstanceId];
  } else if (action.type === ACTION_TYPES.MOVE_CARD_STACK) {
    const a = action as MoveCardStackAction;
    toZone = a.toZone;
    cardIds = a.cardInstanceIds;
  }

  if (!toZone || !isFieldZone(toZone)) return {};

  const mutableState = state as GameState<PokemonCardTemplate>;
  const zone = mutableState.zones[toZone];
  if (!zone) return {};

  for (const id of cardIds) {
    const card = zone.cards.find(c => c.instanceId === id);
    if (card) card.visibility = VISIBILITY.HIDDEN;
  }

  return {};
}

// Post-hook: Log trainer card text when played to staging
function logTrainerText(state: PokemonState, action: Action): PostHookResult {
  let cardInstanceId: string;
  let fromZone: string | undefined;
  let toZone: string | undefined;

  if (action.type === ACTION_TYPES.MOVE_CARD) {
    const a = action as MoveCardAction;
    cardInstanceId = a.cardInstanceId;
    fromZone = a.fromZone;
    toZone = a.toZone;
  } else if (action.type === ACTION_TYPES.MOVE_CARD_STACK) {
    const a = action as MoveCardStackAction;
    cardInstanceId = a.cardInstanceIds[0];
    fromZone = a.fromZone;
    toZone = a.toZone;
    if (!cardInstanceId) return {};
  } else {
    return {};
  }

  if (!fromZone?.endsWith('_hand') || toZone !== 'staging') return {};

  const template = getTemplateForCard(state, cardInstanceId);
  if (!template || template.supertype !== SUPERTYPES.TRAINER) return {};

  if (template.rules && template.rules.length > 0) {
    const header = `[${template.name}]`;
    const text = template.rules.join(' ');
    (state as GameState<PokemonCardTemplate>).log.push(`${header} ${text}`);
  }

  return {};
}

// Post-hook: Re-arrange cards in field zones to maintain proper stacking order.
// Visual bottom (index 0) → top (end): Tools, Energy, Basic, Stage 1, Stage 2.
function reorderFieldZone(state: PokemonState, action: Action): PostHookResult {
  let toZone: string | undefined;

  if (action.type === ACTION_TYPES.MOVE_CARD) {
    toZone = (action as MoveCardAction).toZone;
  } else if (action.type === ACTION_TYPES.MOVE_CARD_STACK) {
    toZone = (action as MoveCardStackAction).toZone;
  }

  if (!toZone || !isFieldZone(toZone)) return {};

  const mutableState = state as GameState<PokemonCardTemplate>;
  const zone = mutableState.zones[toZone];
  if (!zone || zone.cards.length <= 1) return {};

  // Assign sort weight: lower = closer to visual bottom (index 0)
  function sortWeight(card: { template: PokemonCardTemplate }): number {
    const t = getTemplate(card.template.id);
    if (!t) return 2; // unknown → treat as basic-level
    if (isTool(t)) return 0;
    if (isEnergy(t)) return 1;
    if (isBasicPokemon(t)) return 2;
    if (isStage1(t)) return 3;
    if (isStage2(t)) return 4;
    return 2; // fallback (other pokemon variants, etc.)
  }

  zone.cards.sort((a, b) => sortWeight(a) - sortWeight(b));

  return {};
}

// Post-hook: Re-consolidate counters to top card after reorder
function consolidateCountersAfterReorder(state: PokemonState, action: Action): PostHookResult {
  let toZone: string | undefined;

  if (action.type === ACTION_TYPES.MOVE_CARD) {
    toZone = (action as MoveCardAction).toZone;
  } else if (action.type === ACTION_TYPES.MOVE_CARD_STACK) {
    toZone = (action as MoveCardStackAction).toZone;
  }

  if (!toZone || !isFieldZone(toZone)) return {};

  const mutableState = state as GameState<PokemonCardTemplate>;
  const zone = mutableState.zones[toZone];
  if (!zone) return {};

  consolidateCountersToTop(zone);
  return {};
}

// Warning 8: Trainer Items/Supporters cannot be placed on field zones
// (Only Pokemon, Energy, and Pokemon Tools belong on the field.)
// Checks ALL cards in a move_card_stack — not just [0].
function warnTrainerToField(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_card_effect) return { outcome: 'continue' };

  let cardIds: string[];
  let toZone: string;

  if (action.type === ACTION_TYPES.MOVE_CARD) {
    const a = action as MoveCardAction;
    cardIds = [a.cardInstanceId];
    toZone = a.toZone;
  } else if (action.type === ACTION_TYPES.MOVE_CARD_STACK) {
    const a = action as MoveCardStackAction;
    cardIds = a.cardInstanceIds;
    toZone = a.toZone;
    if (cardIds.length === 0) return { outcome: 'continue' };
  } else {
    return { outcome: 'continue' };
  }

  if (!isFieldZone(toZone)) return { outcome: 'continue' };

  for (const cardId of cardIds) {
    const template = getTemplateForCard(state, cardId);
    if (!template) continue;

    // Pokemon and Energy are always valid on field zones
    if (template.supertype === SUPERTYPES.POKEMON) continue;
    if (isEnergy(template)) continue;

    // Trainer cards: only Pokemon Tools can attach to field Pokemon
    if (template.supertype === SUPERTYPES.TRAINER) {
      const isPokemonTool = template.subtypes.some(
        s => s.toLowerCase().includes('tool')
      );
      if (isPokemonTool) continue;

      return blockOrWarn(action,
        `Cannot place ${template.name} (Trainer) on a field zone. Only Pokemon, Energy, and Pokemon Tools belong on the field.`
      );
    }
  }

  return { outcome: 'continue' };
}

// Warning 9: Only Stadium cards can be placed in the stadium zone
function warnStadiumOnly(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_card_effect) return { outcome: 'continue' };

  let cardInstanceId: string;
  let toZone: string;

  if (action.type === ACTION_TYPES.MOVE_CARD) {
    const moveAction = action as MoveCardAction;
    cardInstanceId = moveAction.cardInstanceId;
    toZone = moveAction.toZone;
  } else if (action.type === ACTION_TYPES.MOVE_CARD_STACK) {
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

  return blockOrWarn(action, `Cannot place ${template.name} (${template.supertype}) in stadium zone. Only Stadium cards can be placed there. Set allowed_by_card_effect if a card effect permits this.`);
}

// Post-hook: Log Pokemon-specific mulligan message (opponent draws extra)
function logMulliganMessage(state: PokemonState, action: Action): PostHookResult {
  if (action.type !== ACTION_TYPES.MULLIGAN) return {};
  const otherPlayer = action.player === 0 ? 2 : 1;
  (state as GameState<PokemonCardTemplate>).log.push(
    `Player ${action.player + 1} mulliganed. Don't forget to draw 1 extra card Player ${otherPlayer}!`
  );
  return {};
}

// ── Declare Attack: Custom Action ────────────────────────────────

/** Action shape for declare_attack (Pokemon plugin custom action, not in core Action union). */
export interface DeclareAttackAction {
  type: typeof POKEMON_ACTION_TYPES.DECLARE_ATTACK;
  player: 0 | 1;
  attackName: string;
  targetCardName?: string;
  source?: 'ui' | 'ai';
  allowed_by_card_effect?: boolean;
}

/** Action shape for declare_ability (Pokemon plugin custom action, not in core Action union). */
export interface DeclareAbilityAction {
  type: typeof POKEMON_ACTION_TYPES.DECLARE_ABILITY;
  player: 0 | 1;
  cardName: string;
  abilityName: string;
  source?: 'ui' | 'ai';
  allowed_by_card_effect?: boolean;
}

/** Custom executor: logs attack declaration + effect text to state.log and records in currentTurn.actions. */
function executeDeclareAttack(state: GameState<PokemonCardTemplate>, action: DeclareAttackAction): void {
  state.currentTurn.actions.push(action as unknown as Action);
  const activeKey = `player${action.player + 1}_${ZONE_IDS.ACTIVE}`;
  const topCard = state.zones[activeKey]?.cards.at(-1);
  const activeName = topCard?.template?.name ?? 'Active Pokemon';
  const target = action.targetCardName ? ` targeting ${action.targetCardName}` : '';
  state.log.push(`${activeName} used ${action.attackName}!${target}`);

  // Log attack effect text
  if (topCard) {
    const template = getCardTemplate((topCard.template as PokemonCardTemplate).id);
    const attack = template?.attacks?.find(a => a.name.toLowerCase() === action.attackName.toLowerCase());
    if (attack?.effect) {
      state.log.push(`[${attack.name}] ${attack.effect}`);
    }
  }
}

/** Custom executor: logs ability declaration + effect text to state.log and records in currentTurn.actions. */
function executeDeclareAbility(state: GameState<PokemonCardTemplate>, action: DeclareAbilityAction): void {
  state.currentTurn.actions.push(action as unknown as Action);
  state.log.push(`${action.cardName} used ability: ${action.abilityName}`);

  // Log ability effect text — search all zones for the card
  for (const zone of Object.values(state.zones)) {
    for (const card of zone.cards) {
      if (card.template.name === action.cardName) {
        const template = getCardTemplate((card.template as PokemonCardTemplate).id);
        const ability = template?.abilities?.find(a => a.name.toLowerCase() === action.abilityName.toLowerCase());
        if (ability?.effect) {
          state.log.push(`[${ability.name}] ${ability.effect}`);
        }
        return;
      }
    }
  }
}

/** Pre-hook: the player who goes first (turnNumber <= 1) cannot attack. */
function warnAttackFirstTurn(state: PokemonState, action: Action): PreHookResult {
  // Custom action type — cast to string for comparison since it's not in the core Action union
  if ((action.type as string) !== POKEMON_ACTION_TYPES.DECLARE_ATTACK) return { outcome: 'continue' };
  if (action.allowed_by_card_effect) return { outcome: 'continue' };
  if (state.turnNumber <= 1) {
    return blockOrWarn(action, 'Cannot attack on the first turn of the game.');
  }
  return { outcome: 'continue' };
}

/** Pre-hook: validate energy cost — count attached energy vs attack cost. */
function warnAttackEnergyCost(state: PokemonState, action: Action): PreHookResult {
  if ((action.type as string) !== POKEMON_ACTION_TYPES.DECLARE_ATTACK) return { outcome: 'continue' };
  if (action.allowed_by_card_effect) return { outcome: 'continue' };

  const atkAction = action as unknown as DeclareAttackAction;
  const activeKey = `player${atkAction.player + 1}_${ZONE_IDS.ACTIVE}`;
  const activeZone = state.zones[activeKey];
  const topCard = activeZone?.cards.at(-1);
  if (!topCard || !activeZone) return { outcome: 'continue' };

  const template = getCardTemplate((topCard.template as PokemonCardTemplate).id);
  if (!template?.attacks) return { outcome: 'continue' };

  const attack = template.attacks.find(
    a => a.name.toLowerCase() === atkAction.attackName.toLowerCase(),
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
    return blockOrWarn(
      action,
      `${activeName} needs ${attack.cost.length} energy for ${attack.name} (cost: ${costStr}, attached: ${totalAttached}). Check for card effects that provide extra energy.`,
    );
  }

  return { outcome: 'continue' };
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

      // Translate degree-based orientation to human-readable status field
      const orientation = card.orientation as string | undefined;
      if (orientation && DEGREES_TO_STATUS[orientation]) {
        card.status = DEGREES_TO_STATUS[orientation];
      }
      // Remove raw orientation — AI should use 'status' field instead
      delete card.orientation;
    }
  }
  return readable;
}

export const pokemonHooksPlugin: Plugin<PokemonCardTemplate> = {
  id: 'pokemon-hooks',
  name: 'Pokemon TCG Hooks',
  version: '1.0.0',
  readableStateModifier: modifyReadableState,
  readableStateFormatter: formatNarrativeState,
  customActions: [
    { type: POKEMON_ACTION_TYPES.DECLARE_ATTACK, executor: executeDeclareAttack as any },
    { type: POKEMON_ACTION_TYPES.DECLARE_ABILITY, executor: executeDeclareAbility as any },
  ],
  postHooks: {
    [ACTION_TYPES.MOVE_CARD]: [
      { hook: setupFaceDown, priority: 50 },
      { hook: stampPlayedThisTurn, priority: 60 },
      { hook: logTrainerText, priority: 100 },
      { hook: reorderFieldZone, priority: 200 },
    ],
    [ACTION_TYPES.MOVE_CARD_STACK]: [
      { hook: setupFaceDown, priority: 50 },
      { hook: stampPlayedThisTurn, priority: 60 },
      { hook: logTrainerText, priority: 100 },
      { hook: reorderFieldZone, priority: 200 },
    ],
    [ACTION_TYPES.MULLIGAN]: [
      { hook: logMulliganMessage, priority: 100 },
    ],
  },
  preHooks: {
    [ACTION_TYPES.MOVE_CARD]: [
      { hook: warnOneSupporter, priority: 100 },
      { hook: warnNoSupporterFirstTurn, priority: 100 },
      { hook: warnOneEnergyAttachment, priority: 100 },
      { hook: warnEvolutionChain, priority: 100 },
      { hook: warnEvolutionTiming, priority: 110 },
      { hook: warnDoubleEvolution, priority: 115 },
      { hook: warnNonBasicToEmptyField, priority: 90 },
      { hook: warnStadiumOnly, priority: 90 },
      { hook: warnTrainerToField, priority: 85 },
    ],
    [ACTION_TYPES.MOVE_CARD_STACK]: [
      { hook: warnOneSupporter, priority: 100 },
      { hook: warnNoSupporterFirstTurn, priority: 100 },
      { hook: warnOneEnergyAttachment, priority: 100 },
      { hook: warnEvolutionChain, priority: 100 },
      { hook: warnEvolutionTiming, priority: 110 },
      { hook: warnDoubleEvolution, priority: 115 },
      { hook: warnNonBasicToEmptyField, priority: 90 },
      { hook: warnStadiumOnly, priority: 90 },
      { hook: warnTrainerToField, priority: 85 },
    ],
    [ACTION_TYPES.ADD_COUNTER]: [
      { hook: warnCountersOnTrainers, priority: 100 },
    ],
    [POKEMON_ACTION_TYPES.DECLARE_ATTACK]: [
      { hook: warnAttackFirstTurn, priority: 90 },
      { hook: warnAttackEnergyCost, priority: 100 },
    ],
  },
};
