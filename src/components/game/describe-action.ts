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
      return `[AI] Drew ${action.count} card(s)`;
    case ACTION_TYPES.MOVE_CARD:
      return `[AI] Moved ${cardName(action.cardInstanceId)} from ${zoneId(action.fromZone)} to ${zoneId(action.toZone)}`;
    case ACTION_TYPES.MOVE_CARD_STACK:
      return `[AI] Moved ${action.cardInstanceIds.length} cards from ${zoneId(action.fromZone)} to ${zoneId(action.toZone)}`;
    case ACTION_TYPES.PLACE_ON_ZONE:
      return `[AI] Placed ${action.cardInstanceIds.length} card(s) on ${action.position} of ${zoneId(action.zoneId)}`;
    case ACTION_TYPES.SHUFFLE:
      return `[AI] Shuffled ${zoneId(action.zoneId)}`;
    case ACTION_TYPES.FLIP_CARD:
      return `[AI] Flipped ${cardName(action.cardInstanceId)} ${action.newVisibility[0] ? 'face up' : 'face down'}`;
    case ACTION_TYPES.SET_ORIENTATION:
      return action.orientation === '0'
        ? `[AI] ${cardName(action.cardInstanceId)} rotation cleared`
        : `[AI] ${cardName(action.cardInstanceId)} rotated to ${action.orientation}°`;
    case ACTION_TYPES.ADD_COUNTER:
      return `[AI] Added ${action.amount}x ${counterName(action.counterType)} to ${cardName(action.cardInstanceId)}`;
    case ACTION_TYPES.REMOVE_COUNTER:
      return `[AI] Removed ${action.amount}x ${counterName(action.counterType)} from ${cardName(action.cardInstanceId)}`;
    case ACTION_TYPES.SET_COUNTER:
      return `[AI] Set ${counterName(action.counterType)} on ${cardName(action.cardInstanceId)} to ${action.value}`;
    case ACTION_TYPES.DICE_ROLL:
      return `[AI] Rolled ${action.count}d${action.sides}`;
    case ACTION_TYPES.END_TURN:
      return `[AI] Ended turn`;
    case ACTION_TYPES.CONCEDE:
      return `[AI] Conceded`;
    case ACTION_TYPES.DECLARE_VICTORY:
      return `[AI] Declared victory: ${action.reason ?? 'unknown'}`;
    case ACTION_TYPES.REVEAL:
      return `[AI] Revealed ${action.cardInstanceIds.map(id => cardName(id)).join(', ')}`;
    case ACTION_TYPES.PEEK:
      return `[AI] Peeked at ${action.count} cards from ${action.fromPosition} of ${zoneId(action.zoneId)}`;
    case ACTION_TYPES.REVEAL_HAND: {
      const rhZone = state.zones[action.zoneKey];
      const rhNames = rhZone?.cards.map(c => c.template.name).join(', ') ?? '';
      return `[AI] Revealed ${zoneId(action.zoneKey)}: ${rhNames}`;
    }
    case ACTION_TYPES.CREATE_DECISION:
      return `[AI] Requested decision: ${action.message ?? 'Action needed'}`;
    case ACTION_TYPES.RESOLVE_DECISION:
      return `[AI] Resolved decision`;
    case ACTION_TYPES.MULLIGAN:
      return `[AI] Mulliganed (drew ${action.drawCount})`;
    case ACTION_TYPES.COIN_FLIP:
    case ACTION_TYPES.SEARCH_ZONE:
      return null;
    case ACTION_TYPES.DECLARE_ACTION:
      return `[AI] ${action.message ?? `${action.name} declared`}`;
    default:
      return null;
  }
}
