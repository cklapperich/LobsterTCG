import type { CardTemplate, PlayerIndex, Action } from './types';
import type { GameState } from './types';
import type { ToolSet } from 'ai';
import { INSTANCE_ID_PREFIX, ORIENTATIONS } from './types';
import { resolveCardName, formatCardInventory } from './readable';
import {
  draw,
  moveCard,
  shuffle,
  addCounter,
  removeCounter,
  coinFlip,
  diceRoll,
  endTurn,
  concede,
  peek,
  reveal,
  flipCard,
  setOrientation,
  placeOnZone,
  moveCardStack,
  declareVictory,
  createDecision,
  resolveDecision,
  revealHand,
  mulligan,
  swapCardStacks,
  rearrangeZone,
} from './action';
import type { Visibility } from './types';
import { tool as aiTool } from 'ai';
import { z } from 'zod';

export interface ToolContext {
  playerIndex: PlayerIndex;
  execute: (actionOrFactory: Action | ((state: GameState<CardTemplate>) => Action)) => Promise<string>;
  getState: () => GameState<CardTemplate>;
  getReadableState: () => string;
  isDecisionResponse?: boolean;
  formatCardForSearch?: (template: CardTemplate) => string;
  translateZoneKey?: (key: string) => string;
  counterTypes?: string[];
  createCheckpoint?: () => any;
  restoreState?: (snapshot: any) => void;
}

export type ToolExecutionContext = {
  stepState?: import('../ai/run-turn').StepState;
  abort?: AbortController;
  rewindSignal?: import('../ai/run-turn').RewindSignal;
  restoreCheckpoint?: () => void;
  terminalTools: Set<string>;
};

export function wrapToolsWithContext(tools: ToolSet, context: ToolExecutionContext): ToolSet {
  const result: ToolSet = {};
  for (const [name, tool] of Object.entries(tools)) {
    const originalExecute = (tool as any).execute;
    result[name] = {
      ...tool,
      execute: async (args: any, options?: any) => {
        if (context.stepState?.blocked) {
          return `Cancelled: a prior action in this parallel batch was blocked (${context.stepState.blockReason}). All remaining actions have been cancelled. Review the error and adjust your plan.`;
        }
        try {
          const res = await originalExecute(args, options);
          if (context.terminalTools.has(name) && context.abort) {
            context.abort.abort();
            if (context.stepState) {
              context.stepState.blocked = true;
              context.stepState.blockReason = `${name} executed - turn ending`;
            }
          }
          if (name === 'rewind' && context.rewindSignal) {
            context.rewindSignal.triggered = true;
            context.rewindSignal.reason = args.reason ?? '';
            context.rewindSignal.guidance = args.guidance ?? '';
            if (context.stepState) {
              context.stepState.blocked = true;
              context.stepState.blockReason = 'Rewind triggered — remaining actions cancelled';
            }
            context.restoreCheckpoint?.();
          }
          return res;
        } catch (e: any) {
          const msg = e?.message ?? String(e);
          if (context.stepState) {
            context.stepState.blocked = true;
            context.stepState.blockReason = msg;
          }
          return `Error: ${msg}`;
        }
      },
    };
  }
  return result;
}

function resolveCard(
  state: GameState<CardTemplate>,
  cardName: string,
  zoneKey: string
): string {
  if (cardName.startsWith(INSTANCE_ID_PREFIX)) return cardName;
  return resolveCardName(state, cardName, zoneKey);
}

export function resolveCardByPosition(
  state: GameState<CardTemplate>,
  zoneKey: string,
  fromPosition?: string
): string {
  const zone = state.zones[zoneKey];
  if (!zone) throw new Error(`Zone not found: ${zoneKey}`);
  if (zone.cards.length === 0) throw new Error(`Zone "${zoneKey}" is empty`);

  if (!fromPosition || fromPosition === 'top') return zone.cards[0].instanceId;
  if (fromPosition === 'bottom') return zone.cards[zone.cards.length - 1].instanceId;

  const index = parseInt(fromPosition, 10);
  if (isNaN(index) || index < 0 || index >= zone.cards.length)
    throw new Error(`Invalid position "${fromPosition}" for zone with ${zone.cards.length} cards`);
  return zone.cards[index].instanceId;
}

