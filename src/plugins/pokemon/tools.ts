/**
 * Pokemon TCG AI tool factories.
 * Defines Pokemon-specific tools (declare_attack, set_status, etc.)
 * and helpers used by prompt-builder.ts to assemble tool sets per mode.
 */
import type { ToolSet } from 'ai';
import { tool as aiTool } from 'ai';
import { z } from 'zod';
import {
  INSTANCE_ID_PREFIX,
  resolveCardName,
  declareAction,
  setOrientation,
  moveCardStack,
  moveCard,
  ACTION_TYPES,
} from '../../core';
import { type ToolContext } from '../../core/ai-tools';
import { ZONE_IDS } from './zones';
import {
  STATUS_TO_DEGREES,
  STATUS_CONDITIONS,
  POKEMON_DECLARATION_TYPES,
} from './constants';

function tzp(ctx: ToolContext, key: string): string {
  return ctx.translateZoneKey ? ctx.translateZoneKey(key) : key;
}

export const HIDDEN_DEFAULT_TOOLS: string[] = [
  ACTION_TYPES.DICE_ROLL,
  ACTION_TYPES.FLIP_CARD,
  ACTION_TYPES.DECLARE_VICTORY,
  ACTION_TYPES.PLACE_ON_ZONE,
  ACTION_TYPES.SET_ORIENTATION,
  ACTION_TYPES.MOVE_CARD_STACK,
];

export function createSetStatusTool(ctx: ToolContext): ToolSet[string] {
  const p = ctx.playerIndex;
  return aiTool({
    description: 'Set a Pokemon\'s status condition. Only active Pokemon can have status.',
    inputSchema: z.object({
      cardName: z.string().describe('Name of the Pokemon'),
      zone: z.string().describe('Zone key the card is in (e.g. "your_active")'),
      status: z.enum([STATUS_CONDITIONS.NORMAL, STATUS_CONDITIONS.PARALYZED, STATUS_CONDITIONS.ASLEEP, STATUS_CONDITIONS.CONFUSED]).describe('Status condition to apply, or "normal" to clear'),
    }),
    async execute(input) {
      const zone = tzp(ctx, input.zone);
      return ctx.execute((state) => {
        const cardId = input.cardName.startsWith(INSTANCE_ID_PREFIX)
          ? input.cardName
          : resolveCardName(state, input.cardName, zone);
        const degrees = STATUS_TO_DEGREES[input.status] ?? STATUS_TO_DEGREES[STATUS_CONDITIONS.NORMAL];
        return setOrientation(p, cardId, degrees);
      });
    },
  });
}

export function createEndPhaseTool(description: string = 'Signal that this phase is complete.'): ToolSet[string] {
  return aiTool({
    description,
    inputSchema: z.object({}),
    execute() { return 'Phase complete.'; },
  });
}

export function createAttachEnergyTool(ctx: ToolContext): ToolSet[string] {
  const p = ctx.playerIndex;
  const handKey = `player${p + 1}_${ZONE_IDS.HAND}`;
  let usedThisTurn = false;

  const attachTool = aiTool({
    description: 'Attach 1 energy card from your hand to a Pokemon on your field. You get 1 manual energy attachment per turn.',
    inputSchema: z.object({
      cardName: z.string().describe('Name of the energy card in your hand (e.g. "Fire Energy")'),
      toZone: z.string().describe('Field zone to attach energy to (e.g. "your_active", "your_bench_1")'),
    }),
    async execute(input) {
      const toZone = tzp(ctx, input.toZone);
      const result = await ctx.execute((state) => {
        const cardId = input.cardName.startsWith(INSTANCE_ID_PREFIX)
          ? input.cardName
          : resolveCardName(state, input.cardName, handKey);
        return moveCard(p, cardId, handKey, toZone);
      });
      if (!result.startsWith('Action blocked:') && !result.startsWith('Error:')) {
        usedThisTurn = true;
      }
      return result;
    },
  });

  Object.defineProperty(attachTool, 'description', {
    get: () => usedThisTurn
      ? '[ALREADY USED THIS TURN] Attach 1 energy from hand to a Pokemon. Your manual energy attachment has been used.'
      : 'Attach 1 energy card from your hand to a Pokemon on your field. You get 1 manual energy attachment per turn.',
    enumerable: true,
    configurable: true,
  });

  return attachTool;
}

