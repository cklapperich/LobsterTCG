import type { Action, GameState, PlayCardAction, MoveCardAction, AddCounterAction } from '../../core/types';
import type { PreHookResult, Plugin } from '../../core/plugin/types';
import type { PokemonCardTemplate } from './cards';
import { getTemplate } from './cards';
import { findCardInZones } from '../../core/engine';
import {
  isSupporter,
  isEnergy,
  isEvolution,
  isBasicPokemon,
  isFieldZone,
} from './helpers';

type PokemonState = Readonly<GameState<PokemonCardTemplate>>;

function getTemplateForCard(state: PokemonState, cardInstanceId: string): PokemonCardTemplate | null {
  const result = findCardInZones(state, cardInstanceId);
  if (!result) return null;
  return getTemplate(result.card.template.id) ?? null;
}

// Warning 1: Only one Supporter per turn
function warnOneSupporter(state: PokemonState, action: Action): PreHookResult {
  if (action.type !== 'play_card') return { outcome: 'continue' };
  if (action.allowed_by_effect) return { outcome: 'continue' };

  const playAction = action as PlayCardAction;
  const template = getTemplateForCard(state, playAction.cardInstanceId);
  if (!template || !isSupporter(template)) return { outcome: 'continue' };

  // Check if a Supporter was already played this turn
  for (const prev of state.currentTurn.actions) {
    if (prev.type !== 'play_card') continue;
    const prevPlay = prev as PlayCardAction;
    const prevTemplate = getTemplateForCard(state, prevPlay.cardInstanceId);
    if (prevTemplate && isSupporter(prevTemplate)) {
      return {
        outcome: 'block',
        reason: 'Already played a Supporter this turn. Set allowed_by_effect if a card effect permits this.',
      };
    }
  }

  return { outcome: 'continue' };
}

// Warning 2: Only one Energy attachment per turn
function warnOneEnergyAttachment(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_effect) return { outcome: 'continue' };

  let cardInstanceId: string;
  let toZone: string;

  if (action.type === 'play_card') {
    const playAction = action as PlayCardAction;
    cardInstanceId = playAction.cardInstanceId;
    toZone = playAction.toZone;
  } else if (action.type === 'move_card') {
    const moveAction = action as MoveCardAction;
    cardInstanceId = moveAction.cardInstanceId;
    toZone = moveAction.toZone;
  } else {
    return { outcome: 'continue' };
  }

  // Only care about energy going to field zones
  if (!isFieldZone(toZone)) return { outcome: 'continue' };

  const template = getTemplateForCard(state, cardInstanceId);
  if (!template || !isEnergy(template)) return { outcome: 'continue' };

  // Check if an energy was already attached to a field zone this turn
  for (const prev of state.currentTurn.actions) {
    let prevCardId: string | undefined;
    let prevToZone: string | undefined;

    if (prev.type === 'play_card') {
      const p = prev as PlayCardAction;
      prevCardId = p.cardInstanceId;
      prevToZone = p.toZone;
    } else if (prev.type === 'move_card') {
      const m = prev as MoveCardAction;
      prevCardId = m.cardInstanceId;
      prevToZone = m.toZone;
    }

    if (!prevCardId || !prevToZone || !isFieldZone(prevToZone)) continue;

    const prevTemplate = getTemplateForCard(state, prevCardId);
    if (prevTemplate && isEnergy(prevTemplate)) {
      return {
        outcome: 'block',
        reason: 'Already attached an Energy this turn. Set allowed_by_effect if a card effect permits this.',
      };
    }
  }

  return { outcome: 'continue' };
}

// Warning 3: Evolution chain must match
function warnEvolutionChain(state: PokemonState, action: Action): PreHookResult {
  if (action.type !== 'play_card') return { outcome: 'continue' };
  if (action.allowed_by_effect) return { outcome: 'continue' };

  const playAction = action as PlayCardAction;
  const template = getTemplateForCard(state, playAction.cardInstanceId);
  if (!template || !isEvolution(template)) return { outcome: 'continue' };
  if (!template.evolveFrom) return { outcome: 'continue' };

  // Check target zone for a matching pre-evolution
  const zoneKey = `player${playAction.player}_${playAction.toZone}`;
  const zone = state.zones[zoneKey];
  if (!zone || zone.cards.length === 0) {
    return {
      outcome: 'block',
      reason: `Cannot evolve ${template.name} — no ${template.evolveFrom} found in ${playAction.toZone}. Set allowed_by_effect if a card effect permits this.`,
    };
  }

  const hasPreEvolution = zone.cards.some((card) => {
    const cardTemplate = getTemplate(card.template.id);
    return cardTemplate && cardTemplate.name === template.evolveFrom;
  });

  if (!hasPreEvolution) {
    return {
      outcome: 'block',
      reason: `Cannot evolve ${template.name} — no ${template.evolveFrom} found in ${playAction.toZone}. Set allowed_by_effect if a card effect permits this.`,
    };
  }

  return { outcome: 'continue' };
}

