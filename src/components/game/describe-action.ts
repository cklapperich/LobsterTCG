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
      return `$player${state.activePlayer} Drew ${action.count} card(s)`;
    case ACTION_TYPES.MOVE_CARD:
      return `$player${state.activePlayer} Moved ${cardName(action.cardInstanceId)} from ${zoneId(action.fromZone)} to ${zoneId(action.toZone)}`;
    case ACTION_TYPES.MOVE_CARD_STACK:
      return `$player${state.activePlayer} Moved ${action.cardInstanceIds.length} cards from ${zoneId(action.fromZone)} to ${zoneId(action.toZone)}`;
    case ACTION_TYPES.PLACE_ON_ZONE:
      return `$player${state.activePlayer} Placed ${action.cardInstanceIds.length} card(s) on ${action.position} of ${zoneId(action.zoneId)}`;
    case ACTION_TYPES.SHUFFLE:
      return `$player${state.activePlayer} Shuffled ${zoneId(action.zoneId)}`;
    case ACTION_TYPES.FLIP_CARD:
      return `$player${state.activePlayer} Flipped ${cardName(action.cardInstanceId)} ${action.newVisibility[0] ? 'face up' : 'face down'}`;
    case ACTION_TYPES.SET_ORIENTATION:
      return action.orientation === '0'
        ? `$player${state.activePlayer} ${cardName(action.cardInstanceId)} rotation cleared`
        : `$player${state.activePlayer} ${cardName(action.cardInstanceId)} rotated to ${action.orientation}°`;
    case ACTION_TYPES.ADD_COUNTER:
      return `$player${state.activePlayer} Added ${action.amount}x ${counterName(action.counterType)} to ${cardName(action.cardInstanceId)}`;
    case ACTION_TYPES.REMOVE_COUNTER:
      return `$player${state.activePlayer} Removed ${action.amount}x ${counterName(action.counterType)} from ${cardName(action.cardInstanceId)}`;
    case ACTION_TYPES.SET_COUNTER:
      return `$player${state.activePlayer} Set ${counterName(action.counterType)} on ${cardName(action.cardInstanceId)} to ${action.value}`;
    case ACTION_TYPES.DICE_ROLL:
      return `$player${state.activePlayer} Rolled ${action.count}d${action.sides}`;
    case ACTION_TYPES.END_TURN:
      return `$player${state.activePlayer} Ended turn`;
    case ACTION_TYPES.CONCEDE:
      return `$player${state.activePlayer} Conceded`;
    case ACTION_TYPES.DECLARE_VICTORY:
      return `$player${state.activePlayer} Declared victory: ${action.reason ?? 'unknown'}`;
    case ACTION_TYPES.REVEAL:
      return `$player${state.activePlayer} Revealed ${action.cardInstanceIds.map(id => cardName(id)).join(', ')}`;
    case ACTION_TYPES.PEEK:
      return `$player${state.activePlayer} Peeked at ${action.count} cards from ${action.fromPosition} of ${zoneId(action.zoneId)}`;
    case ACTION_TYPES.REVEAL_HAND: {
      const rhZone = state.zones[action.zoneKey];
      const rhNames = rhZone?.cards.map(c => c.template.name).join(', ') ?? '';
      return `$player${state.activePlayer} Revealed ${zoneId(action.zoneKey)}: ${rhNames}`;
    }
    case ACTION_TYPES.CREATE_DECISION:
      return `$player${state.activePlayer} Requested decision: ${action.message ?? 'Action needed'}`;
    case ACTION_TYPES.RESOLVE_DECISION:
      return `$player${state.activePlayer} Resolved decision`;
    case ACTION_TYPES.MULLIGAN:
      return `$player${state.activePlayer} Mulliganed (drew ${action.drawCount})`;
    case ACTION_TYPES.COIN_FLIP:
    case ACTION_TYPES.SEARCH_ZONE:
      return null;
    case ACTION_TYPES.DECLARE_ACTION:
      return `$player${state.activePlayer} ${action.message ?? `${action.name} declared`}`;
    default:
      return null;
  }
}
