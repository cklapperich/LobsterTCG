import type { Plugin } from '../../core/plugin/types';
import type { CardTemplate } from '../../core';
import { VISIBILITY, ACTION_TYPES } from '../../core';
import { TABLEAU_ZONE_IDS, FOUNDATION_ZONE_IDS } from './zones';

/**
 * Solitaire hooks plugin:
 * - Auto-flip: after any move, if top card of any tableau pile is face-down, flip it face-up
 * - Win detection: if all 4 foundations have 13 cards, declare victory
 */
export const solitaireHooksPlugin: Plugin<CardTemplate> = {
  id: 'solitaire-hooks',
  name: 'Solitaire Hooks',
  version: '1.0.0',

  stateObservers: [
    {
      observer: (state, _prevState, lastAction) => {
        const actions: any[] = [];

        // Only run after move/flip actions
        if (!lastAction) return actions;
        const relevantActions = new Set([
          ACTION_TYPES.MOVE_CARD,
          ACTION_TYPES.MOVE_CARD_STACK,
          ACTION_TYPES.FLIP_CARD,
          ACTION_TYPES.END_TURN,
        ]);
        if (!relevantActions.has(lastAction.type as any)) return actions;

        // Auto-flip: check each tableau pile's top card
        for (const zoneId of TABLEAU_ZONE_IDS) {
          const zoneKey = `player1_${zoneId}`;
          const zone = state.zones[zoneKey];
          if (!zone || zone.cards.length === 0) continue;

          const topCard = zone.cards[zone.cards.length - 1];
          if (!topCard.visibility[0]) {
            // Top card is face-down — flip it face-up
            actions.push({
              type: ACTION_TYPES.FLIP_CARD,
              player: 0,
              cardInstanceId: topCard.instanceId,
              newVisibility: VISIBILITY.PUBLIC,
            });
          }
        }

        // Win detection: all foundations have 13 cards
        const allFull = FOUNDATION_ZONE_IDS.every(zoneId => {
          const zone = state.zones[`player1_${zoneId}`];
          return zone && zone.cards.length === 13;
        });
        if (allFull) {
          actions.push({
            type: ACTION_TYPES.DECLARE_VICTORY,
            player: 0,
            reason: 'All foundations complete!',
          });
        }

        return actions;
      },
      priority: 100,
    },
  ],
};
