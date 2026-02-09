/**
 * Pokemon TCG AI tool factories.
 * Defines Pokemon-specific tools (declare_attack, set_status, etc.)
 * and helpers used by prompt-builder.ts to assemble tool sets per mode.
 */
import {
  ACTION_TYPES,
  INSTANCE_ID_PREFIX,
  resolveCardName,
  declareAction,
  setOrientation,
  moveCardStack,
} from '../../core';
import { type RunnableTool, type ToolContext } from '../../core/ai-tools';
import { ZONE_IDS } from './zones';
import {
  STATUS_TO_DEGREES,
  STATUS_CONDITIONS,
  POKEMON_DECLARATION_TYPES,
} from './constants';

/** Local tool factory matching RunnableTool shape. */
function tool(options: {
  name: string;
  description: string;
  inputSchema: Record<string, unknown> & { type: 'object' };
  run: (input: any) => Promise<string> | string;
}): RunnableTool {
  return {
    name: options.name,
    description: options.description,
    parameters: options.inputSchema,
    execute: options.run,
  };
}

/** Translate an AI-perspective zone key using the context's translator. */
function tzp(ctx: ToolContext, key: string): string {
  return ctx.translateZoneKey ? ctx.translateZoneKey(key) : key;
}

/**
 * Core tool names that don't apply to Pokemon TCG.
 * - dice_roll: Pokemon uses coins, not dice
 * - flip_card: visibility is managed by zones, not manual flips
 * - declare_victory: victory is determined by prize cards, deck-out, or bench-out
 * - place_on_zone: not a standard Pokemon action for AI
 * - set_orientation: wrapped by set_status instead
 * - move_card_stack: AI misuses this (dumps entire hand onto field)
 */
export const HIDDEN_DEFAULT_TOOLS: string[] = [
  ACTION_TYPES.DICE_ROLL,
  ACTION_TYPES.FLIP_CARD,
  ACTION_TYPES.DECLARE_VICTORY,
  ACTION_TYPES.PLACE_ON_ZONE,
  ACTION_TYPES.SET_ORIENTATION,
  ACTION_TYPES.MOVE_CARD_STACK,
];

/** Create the set_status tool (Pokemon-specific wrapper around orientation). */
export function createSetStatusTool(ctx: ToolContext): RunnableTool {
  const p = ctx.playerIndex;
  return tool({
    name: 'set_status',
    description: 'Set a Pokemon\'s status condition. Only active Pokemon can have status.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cardName: { type: 'string', description: 'Name of the Pokemon' },
        zone: { type: 'string', description: 'Zone key the card is in (e.g. "your_active")' },
        status: { type: 'string', enum: [STATUS_CONDITIONS.NORMAL, STATUS_CONDITIONS.PARALYZED, STATUS_CONDITIONS.ASLEEP, STATUS_CONDITIONS.CONFUSED], description: 'Status condition to apply, or "normal" to clear' },
      },
      required: ['cardName', 'zone', 'status'],
    },
    async run(input) {
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

/** No-op end_phase tool. Just returns a string; AbortController stops the agent. */
export function createEndPhaseTool(description: string = 'Signal that this phase is complete.'): RunnableTool {
  return tool({
    name: 'end_phase',
    description,
    inputSchema: { type: 'object' as const, properties: {}, required: [] },
    run() { return 'Phase complete.'; },
  });
}

/** Create all Pokemon-specific custom tools (attacks, abilities, retreat, discard, status). */
export function createPokemonCustomTools(ctx: ToolContext): RunnableTool[] {
  const p = ctx.playerIndex;
  const tools: RunnableTool[] = [];

  tools.push(tool({
    name: 'declare_attack',
    description: 'Declare that your active Pokemon is using an attack. Validates energy cost and first-turn restrictions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        attackName: { type: 'string', description: 'Name of the attack to use' },
        targetCardName: { type: 'string', description: 'Optional: name of a target card' },
        allowed_by_card_effect: { type: 'boolean', description: 'Set true when a card effect permits bypassing normal rules (e.g. attacking on first turn)' },
      },
      required: ['attackName'],
    },
    async run(input) {
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
  }));

  tools.push(tool({
    name: 'declare_retreat',
    description: 'Declare that your active Pokemon is retreating. Logs the declaration to the game log.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cardName: { type: 'string', description: 'Name of the Pokemon retreating' },
      },
      required: ['cardName'],
    },
    async run(input) {
      return ctx.execute(declareAction(p, POKEMON_DECLARATION_TYPES.RETREAT, input.cardName, undefined, `${input.cardName} retreated!`));
    },
  }));

  tools.push(tool({
    name: 'declare_ability',
    description: 'Declare that a Pokemon is using an ability. Logs the declaration and effect text to the game log.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        cardName: { type: 'string', description: 'Name of the Pokemon with the ability' },
        abilityName: { type: 'string', description: 'Name of the ability to use' },
        allowed_by_card_effect: { type: 'boolean', description: 'Set true when a card effect permits bypassing normal rules' },
      },
      required: ['cardName', 'abilityName'],
    },
    async run(input) {
      const msg = `${input.cardName} used ability: ${input.abilityName}`;
      const action = declareAction(p, POKEMON_DECLARATION_TYPES.ABILITY, input.abilityName, { cardName: input.cardName }, msg);
      if (input.allowed_by_card_effect) action.allowed_by_card_effect = true;
      return ctx.execute(action);
    },
  }));

  // Status condition tool
  tools.push(createSetStatusTool(ctx));

  // Discard all cards from a zone
  tools.push(tool({
    name: 'discard_pokemon_cards',
    description: 'Discard all cards in a zone. Moves every card from the specified zone to your discard pile. ALWAYS Use this when your pokemon get knocked out.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        zone: { type: 'string', description: 'Zone key to discard all cards from (e.g. "your_active", "your_bench_1")' },
      },
      required: ['zone'],
    },
    async run(input) {
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
  }));

  return tools;
}