function tz(ctx: ToolContext, key: string): string {
  return ctx.translateZoneKey ? ctx.translateZoneKey(key) : key;
}

function createTool<T extends z.ZodSchema>(
  description: string,
  inputSchema: T,
  execute: (args: z.infer<T>) => Promise<string>
) {
  return aiTool({
    description,
    inputSchema,
    execute,
  });
}

export function createDefaultTools(ctx: ToolContext): ToolSet {
  const p = ctx.playerIndex;

  return {
    draw: createTool('Draw cards from the top of your deck into your hand.',
      z.object({ count: z.number().optional().describe('Number of cards to draw (default 1)') }),
      async ({ count }) => ctx.execute(draw(p, count ?? 1))),

    move_card: createTool('Move a card from one zone to another. Always specify cardName for visible cards. Omit cardName only for face-down cards (takes from top of zone).',
      z.object({
        cardName: z.string().optional().describe('Name of the card to move. Always provide for visible cards. Omit only for face-down cards (takes top card).'),
        fromZone: z.string().describe('Zone key (e.g. "your_hand")'),
        toZone: z.string().describe('Zone key to move the card to (e.g. "your_active")'),
        toPosition: z.enum(['top', 'bottom']).optional().describe('"top" = top of zone (default), "bottom" = bottom of zone'),
      }),
      async ({ cardName, fromZone, toZone, toPosition }) => {
        const fromZoneKey = tz(ctx, fromZone);
        const toZoneKey = tz(ctx, toZone);
        return ctx.execute((state) => {
          const cardId = cardName
            ? resolveCard(state, cardName, fromZoneKey)
            : resolveCardByPosition(state, fromZoneKey);
          return moveCard(p, cardId, fromZoneKey, toZoneKey, toPosition ?? 'top');
        });
      }),

    move_card_stack: createTool('Move ALL cards from one zone to another as a group (e.g. moving a Pokemon and all its attachments).',
      z.object({
        fromZone: z.string().describe('Zone key to move all cards from (e.g. "your_active")'),
        toZone: z.string().describe('Zone key to move the cards to (e.g. "your_discard")'),
        toPosition: z.enum(['top', 'bottom']).optional().describe('"top" = top of zone (default), "bottom" = bottom of zone'),
      }),
      async ({ fromZone, toZone, toPosition }) => {
        const fromZoneKey = tz(ctx, fromZone);
        const toZoneKey = tz(ctx, toZone);
        const zone = ctx.getState().zones[fromZoneKey];
        if (!zone) return `Error: zone "${fromZone}" not found`;
        if (zone.cards.length === 0) return `Error: zone "${fromZone}" is empty`;
        const cardIds = zone.cards.map(c => c.instanceId);
        return ctx.execute(moveCardStack(p, cardIds, fromZoneKey, toZoneKey, toPosition ?? 'top'));
      }),

    swap_card_stacks: createTool('Swap all cards between two zones. Both zones exchange their entire contents atomically. Works even if one or both zones are empty.',
      z.object({
        zone1: z.string().describe('First zone key (e.g. "your_active")'),
        zone2: z.string().describe('Second zone key (e.g. "your_bench_1")'),
      }),
      async ({ zone1, zone2 }) => ctx.execute(swapCardStacks(p, tz(ctx, zone1), tz(ctx, zone2)))),

    place_on_zone: createTool('Place cards on the top or bottom of a zone.',
      z.object({
        cardNames: z.array(z.string()).describe('Names of the cards to place'),
        zone: z.string().describe('Target zone key (e.g. "your_deck")'),
        position: z.enum(['top', 'bottom']).describe('Place on top or bottom of the zone'),
      }),
      async ({ cardNames, zone, position }) => {
        const zoneKey = tz(ctx, zone);
        return ctx.execute((state) => {
          const cardIds = cardNames.map((name: string) => {
            if (name.startsWith(INSTANCE_ID_PREFIX)) return name;
            for (const zk of Object.keys(state.zones)) {
              try { return resolveCardName(state, name, zk); } catch { /* try next zone */ }
            }
            throw new Error(`Card "${name}" not found in any zone`);
          });
          return placeOnZone(p, cardIds, zoneKey, position);
        });
      }),

    shuffle: createTool('Shuffle a zone (typically your deck).',
      z.object({ zone: z.string().describe('Zone key to shuffle (e.g. "your_deck")') }),
      async ({ zone }) => ctx.execute(shuffle(p, tz(ctx, zone)))),

    search_zone: createTool('Search a zone to see all cards and their full details. Read-only — does not modify game state. After reviewing, use move_card to take cards, then shuffle the zone.',
      z.object({ zone: z.string().describe('Zone key to search (e.g. "your_deck")') }),
      async ({ zone }) => {
        const state = ctx.getState();
        const zoneKey = tz(ctx, zone);
        const displayKey = zone;
        const zoneObj = state.zones[zoneKey];
        if (!zoneObj) return `Error: zone "${displayKey}" not found`;
        if (zoneObj.cards.length === 0) return `Zone "${displayKey}" is empty`;

        const templates = zoneObj.cards.map(c => c.template);
        const inventory = formatCardInventory(templates, ctx.formatCardForSearch);
        const uniqueCount = new Set(templates.map(t => t.name)).size;

        return [
          `=== SEARCH: ${zoneObj.config?.name ?? displayKey} (${zoneObj.cards.length} cards, ${uniqueCount} unique) ===`,
          '', inventory, '', '---',
          `You are resolving a zone search. Review the cards above and select which to take.`,
          `Use move_card with fromZone="${displayKey}" and cardName="<name>" to move cards.`,
          `Then call shuffle with zone="${displayKey}" to shuffle the zone.`,
        ].join('\n');
      }),

    flip_card: createTool('Change a card\'s visibility (face-up/face-down).',
      z.object({
        cardName: z.string().describe('Name of the card to flip'),
        zone: z.string().describe('Zone key the card is in'),
        visibility: z.enum(['public', 'hidden', 'owner_only']).describe('New visibility: "public" (both see), "hidden" (neither sees), "owner_only" (only you see)'),
      }),
      async ({ cardName, zone, visibility }) => {
        const zoneKey = tz(ctx, zone);
        return ctx.execute((state) => {
          const cardId = resolveCard(state, cardName, zoneKey);
          const visMap: Record<string, Visibility> = {
            public: [true, true],
            hidden: [false, false],
            owner_only: p === 0 ? [true, false] : [false, true],
          };
          return flipCard(p, cardId, visMap[visibility] ?? [true, true]);
        });
      }),

    set_orientation: createTool('Set card rotation/orientation by degrees.',
      z.object({
        cardName: z.string().describe('Name of the card'),
        zone: z.string().describe('Zone key the card is in'),
        orientation: z.enum([ORIENTATIONS.NORMAL, ORIENTATIONS.TAPPED, ORIENTATIONS.COUNTER_TAPPED, ORIENTATIONS.FLIPPED]).describe('"0" = upright, "90" = 90° clockwise, "-90" = 90° counter-clockwise, "180" = upside-down'),
      }),
      async ({ cardName, zone, orientation }) => {
        const zoneKey = tz(ctx, zone);
        return ctx.execute((state) => {
          const cardId = resolveCard(state, cardName, zoneKey);
          return setOrientation(p, cardId, orientation);
        });
      }),

    add_counter: createTool('Add counters to a card (e.g. damage counters).',
      z.object({
        cardName: z.string().describe('Name of the card'),
        zone: z.string().describe('Zone key the card is in (e.g. "opponent_active")'),
        counterType: z.string().refine((type) => !ctx.counterTypes || ctx.counterTypes.includes(type), { message: "Invalid counter type" }).describe('Counter type'),
        amount: z.number().optional().describe('Number of counters to add (default 1)'),
      }),
      async ({ cardName, zone, counterType, amount }) => {
        const zoneKey = tz(ctx, zone);
        return ctx.execute((state) => {
          const cardId = resolveCard(state, cardName, zoneKey);
          return addCounter(p, cardId, counterType ?? 'damage', amount ?? 1);
        });
      }),

    remove_counter: createTool('Remove counters from a card.',
      z.object({
        cardName: z.string().describe('Name of the card'),
        zone: z.string().describe('Zone key the card is in'),
        counterType: z.string().refine((type) => !ctx.counterTypes || ctx.counterTypes.includes(type), { message: "Invalid counter type" }).describe('Counter type to remove'),
        amount: z.number().optional().describe('Number of counters to remove (default 1)'),
      }),
      async ({ cardName, zone, counterType, amount }) => {
        const zoneKey = tz(ctx, zone);
        return ctx.execute((state) => {
          const cardId = resolveCard(state, cardName, zoneKey);
          return removeCounter(p, cardId, counterType ?? 'damage', amount ?? 1);
        });
      }),

    coin_flip: createTool('Flip one or more coins. Returns heads (true) or tails (false) for each.',
      z.object({ num_coins: z.number().optional().describe('Number of coins to flip (default 1)') }),
      async ({ num_coins }) => ctx.execute(coinFlip(p, num_coins ?? 1))),

    dice_roll: createTool('Roll one or more dice.',
      z.object({
        sides: z.number().optional().describe('Number of sides on the die (default 6)'),
        count: z.number().optional().describe('Number of dice to roll (default 1)'),
      }),
      async ({ sides, count }) => ctx.execute(diceRoll(p, sides ?? 6, count ?? 1))),

    peek: createTool('Look at the top or bottom cards of a zone. Returns full card details and positions. Use after peek: move_card to take cards, rearrange_zone to reorder, shuffle to randomize.',
      z.object({
        zone: z.string().describe('Zone key to peek at (e.g. "your_deck")'),
        count: z.number().optional().describe('Number of cards to peek at (default 1)'),
        fromPosition: z.enum(['top', 'bottom']).optional().describe('Peek from top or bottom (default "top")'),
      }),
      async ({ zone, count, fromPosition }) => {
        const actualCount = count ?? 1;
        const from = fromPosition ?? 'top';
        const zoneKey = tz(ctx, zone);
        const displayKey = zone;

        await ctx.execute(peek(p, zoneKey, actualCount, from));

        const state = ctx.getState();
        const zoneObj = state.zones[zoneKey];
        if (!zoneObj || zoneObj.cards.length === 0) return `Zone "${displayKey}" is empty`;

        const finalCount = Math.min(actualCount, zoneObj.cards.length);
        const peekedCards = from === 'top'
          ? zoneObj.cards.slice(zoneObj.cards.length - finalCount).reverse()
          : zoneObj.cards.slice(0, finalCount);

        const lines: string[] = [`Peeked at ${from} ${finalCount} of ${displayKey}:`, ''];

        if (ctx.formatCardForSearch) {
          lines.push('=== CARD REFERENCES ===');
          for (const card of peekedCards) lines.push(ctx.formatCardForSearch(card.template));
          lines.push('');
        }

        lines.push(`=== POSITION (${from} to ${from === 'top' ? 'deeper' : 'higher'}) ===`);
        for (let i = 0; i < peekedCards.length; i++) {
          const posLabel = from === 'top'
            ? (i === 0 ? '(top of deck — drawn next)' : `(${i + 1} from top)`)
            : (i === 0 ? '(bottom of deck)' : `(${i + 1} from bottom)`);
          lines.push(`${i + 1}. ${peekedCards[i].template.name} ${posLabel}`);
        }

        lines.push('', '=== ACTIONS ===');
        lines.push(`To take cards: move_card with fromZone="${displayKey}" and cardName="<name>"`);
        lines.push(`To reorder: rearrange_zone with zone="${displayKey}" and cardNames in desired top-to-bottom order`);
        lines.push(`To shuffle: shuffle with zone="${displayKey}"`);

        return lines.join('\n');
      }),

    rearrange_zone: createTool('Reorder the top or bottom cards of a zone. Used after peeking to arrange cards in a specific order. Provide card names from top to bottom (first name = top of deck, drawn next).',
      z.object({
        zone: z.string().describe('Zone key (e.g. "your_deck")'),
        cardNames: z.array(z.string()).describe('Card names in desired order, from top to bottom'),
        from: z.enum(['top', 'bottom']).optional().describe('Which end of the zone to rearrange (default: top)'),
      }),
      async ({ zone, cardNames, from }) => {
        const zoneKey = tz(ctx, zone);
        return ctx.execute((state) => {
          const zoneObj = state.zones[zoneKey];
          if (!zoneObj) throw new Error(`Zone "${zone}" not found`);
          const cardIds = cardNames.map(name => resolveCard(state, name, zoneKey));
          return rearrangeZone(p, zoneKey, cardIds, from ?? 'top');
        });
      }),

    reveal: createTool('Reveal cards to your opponent or both players.',
      z.object({
        cardNames: z.array(z.string()).describe('Names of cards to reveal'),
        zone: z.string().describe('Zone key the cards are in'),
        to: z.enum(['opponent', 'both']).optional().describe('Who to reveal to (default "both")'),
      }),
      async ({ cardNames, zone, to }) => {
        const zoneKey = tz(ctx, zone);
        return ctx.execute((state) => {
          const cardIds = cardNames.map((name: string) => resolveCard(state, name, zoneKey));
          return reveal(p, cardIds, to ?? 'both');
        });
      }),

    end_turn: createTool('End your turn and pass to the opponent. Never call in parallel, always call alone.',
      z.object({}),
      async () => ctx.execute(endTurn(p))),

    concede: createTool('Concede the game. Your opponent wins.',
      z.object({}),
      async () => ctx.execute(concede(p))),

    declare_victory: createTool('Declare victory with a reason (e.g. when win conditions are met).',
      z.object({ reason: z.string().optional().describe('Reason for declaring victory') }),
      async ({ reason }) => ctx.execute(declareVictory(p, reason))),

    reveal_hand: createTool('Reveal all cards in a zone to the opponent. Logs card names and creates a decision for acknowledgment. If mutual is true, reveals both your zone and the opponent\'s equivalent zone simultaneously.',
      z.object({
        zone: z.string().describe('Zone key to reveal (e.g. "your_hand")'),
        mutual: z.boolean().optional().describe('If true, reveals both your zone and the opponent\'s equivalent zone'),
        message: z.string().optional().describe('Custom decision message describing what the opponent should do'),
      }),
      async ({ zone, mutual, message }) => ctx.execute(revealHand(p, tz(ctx, zone), mutual, message))),

    create_decision: createTool('Request the opponent to make a decision (mini-turn). The opponent gets control to take actions, then resolves the decision back to you.',
      z.object({ message: z.string().optional().describe('Optional message describing what the opponent needs to do') }),
      async ({ message }) => {
        const opponent = (p === 0 ? 1 : 0) as PlayerIndex;
        return ctx.execute(createDecision(p, opponent, message));
      }),

    resolve_decision: createTool('Resolve a pending decision, returning control to the player who created it.',
      z.object({}),
      async () => ctx.execute(resolveDecision(p))),

    mulligan: createTool('Shuffle your hand back into your deck and draw a new hand.',
      z.object({ drawCount: z.number().optional().describe('Number of cards to draw (default 7)') }),
      async ({ drawCount }) => ctx.execute(mulligan(p, drawCount ?? 7))),

    rewind: createTool('Undo ALL actions you have taken this turn and start over with a different approach. Use when you realize you made a strategic mistake or went down a wrong path.',
      z.object({
        reason: z.string().describe('What went wrong with current approach'),
        guidance: z.string().describe('What to do differently on the retry'),
      }),
      async ({ reason, guidance }) => `Rewind requested: ${reason}. Will retry with guidance: ${guidance}`),
  };
}