export function createPokemonCustomTools(ctx: ToolContext): ToolSet {
  const p = ctx.playerIndex;

  return {
    declare_attack: aiTool({
      description: 'Declare that your active Pokemon is using an attack. Validates energy cost and first-turn restrictions.',
      inputSchema: z.object({
        attackName: z.string().describe('Name of the attack to use'),
        targetCardName: z.string().optional().describe('Optional: name of a target card'),
        allowed_by_card_effect: z.boolean().optional().describe('Set true when a card effect permits bypassing normal rules'),
      }),
      async execute(input) {
        return ctx.execute((state) => {
          const activeKey = `player${p + 1}_${ZONE_IDS.ACTIVE}`;
          const topCard = state.zones[activeKey]?.cards.at(-1);
          const activeName = topCard?.template?.name ?? 'Active Pokemon';
          const target = input.targetCardName ? ` targeting ${input.targetCardName}` : '';
          const msg = `${activeName} used ${input.attackName}!${target}`;
          const action = declareAction(p, POKEMON_DECLARATION_TYPES.ATTACK, input.attackName, { targetCardName: input.targetCardName }, msg);
          if (input.allowed_by_card_effect) action.allowed_by_card_effect = true;
          return action;
        });
      },
    }),

    declare_retreat: aiTool({
      description: 'Declare that your active Pokemon is retreating. Logs the declaration to the game log.',
      inputSchema: z.object({
        cardName: z.string().describe('Name of the Pokemon retreating'),
      }),
      async execute(input) {
        return ctx.execute(declareAction(p, POKEMON_DECLARATION_TYPES.RETREAT, input.cardName, undefined, `${input.cardName} retreated!`));
      },
    }),

    declare_ability: aiTool({
      description: 'Declare that a Pokemon is using an ability. Logs the declaration and effect text to the game log.',
      inputSchema: z.object({
        cardName: z.string().describe('Name of the Pokemon with the ability'),
        abilityName: z.string().describe('Name of the ability to use'),
        allowed_by_card_effect: z.boolean().optional().describe('Set true when a card effect permits bypassing normal rules'),
      }),
      async execute(input) {
        const msg = `${input.cardName} used ability: ${input.abilityName}`;
        const action = declareAction(p, POKEMON_DECLARATION_TYPES.ABILITY, input.abilityName, { cardName: input.cardName }, msg);
        if (input.allowed_by_card_effect) action.allowed_by_card_effect = true;
        return ctx.execute(action);
      },
    }),

    set_status: createSetStatusTool(ctx),
    attach_energy: createAttachEnergyTool(ctx),

    discard_pokemon_cards: aiTool({
      description: 'Discard all cards in a zone. Moves every card from the specified zone to your discard pile. ALWAYS Use this when your pokemon get knocked out.',
      inputSchema: z.object({
        zone: z.string().describe('Zone key to discard all cards from (e.g. "your_active", "your_bench_1")'),
      }),
      async execute(input) {
        const zoneKey = tzp(ctx, input.zone);
        return ctx.execute((state) => {
          const zone = state.zones[zoneKey];
          if (!zone) throw new Error(`Zone "${input.zone}" not found`);
          if (zone.cards.length === 0) throw new Error(`Zone "${input.zone}" is empty`);
          const cardIds = zone.cards.map(c => c.instanceId);
          const discardKey = `player${p + 1}_${ZONE_IDS.DISCARD}`;
          return moveCardStack(p, cardIds, zoneKey, discardKey);
        });
      },
    }),
  };
}
