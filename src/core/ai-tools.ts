import type { CardTemplate, PlayerIndex, Action } from './types';
import type { GameState } from './types';
import { INSTANCE_ID_PREFIX, POSITIONS, ORIENTATIONS, REVEAL_TARGETS } from './types';
import { resolveCardName, formatCardInventory } from './readable';
import {
  draw,
  moveCard,
  shuffle,
  addCounter,
  removeCounter,
  setCounter,
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
} from './action';
import type { Visibility } from './types';

/**
 * Execution context provided to AI tools.
 * The caller decides how actions are executed — Game.svelte provides
 * a real-time context that operates on reactive state with delays.
 */
export interface ToolContext {
  playerIndex: PlayerIndex;
  /** Execute an action and return the resulting readable state as JSON. */
  execute: (action: Action) => Promise<string>;
  /** Get the current game state (for card name resolution, etc). */
  getState: () => GameState<CardTemplate>;
  /** Get the readable state JSON for this player. */
  getReadableState: () => string;
  /** True when this context is for a decision mini-turn response. */
  isDecisionResponse?: boolean;
  /** Format a card template for search results. Plugin-provided for rich output. */
  formatCardForSearch?: (template: CardTemplate) => string;
  /** Set by tools to abort remaining calls in the current AI SDK step. */
  batchAbortReason?: string;
}

/**
 * A runnable tool compatible with the Vercel AI SDK.
 */
export interface RunnableTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (input: Record<string, any>) => Promise<string> | string;
}

/**
 * Create a runnable tool from a schema definition.
 */
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

/**
 * Helper: resolve a card name to instanceId. If the input already looks
 * like an instanceId (starts with "card_"), return it directly.
 */
function resolveCard(
  state: GameState<CardTemplate>,
  cardName: string,
  zoneKey: string
): string {
  if (cardName.startsWith(INSTANCE_ID_PREFIX)) return cardName;
  return resolveCardName(state, cardName, zoneKey);
}

/**
 * Helper: resolve a card by position in a zone (for face-down cards the AI can't name).
 * Index 0 = top of zone (consistent with draw/peek).
 */
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

/**
 * Create default tools for all built-in action types.
 * Each tool calls ctx.execute() which is provided by the caller.
 *
 * All zone parameters accept zone keys (e.g. "player2_hand") — the same
 * format returned by readable state. Zone keys are passed directly to
 * action factories.
 *
 * Plugins can call this, filter out tools they don't want, and append
 * custom tools before returning from listTools().
 */
