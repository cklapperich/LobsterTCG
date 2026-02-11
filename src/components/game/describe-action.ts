import type { Action, CardTemplate, GameState } from '../../core';
import { ACTION_TYPES, getCardName } from '../../core';

export type CounterNameResolver = (counterTypeId: string) => string;

/**
 * Convert an Action to a log string for the game log panel.
 * Returns null for silent actions (coin_flip, search_zone).
 */
export function describeAction(
  state: GameState<CardTemplate>,
  action: Action,
  counterName: CounterNameResolver
): string | null {
  const zoneId = (key: string) => key.split('_').slice(1).join('_');
  const cardName = (id: string) => getCardName(state, id);

  switch (action.type) {
    case ACTION_TYPES.DRAW:
      return `Drew ${action.count} card(s)`;
    case ACTION_TYPES.MOVE_CARD:
      return `Moved ${cardName(action.cardInstanceId)} from ${zoneId(action.fromZone)} to ${zoneId(action.toZone)}`;
    case ACTION_TYPES.MOVE_CARD_STACK:
      return `Moved ${action.cardInstanceIds.length} cards from ${zoneId(action.fromZone)} to ${zoneId(action.toZone)}`;
    case ACTION_TYPES.PLACE_ON_ZONE:
      return `Placed ${action.cardInstanceIds.length} card(s) on ${action.position} of ${zoneId(action.zoneId)}`;
    case ACTION_TYPES.SHUFFLE:
      return `Shuffled ${zoneId(action.zoneId)}`;
    case ACTION_TYPES.FLIP_CARD:
      return `Flipped ${cardName(action.cardInstanceId)} ${action.newVisibility[0] ? 'face up' : 'face down'}`;
    case ACTION_TYPES.SET_ORIENTATION:
      return action.orientation === '0'
        ? `${cardName(action.cardInstanceId)} rotation cleared`
        : `${cardName(action.cardInstanceId)} rotated to ${action.orientation}°`;
    case ACTION_TYPES.ADD_COUNTER:
      return `Added ${action.amount}x ${counterName(action.counterType)} to ${cardName(action.cardInstanceId)}`;
    case ACTION_TYPES.REMOVE_COUNTER:
      return `Removed ${action.amount}x ${counterName(action.counterType)} from ${cardName(action.cardInstanceId)}`;
    case ACTION_TYPES.SET_COUNTER:
      return `Set ${counterName(action.counterType)} on ${cardName(action.cardInstanceId)} to ${action.value}`;
    case ACTION_TYPES.DICE_ROLL:
      return `Rolled ${action.count}d${action.sides}`;
    case ACTION_TYPES.END_TURN:
      return `Ended turn`;
    case ACTION_TYPES.CONCEDE:
      return `Conceded`;
    case ACTION_TYPES.DECLARE_VICTORY:
      return `Declared victory: ${action.reason ?? 'unknown'}`;
    case ACTION_TYPES.REVEAL:
      return `Revealed ${action.cardInstanceIds.map(id => cardName(id)).join(', ')}`;
    case ACTION_TYPES.PEEK:
      return `Peeked at ${action.count} cards from ${action.fromPosition} of ${zoneId(action.zoneId)}`;
    case ACTION_TYPES.REVEAL_HAND: {
      const rhZone = state.zones[action.zoneKey];
      const rhNames = rhZone?.cards.map(c => c.template.name).join(', ') ?? '';
      return `Revealed ${zoneId(action.zoneKey)}: ${rhNames}`;
    }
    case ACTION_TYPES.CREATE_DECISION:
      return `Requested decision: ${action.message ?? 'Action needed'}`;
    case ACTION_TYPES.RESOLVE_DECISION:
      return `Resolved decision`;
    case ACTION_TYPES.MULLIGAN:
      return `Mulliganed (drew ${action.drawCount})`;
    case ACTION_TYPES.COIN_FLIP:
    case ACTION_TYPES.SEARCH_ZONE:
      return null;
    case ACTION_TYPES.DECLARE_ACTION:
      // Core executor already logs this in engine.ts — returning here would double-log
      return null;
    default:
      return null;
  }
}
