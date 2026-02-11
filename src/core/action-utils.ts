import type { Action, MoveCardAction, MoveCardStackAction } from './types';
import { ACTION_TYPES } from './types';

/**
 * Unpacked fields from a move_card or move_card_stack action.
 * - cardId: first card in the stack (or the single card for move_card)
 * - topCardId: last card in the stack (same as cardId for move_card; used for evolution checks)
 * - allCardIds: all card instance IDs
 * - fromZone / toZone: zone keys
 */
export interface UnpackedMoveAction {
  cardId: string;
  topCardId: string;
  allCardIds: string[];
  fromZone: string;
  toZone: string;
}

/**
 * Extract common fields from move_card / move_card_stack actions.
 * Returns null for non-move actions or move_card_stack with empty cardInstanceIds.
 */
export function unpackMoveAction(action: Action): UnpackedMoveAction | null {
  if (action.type === ACTION_TYPES.MOVE_CARD) {
    const a = action as MoveCardAction;
    return {
      cardId: a.cardInstanceId,
      topCardId: a.cardInstanceId,
      allCardIds: [a.cardInstanceId],
      fromZone: a.fromZone,
      toZone: a.toZone,
    };
  }
  if (action.type === ACTION_TYPES.MOVE_CARD_STACK) {
    const a = action as MoveCardStackAction;
    if (a.cardInstanceIds.length === 0) return null;
    return {
      cardId: a.cardInstanceIds[0],
      topCardId: a.cardInstanceIds.at(-1)!,
      allCardIds: a.cardInstanceIds,
      fromZone: a.fromZone,
      toZone: a.toZone,
    };
  }
  return null;
}