// Warning 4: Cannot evolve on first turn or the turn a Pokemon was played
function warnEvolutionTiming(state: PokemonState, action: Action): PreHookResult {
  if (action.type !== 'play_card') return { outcome: 'continue' };
  if (action.allowed_by_effect) return { outcome: 'continue' };

  const playAction = action as PlayCardAction;
  const template = getTemplateForCard(state, playAction.cardInstanceId);
  if (!template || !isEvolution(template)) return { outcome: 'continue' };

  // First turn for either player (turn 1 = player 0's first, turn 2 = player 1's first)
  if (state.turnNumber <= 2) {
    return {
      outcome: 'block',
      reason: 'Cannot evolve on the first turn or the turn a Pokemon was played. Set allowed_by_effect if a card effect permits this.',
    };
  }

  // Check if the target Pokemon was played this turn
  const zoneKey = `player${playAction.player}_${playAction.toZone}`;
  const zone = state.zones[zoneKey];
  if (zone) {
    const targetHasPlayedFlag = zone.cards.some(
      (card) => card.flags.includes('played_this_turn')
    );
    if (targetHasPlayedFlag) {
      return {
        outcome: 'block',
        reason: 'Cannot evolve on the first turn or the turn a Pokemon was played. Set allowed_by_effect if a card effect permits this.',
      };
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
    return {
      outcome: 'block',
      reason: `Cannot place ${counterAction.counterType} counters on a Trainer card. Set allowed_by_effect if a card effect permits this.`,
    };
  }

  return { outcome: 'continue' };
}

// Warning 6: Non-Basic Pokemon cannot be placed on empty field zones
function warnNonBasicToEmptyField(state: PokemonState, action: Action): PreHookResult {
  if (action.allowed_by_effect) return { outcome: 'continue' };

  let cardInstanceId: string;
  let toZone: string;
  let player: 0 | 1;

  if (action.type === 'play_card') {
    const playAction = action as PlayCardAction;
    cardInstanceId = playAction.cardInstanceId;
    toZone = playAction.toZone;
    player = playAction.player;
  } else if (action.type === 'move_card') {
    const moveAction = action as MoveCardAction;
    cardInstanceId = moveAction.cardInstanceId;
    toZone = moveAction.toZone;
    player = moveAction.player;
  } else {
    return { outcome: 'continue' };
  }

  if (!isFieldZone(toZone)) return { outcome: 'continue' };

  const template = getTemplateForCard(state, cardInstanceId);
  if (!template) return { outcome: 'continue' };
  if (template.supertype !== 'Pokemon') return { outcome: 'continue' };
  if (isBasicPokemon(template)) return { outcome: 'continue' };

  // Check if the target zone is empty
  const zoneKey = `player${player}_${toZone}`;
  const zone = state.zones[zoneKey];
  if (!zone || zone.cards.length === 0) {
    const stageLabel = template.subtypes.join('/');
    return {
      outcome: 'block',
      reason: `Cannot place ${template.name} (${stageLabel}) on empty ${toZone}. Only Basic Pokemon can be placed directly. Set allowed_by_effect if a card effect permits this.`,
    };
  }

  return { outcome: 'continue' };
}

export const pokemonWarningsPlugin: Plugin<PokemonCardTemplate> = {
  id: 'pokemon-warnings',
  name: 'Pokemon TCG Warnings',
  version: '1.0.0',
  preHooks: {
    'play_card': [
      { hook: warnOneSupporter, priority: 100 },
      { hook: warnOneEnergyAttachment, priority: 100 },
      { hook: warnEvolutionChain, priority: 100 },
      { hook: warnEvolutionTiming, priority: 110 },
      { hook: warnNonBasicToEmptyField, priority: 90 },
    ],
    'move_card': [
      { hook: warnOneEnergyAttachment, priority: 100 },
      { hook: warnNonBasicToEmptyField, priority: 90 },
    ],
    'add_counter': [
      { hook: warnCountersOnTrainers, priority: 100 },
    ],
  },
};
