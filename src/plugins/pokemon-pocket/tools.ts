/**
 * Pokemon Pocket AI tool factories.
 * Defines Pocket-specific tools (declare_attack, attach_energy from energy zone, etc.)
 */
import type { ToolSet } from 'ai';
import { tool as aiTool } from 'ai';
import { z } from 'zod';
import { INSTANCE_ID_PREFIX, ACTION_TYPES } from '../../core/types/constants';
import { resolveCardName } from '../../core/readable';
import { declareAction, setOrientation, moveCardStack, addCounter, removeCounter, addZoneCounter, removeZoneCounter } from '../../core/action';
import { type ToolContext } from '../../core/ai-tools';
import { ZONE_IDS } from './zones';
import {
  STATUS_TO_DEGREES,
  STATUS_CONDITIONS,
  POCKET_DECLARATION_TYPES,
  ENERGY_COUNTER_TYPES,
  POINTS_TO_WIN,
} from './constants';
import type { EnergyType } from './types';
import { getPluginState } from './plugin-state';


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
    description: 'Set a Pokemon\'s status condition. Only active Pokemon can have status. Pocket only has paralyzed and asleep.',
    inputSchema: z.object({
      cardName: z.string().describe('Name of the Pokemon'),
      zone: z.string().describe('Zone key the card is in (e.g. "your_active")'),
      status: z.enum([STATUS_CONDITIONS.NORMAL, STATUS_CONDITIONS.PARALYZED, STATUS_CONDITIONS.ASLEEP]).describe('Status condition to apply, or "normal" to clear'),
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

/**
 * Check whether an attack was already declared this turn.
 */
function wasAttackDeclaredThisTurn(ctx: ToolContext, p: number): boolean {
  const state = ctx.getState();
  for (const a of state.currentTurn.actions) {
    if (
      a.type === ACTION_TYPES.DECLARE_ACTION &&
      (a as any).declarationType === POCKET_DECLARATION_TYPES.ATTACK &&
      a.player === p
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Attach energy from the energy zone to a Pokemon.
 * Consumes the current energy from the zone queue, adds it as a counter,
 * and auto-advances the queue (next → current, generate new next).
 *
 * Can be called multiple times per turn for acceleration effects
 * (Misty, Gardevoir, Moltres ex) — each call consumes from the queue.
 */
export function createAttachEnergyTool(ctx: ToolContext): ToolSet[string] {
  const p = ctx.playerIndex;

  const attachTool = aiTool({
    description: 'Attach energy from the energy zone to a Pokemon on your field. Consumes the current energy and advances the queue.',
    inputSchema: z.object({
      toZone: z.string().describe('Field zone to attach energy to (e.g. "your_active", "your_bench_1")'),
    }),
    async execute(input) {
      const state = ctx.getState();
      const ps = getPluginState(state);
      const zone = ps.energyZone[p];

      if (!zone.current) {
        return '[NO ENERGY AVAILABLE] The energy zone is empty.';
      }

      const energyType = zone.current;
      const counterType = ENERGY_COUNTER_TYPES[energyType as EnergyType];
      const toZone = tzp(ctx, input.toZone);

      const result = await ctx.execute((state) => {
        const zoneObj = state.zones[toZone];
        if (!zoneObj) throw new Error(`Zone "${input.toZone}" not found`);
        if (zoneObj.cards.length === 0) throw new Error(`Zone "${input.toZone}" is empty`);
        const topCard = zoneObj.cards[zoneObj.cards.length - 1];
        return addCounter(p, topCard.instanceId, counterType, 1);
      });

      // Advance energy zone via a broadcast DECLARE_ACTION so both P2P peers stay in sync.
      const seed = Math.floor(Math.random() * 0x7FFFFFFF);
      await ctx.execute(() => declareAction(p, 'advance_energy', 'advance_energy', { playerIndex: p, seed }));

      return result;
    },
  });

  Object.defineProperty(attachTool, 'description', {
    get: () => {
      const state = ctx.getState();
      const ps = getPluginState(state);
      const zone = ps.energyZone[p];
      const next = zone.next ? ` (next turn: ${zone.next})` : '';
      if (!zone.current) {
        return `[ALREADY USED] Energy already attached this turn.${next}`;
      }
      return `Attach ${zone.current} energy from energy zone to a Pokemon${next}. Consumes current and advances queue.`;
    },
    enumerable: true,
    configurable: true,
  });

  return attachTool;
}

/**
 * Award points to a player. Used after KO'ing an opponent's Pokemon.
 * Points can only be added, never removed.
 * Basic KO = 1 point, ex KO = 2 points.
 * Dispatches a DeclareAction so it syncs via P2P and triggers a splash banner.
 * The actual point mutation happens in a post-hook (see hooks.ts).
 */
export function createAwardPointsTool(ctx: ToolContext): ToolSet[string] {
  const p = ctx.playerIndex;
  return aiTool({
    description: `Award points after KO'ing a Pokemon. Basic KO = 1 point, ex KO = 2 points. First to ${POINTS_TO_WIN} wins.`,
    inputSchema: z.object({
      targetPlayer: z.enum(['you', 'opponent']).describe('Who receives the points'),
      amount: z.number().min(1).max(2).describe('Points to award (1 for basic KO, 2 for ex KO)'),
    }),
    async execute(input) {
      const playerIdx = input.targetPlayer === 'you' ? p : (p === 0 ? 1 : 0);
      const msg = `Player ${playerIdx + 1} earned ${input.amount} point${input.amount > 1 ? 's' : ''}!`;
      return ctx.execute(
        declareAction(p, POCKET_DECLARATION_TYPES.AWARD_POINTS, msg, {
          targetPlayer: playerIdx,
          amount: input.amount,
        }, msg),
      );
    },
  });
}

/**
 * Transfer energy between cards and/or the energy_discard zone.
 * Handles: card→card, card→energy_discard, energy_discard→card.
 */
export function createTransferEnergyTool(ctx: ToolContext): ToolSet[string] {
  const p = ctx.playerIndex;
  return aiTool({
    description: 'Transfer energy counters between Pokemon or the energy discard zone. Use when recovering energy or manually discarding energy.',
    inputSchema: z.object({
      from: z.string().describe('Source: card name in a zone, or "your_energy_discard" / "opponent_energy_discard"'),
      fromZone: z.string().optional().describe('Zone key of source card (required if from is a card name)'),
      to: z.string().describe('Destination: card name in a zone, or "your_energy_discard" / "opponent_energy_discard"'),
      toZone: z.string().optional().describe('Zone key of destination card (required if to is a card name)'),
      energyType: z.string().describe('Energy counter type (e.g. "fire_energy", "water_energy")'),
      amount: z.number().min(1).default(1).describe('Amount of energy to transfer'),
    }),
    async execute(input) {
      const results: string[] = [];

      // Resolve "from" — zone counter or card counter
      const fromIsZone = input.from.endsWith('_energy_discard');
      if (fromIsZone) {
        const zoneKey = tzp(ctx, input.from);
        const r = await ctx.execute(removeZoneCounter(p, zoneKey, input.energyType, input.amount));
        results.push(typeof r === 'string' ? r : 'Removed from energy discard');
      } else {
        const fromZone = tzp(ctx, input.fromZone ?? '');
        const r = await ctx.execute((state) => {
          const cardId = input.from.startsWith(INSTANCE_ID_PREFIX)
            ? input.from
            : resolveCardName(state, input.from, fromZone);
          return removeCounter(p, cardId, input.energyType, input.amount);
        });
        results.push(typeof r === 'string' ? r : 'Removed from card');
      }

      // Resolve "to" — zone counter or card counter
      const toIsZone = input.to.endsWith('_energy_discard');
      if (toIsZone) {
        const zoneKey = tzp(ctx, input.to);
        const r = await ctx.execute(addZoneCounter(p, zoneKey, input.energyType, input.amount));
        results.push(typeof r === 'string' ? r : 'Added to energy discard');
      } else {
        const toZone = tzp(ctx, input.toZone ?? '');
        const r = await ctx.execute((state) => {
          const cardId = input.to.startsWith(INSTANCE_ID_PREFIX)
            ? input.to
            : resolveCardName(state, input.to, toZone);
          return addCounter(p, cardId, input.energyType, input.amount);
        });
        results.push(typeof r === 'string' ? r : 'Added to card');
      }

      return results.join('; ');
    },
  });
}

export function createPocketCustomTools(ctx: ToolContext): ToolSet {
  const p = ctx.playerIndex;

  const attackTool = aiTool({
    description: 'Declare that your active Pokemon is using an attack. You may only attack once per turn. After attacking, call end_turn.',
    inputSchema: z.object({
      attackName: z.string().describe('Name of the attack to use'),
      targetCardName: z.string().optional().describe('Optional: name of a target card'),
    }),
    async execute(input) {
      if (wasAttackDeclaredThisTurn(ctx, p)) {
        return '[ALREADY USED THIS TURN] You already attacked this turn. Call end_turn to finish your turn.';
      }
      return ctx.execute((state) => {
        const activeKey = `player${p + 1}_${ZONE_IDS.ACTIVE}`;
        const topCard = state.zones[activeKey]?.cards.at(-1);
        const activeName = topCard?.template?.name ?? 'Active Pokemon';
        const target = input.targetCardName ? ` targeting ${input.targetCardName}` : '';
        const msg = `${activeName} used ${input.attackName}!${target}`;
        return declareAction(p, POCKET_DECLARATION_TYPES.ATTACK, input.attackName, { targetCardName: input.targetCardName }, msg);
      });
    },
  });

  Object.defineProperty(attackTool, 'description', {
    get: () => wasAttackDeclaredThisTurn(ctx, p)
      ? '[ALREADY USED THIS TURN] Attack already declared this turn. Call end_turn to finish your turn.'
      : 'Declare that your active Pokemon is using an attack. You may only attack once per turn. After attacking, call end_turn.',
    enumerable: true,
    configurable: true,
  });

  return {
    declare_attack: attackTool,

    declare_retreat: aiTool({
      description: 'Declare that your active Pokemon is retreating. Logs the declaration.',
      inputSchema: z.object({
        cardName: z.string().describe('Name of the Pokemon retreating'),
      }),
      async execute(input) {
        return ctx.execute(declareAction(p, POCKET_DECLARATION_TYPES.RETREAT, input.cardName, undefined, `${input.cardName} retreated!`));
      },
    }),

    declare_ability: aiTool({
      description: 'Declare that a Pokemon is using an ability. Logs the declaration and effect text.',
      inputSchema: z.object({
        cardName: z.string().describe('Name of the Pokemon with the ability'),
        abilityName: z.string().describe('Name of the ability to use'),
      }),
      async execute(input) {
        const msg = `${input.cardName} used ability: ${input.abilityName}`;
        return ctx.execute(declareAction(p, POCKET_DECLARATION_TYPES.ABILITY, input.abilityName, { cardName: input.cardName }, msg));
      },
    }),

    set_status: createSetStatusTool(ctx),
    attach_energy: createAttachEnergyTool(ctx),
    award_points: createAwardPointsTool(ctx),
    transfer_energy: createTransferEnergyTool(ctx),

    discard_pokemon_cards: aiTool({
      description: 'Discard all cards in a zone. Moves every card to that zone owner\'s discard pile. Energy counters are auto-tallied to the energy discard readout. Use this when any pokemon gets knocked out.',
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
          const ownerPrefix = zoneKey.split('_')[0];
          const discardKey = `${ownerPrefix}_${ZONE_IDS.DISCARD}`;
          return moveCardStack(p, cardIds, zoneKey, discardKey);
        });
      },
    }),
  };
}