export function createDefaultTools(ctx: ToolContext): RunnableTool[] {
  const p = ctx.playerIndex;

  return [
    // ── Card Drawing ──────────────────────────────────────────────
    tool({
      name: 'draw',
      description: 'Draw cards from the top of your deck into your hand.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          count: { type: 'number', description: 'Number of cards to draw (default 1)' },
        },
        required: [],
      },
      async run(input) {
        const count = input.count ?? 1;
        return ctx.execute(draw(p, count));
      },
    }),

    // ── Move Card ──────────────────────────────────────────────────
    tool({
      name: 'move_card',
      description: 'Move a card from one zone to another. Use cardName for visible cards. Omit cardName to take from top of zone (e.g. prize cards).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          cardName: { type: 'string', description: 'Name of the card to move (optional — omit for face-down cards)' },
          fromZone: { type: 'string', description: 'Zone key (e.g. "player2_hand")' },
          toZone: { type: 'string', description: 'Zone key to move the card to (e.g. "player2_active")' },
          position: { type: 'number', description: 'Optional position in the target zone (0 = top)' },
          fromPosition: { type: 'string', description: 'Position to pick from when cardName is omitted: "top" (default), "bottom", or numeric index' },
          allowed_by_card_effect: { type: 'boolean', description: 'Set true when a card effect permits bypassing normal rules (e.g. extra energy attachment, evolution on first turn)' },
        },
        required: ['fromZone', 'toZone'],
      },
      async run(input) {
        const cardId = input.cardName
          ? resolveCard(ctx.getState(), input.cardName, input.fromZone)
          : resolveCardByPosition(ctx.getState(), input.fromZone, input.fromPosition);
        return ctx.execute({
          ...moveCard(p, cardId, input.fromZone, input.toZone, input.position),
          ...(input.allowed_by_card_effect && { allowed_by_card_effect: true }),
        });
      },
    }),

    // ── Move Card Stack ────────────────────────────────────────────
    tool({
      name: 'move_card_stack',
      description: 'Move ALL cards from one zone to another as a group (e.g. moving a Pokemon and all its attachments).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          fromZone: { type: 'string', description: 'Zone key to move all cards from (e.g. "player2_active")' },
          toZone: { type: 'string', description: 'Zone key to move the cards to (e.g. "player2_discard")' },
          position: { type: 'number', description: 'Optional position in the target zone (0 = top)' },
          allowed_by_card_effect: { type: 'boolean', description: 'Set true when a card effect permits bypassing normal rules' },
        },
        required: ['fromZone', 'toZone'],
      },
      async run(input) {
        const zone = ctx.getState().zones[input.fromZone];
        if (!zone) return `Error: zone "${input.fromZone}" not found`;
        if (zone.cards.length === 0) return `Error: zone "${input.fromZone}" is empty`;
        const cardIds = zone.cards.map(c => c.instanceId);
        return ctx.execute({
          ...moveCardStack(p, cardIds, input.fromZone, input.toZone, input.position),
          ...(input.allowed_by_card_effect && { allowed_by_card_effect: true }),
        });
      },
    }),

    // ── Place on Zone ──────────────────────────────────────────────
    tool({
      name: 'place_on_zone',
      description: 'Place cards on the top or bottom of a zone.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          cardNames: {
            type: 'array',
            items: { type: 'string' },
            description: 'Names of the cards to place',
          },
          zone: { type: 'string', description: 'Target zone key (e.g. "player2_deck")' },
          position: { type: 'string', enum: [POSITIONS.TOP, POSITIONS.BOTTOM], description: 'Place on top or bottom of the zone' },
          allowed_by_card_effect: { type: 'boolean', description: 'Set true when a card effect permits bypassing normal rules' },
        },
        required: ['cardNames', 'zone', 'position'],
      },
      async run(input) {
        const state = ctx.getState();
        const cardIds = input.cardNames.map((name: string) => {
          if (name.startsWith(INSTANCE_ID_PREFIX)) return name;
          for (const zk of Object.keys(state.zones)) {
            try {
              return resolveCardName(state, name, zk);
            } catch { /* try next zone */ }
          }
          throw new Error(`Card "${name}" not found in any zone`);
        });
        return ctx.execute({
          ...placeOnZone(p, cardIds, input.zone, input.position),
          ...(input.allowed_by_card_effect && { allowed_by_card_effect: true }),
        });
      },
    }),

    // ── Shuffle ────────────────────────────────────────────────────
    tool({
      name: 'shuffle',
      description: 'Shuffle a zone (typically your deck).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          zone: { type: 'string', description: 'Zone key to shuffle (e.g. "player2_deck")' },
        },
        required: ['zone'],
      },
      async run(input) {
        return ctx.execute(shuffle(p, input.zone));
      },
    }),

    // ── Search Zone ────────────────────────────────────────────────
    tool({
      name: 'search_zone',
      description: 'Search a zone to see all cards and their full details. Read-only — does not modify game state. After reviewing, use move_card to take cards, then shuffle the zone.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          zone: { type: 'string', description: 'Zone key to search (e.g. "player2_deck")' },
        },
        required: ['zone'],
      },
      run(input) {
        const state = ctx.getState();
        const zoneKey = input.zone;
        const zone = state.zones[zoneKey];
        if (!zone) return `Error: zone "${zoneKey}" not found`;
        if (zone.cards.length === 0) return `Zone "${zoneKey}" is empty`;

        const templates = zone.cards.map(c => c.template);
        const inventory = formatCardInventory(templates, ctx.formatCardForSearch);
        const uniqueCount = new Set(templates.map(t => t.name)).size;

        const lines: string[] = [
          `=== SEARCH: ${zone.config.name ?? zoneKey} (${zone.cards.length} cards, ${uniqueCount} unique) ===`,
          '',
          inventory,
          '',
          '---',
          `You are resolving a zone search. Review the cards above and select which to take.`,
          `Use move_card with fromZone="${zoneKey}" and cardName="<name>" to move cards to your hand or the appropriate zone based on the card effect.`,
          `Then call shuffle with zone="${zoneKey}" to shuffle the zone.`,
        ];

        return lines.join('\n');
      },
    }),

    // ── Flip Card Visibility ───────────────────────────────────────
    tool({
      name: 'flip_card',
      description: 'Change a card\'s visibility (face-up/face-down).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          cardName: { type: 'string', description: 'Name of the card to flip' },
          zone: { type: 'string', description: 'Zone key the card is in' },
          visibility: {
            type: 'string',
            enum: ['public', 'hidden', 'owner_only'],
            description: 'New visibility: "public" (both see), "hidden" (neither sees), "owner_only" (only you see)',
          },
        },
        required: ['cardName', 'zone', 'visibility'],
      },
      async run(input) {
        const cardId = resolveCard(ctx.getState(), input.cardName, input.zone);
        const visMap: Record<string, Visibility> = {
          public: [true, true],
          hidden: [false, false],
          owner_only: p === 0 ? [true, false] : [false, true],
        };
        const vis = visMap[input.visibility] ?? [true, true];
        return ctx.execute(flipCard(p, cardId, vis));
      },
    }),

    // ── Set Orientation ────────────────────────────────────────────
    tool({
      name: 'set_orientation',
      description: 'Set card rotation/orientation by degrees.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          cardName: { type: 'string', description: 'Name of the card' },
          zone: { type: 'string', description: 'Zone key the card is in' },
          orientation: { type: 'string', enum: [ORIENTATIONS.NORMAL, ORIENTATIONS.TAPPED, ORIENTATIONS.COUNTER_TAPPED, ORIENTATIONS.FLIPPED], description: '"0" = upright, "90" = 90° clockwise, "-90" = 90° counter-clockwise, "180" = upside-down' },
        },
        required: ['cardName', 'zone', 'orientation'],
      },
      async run(input) {
        const cardId = resolveCard(ctx.getState(), input.cardName, input.zone);
        return ctx.execute(setOrientation(p, cardId, input.orientation));
      },
    }),

    // ── Add Counter ────────────────────────────────────────────────
    tool({
      name: 'add_counter',
      description: 'Add counters to a card (e.g. damage counters).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          cardName: { type: 'string', description: 'Name of the card' },
          zone: { type: 'string', description: 'Zone key the card is in (e.g. "player1_active")' },
          counterType: { type: 'string', description: 'Counter type (e.g. "10" for 10-damage counter, "poison")' },
          amount: { type: 'number', description: 'Number of counters to add (default 1)' },
          allowed_by_card_effect: { type: 'boolean', description: 'Set true when a card effect permits bypassing normal rules' },
        },
        required: ['cardName', 'zone', 'counterType'],
      },
      async run(input) {
        const cardId = resolveCard(ctx.getState(), input.cardName, input.zone);
        const amount = input.amount ?? 1;
        return ctx.execute({
          ...addCounter(p, cardId, input.counterType, amount),
          ...(input.allowed_by_card_effect && { allowed_by_card_effect: true }),
        });
      },
    }),

    // ── Remove Counter ─────────────────────────────────────────────
    tool({
      name: 'remove_counter',
      description: 'Remove counters from a card.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          cardName: { type: 'string', description: 'Name of the card' },
          zone: { type: 'string', description: 'Zone key the card is in' },
          counterType: { type: 'string', description: 'Counter type to remove' },
          amount: { type: 'number', description: 'Number of counters to remove (default 1)' },
        },
        required: ['cardName', 'zone', 'counterType'],
      },
      async run(input) {
        const cardId = resolveCard(ctx.getState(), input.cardName, input.zone);
        const amount = input.amount ?? 1;
        return ctx.execute(removeCounter(p, cardId, input.counterType, amount));
      },
    }),

    // ── Set Counter ────────────────────────────────────────────────
    tool({
      name: 'set_counter',
      description: 'Set a counter on a card to a specific value.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          cardName: { type: 'string', description: 'Name of the card' },
          zone: { type: 'string', description: 'Zone key the card is in' },
          counterType: { type: 'string', description: 'Counter type to set' },
          value: { type: 'number', description: 'New counter value (0 removes the counter)' },
        },
        required: ['cardName', 'zone', 'counterType', 'value'],
      },
      async run(input) {
        const cardId = resolveCard(ctx.getState(), input.cardName, input.zone);
        return ctx.execute(setCounter(p, cardId, input.counterType, input.value));
      },
    }),

    // ── Coin Flip ──────────────────────────────────────────────────
    tool({
      name: 'coin_flip',
      description: 'Flip one or more coins. Returns heads (true) or tails (false) for each.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          num_coins: { type: 'number', description: 'Number of coins to flip (default 1)' },
        },
        required: [],
      },
      async run(input) {
        const count = input.num_coins ?? 1;
        return ctx.execute(coinFlip(p, count));
      },
    }),

    // ── Dice Roll ──────────────────────────────────────────────────
    tool({
      name: 'dice_roll',
      description: 'Roll one or more dice.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          sides: { type: 'number', description: 'Number of sides on the die (default 6)' },
          count: { type: 'number', description: 'Number of dice to roll (default 1)' },
        },
        required: [],
      },
      async run(input) {
        const sides = input.sides ?? 6;
        const count = input.count ?? 1;
        return ctx.execute(diceRoll(p, sides, count));
      },
    }),

    // ── Peek ───────────────────────────────────────────────────────
    tool({
      name: 'peek',
      description: 'Look at the top or bottom cards of a zone without changing visibility.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          zone: { type: 'string', description: 'Zone key to peek at (e.g. "player2_deck")' },
          count: { type: 'number', description: 'Number of cards to peek at (default 1)' },
          fromPosition: { type: 'string', enum: [POSITIONS.TOP, POSITIONS.BOTTOM], description: 'Peek from top or bottom (default "top")' },
        },
        required: ['zone'],
      },
      async run(input) {
        const count = input.count ?? 1;
        const from = input.fromPosition ?? 'top';
        return ctx.execute(peek(p, input.zone, count, from));
      },
    }),

    // ── Reveal ─────────────────────────────────────────────────────
    tool({
      name: 'reveal',
      description: 'Reveal cards to your opponent or both players.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          cardNames: {
            type: 'array',
            items: { type: 'string' },
            description: 'Names of cards to reveal',
          },
          zone: { type: 'string', description: 'Zone key the cards are in' },
          to: { type: 'string', enum: [REVEAL_TARGETS.OPPONENT, REVEAL_TARGETS.BOTH], description: 'Who to reveal to (default "both")' },
        },
        required: ['cardNames', 'zone'],
      },
      async run(input) {
        const cardIds = input.cardNames.map((name: string) =>
          resolveCard(ctx.getState(), name, input.zone)
        );
        const to = input.to ?? 'both';
        return ctx.execute(reveal(p, cardIds, to));
      },
    }),

    // ── End Turn ───────────────────────────────────────────────────
    tool({
      name: 'end_turn',
      description: 'End your turn and pass to the opponent.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
      async run() {
        return ctx.execute(endTurn(p));
      },
    }),

    // ── Concede ────────────────────────────────────────────────────
    tool({
      name: 'concede',
      description: 'Concede the game. Your opponent wins.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
      async run() {
        return ctx.execute(concede(p));
      },
    }),

    // ── Declare Victory ────────────────────────────────────────────
    tool({
      name: 'declare_victory',
      description: 'Declare victory with a reason (e.g. when win conditions are met).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          reason: { type: 'string', description: 'Reason for declaring victory' },
        },
        required: [],
      },
      async run(input) {
        return ctx.execute(declareVictory(p, input.reason));
      },
    }),

    // ── Reveal Hand ─────────────────────────────────────────────────
    tool({
      name: 'reveal_hand',
      description: 'Reveal all cards in a zone to the opponent. Logs card names and creates a decision for acknowledgment. If mutual is true, reveals both your zone and the opponent\'s equivalent zone simultaneously (e.g. for Lass-type effects).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          zone: { type: 'string', description: 'Zone key to reveal (e.g. "player2_hand")' },
          mutual: { type: 'boolean', description: 'If true, reveals both your zone and the opponent\'s equivalent zone' },
          message: { type: 'string', description: 'Custom decision message describing what the opponent should do' },
        },
        required: ['zone'],
      },
      async run(input) {
        return ctx.execute(revealHand(p, input.zone, input.mutual, input.message));
      },
    }),

    // ── Create Decision ───────────────────────────────────────────
    tool({
      name: 'create_decision',
      description: 'Request the opponent to make a decision (mini-turn). The opponent gets control to take actions, then resolves the decision back to you.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          message: { type: 'string', description: 'Optional message describing what the opponent needs to do' },
        },
        required: [],
      },
      async run(input) {
        const opponent = (p === 0 ? 1 : 0) as PlayerIndex;
        return ctx.execute(createDecision(p, opponent, input.message));
      },
    }),

    // ── Resolve Decision ──────────────────────────────────────────
    tool({
      name: 'resolve_decision',
      description: 'Resolve a pending decision, returning control to the player who created it.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
      async run() {
        return ctx.execute(resolveDecision(p));
      },
    }),

    // ── Mulligan ────────────────────────────────────────────────────
    tool({
      name: 'mulligan',
      description: 'Shuffle your hand back into your deck and draw a new hand.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          drawCount: { type: 'number', description: 'Number of cards to draw (default 7)' },
        },
        required: [],
      },
      async run(input) {
        const count = input.drawCount ?? 7;
        return ctx.execute(mulligan(p, count));
      },
    }),
  ];
}
