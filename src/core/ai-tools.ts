import type { CardTemplate, PlayerIndex, Tool } from './types';
import type { GameLoop } from './game-loop';
import { toReadableState, resolveCardName } from './readable';
import { makeZoneKey } from './engine';
import {
  draw,
  moveCard,
  playCard,
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
  searchZone,
  moveCardStack,
  declareVictory,
} from './action';
import type { Visibility } from './types';

/**
 * Helper: submit an action to the game loop, process it, and return
 * the resulting readable state as a JSON string.
 */
function submitAndReturn<T extends CardTemplate>(
  gameLoop: GameLoop<T>,
  playerIndex: PlayerIndex,
  action: Parameters<GameLoop<T>['submit']>[0],
  modifyReadableState?: Parameters<typeof toReadableState<T>>[2]
): string {
  gameLoop.submit(action);
  gameLoop.processAll();
  const state = gameLoop.getState();
  const readable = toReadableState(state, playerIndex, modifyReadableState);
  return JSON.stringify(readable);
}

/**
 * Helper: resolve a card name to instanceId. If the input already looks
 * like an instanceId (starts with "card_"), return it directly.
 */
function resolveCard<T extends CardTemplate>(
  gameLoop: GameLoop<T>,
  cardName: string,
  zoneKey: string
): string {
  if (cardName.startsWith('card_')) return cardName;
  return resolveCardName(gameLoop.getState(), cardName, zoneKey);
}

/**
 * Create default tools for all built-in action types.
 * Each tool submits an action to the game loop and returns the resulting
 * readable game state as JSON.
 *
 * Plugins can call this, filter out tools they don't want, and append
 * custom tools before returning from listTools().
 */
export function createDefaultTools<T extends CardTemplate>(
  gameLoop: GameLoop<T>,
  playerIndex: PlayerIndex,
  modifyReadableState?: Parameters<typeof toReadableState<T>>[2]
): Tool[] {
  const p = playerIndex;

  return [
    // ── Card Drawing ──────────────────────────────────────────────
    {
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
        const count = (input.count as number) ?? 1;
        return submitAndReturn(gameLoop, p, draw(p, count), modifyReadableState);
      },
    },

    // ── Play Card ──────────────────────────────────────────────────
    {
      name: 'play_card',
      description: 'Play a card from your hand to a zone.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          cardName: { type: 'string', description: 'Name of the card in your hand to play' },
          toZone: { type: 'string', description: 'Zone ID to play the card to (e.g. "active", "bench_1", "stadium")' },
          targetCardName: { type: 'string', description: 'Optional: name of a card to target (e.g. for evolution or attachment)' },
        },
        required: ['cardName', 'toZone'],
      },
      async run(input) {
        const handKey = makeZoneKey(p, 'hand');
        const cardId = resolveCard(gameLoop, input.cardName as string, handKey);
        let targetId: string | undefined;
        if (input.targetCardName) {
          const toZoneKey = makeZoneKey(p, input.toZone as string);
          targetId = resolveCard(gameLoop, input.targetCardName as string, toZoneKey);
        }
        return submitAndReturn(gameLoop, p, playCard(p, cardId, input.toZone as string, targetId), modifyReadableState);
      },
    },

    // ── Move Card ──────────────────────────────────────────────────
    {
      name: 'move_card',
      description: 'Move a card from one zone to another.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          cardName: { type: 'string', description: 'Name of the card to move' },
          fromZone: { type: 'string', description: 'Zone ID the card is currently in' },
          toZone: { type: 'string', description: 'Zone ID to move the card to' },
          position: { type: 'number', description: 'Optional position in the target zone (0 = top)' },
        },
        required: ['cardName', 'fromZone', 'toZone'],
      },
      async run(input) {
        const fromKey = makeZoneKey(p, input.fromZone as string);
        const cardId = resolveCard(gameLoop, input.cardName as string, fromKey);
        return submitAndReturn(
          gameLoop, p,
          moveCard(p, cardId, input.fromZone as string, input.toZone as string, input.position as number | undefined),
          modifyReadableState
        );
      },
    },

    // ── Move Card Stack ────────────────────────────────────────────
    {
      name: 'move_card_stack',
      description: 'Move multiple cards from one zone to another as a group.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          cardNames: {
            type: 'array',
            items: { type: 'string' },
            description: 'Names of the cards to move',
          },
          fromZone: { type: 'string', description: 'Zone ID the cards are currently in' },
          toZone: { type: 'string', description: 'Zone ID to move the cards to' },
          position: { type: 'number', description: 'Optional position in the target zone (0 = top)' },
        },
        required: ['cardNames', 'fromZone', 'toZone'],
      },
      async run(input) {
        const fromKey = makeZoneKey(p, input.fromZone as string);
        const cardIds = (input.cardNames as string[]).map(name =>
          resolveCard(gameLoop, name, fromKey)
        );
        return submitAndReturn(
          gameLoop, p,
          moveCardStack(p, cardIds, input.fromZone as string, input.toZone as string, input.position as number | undefined),
          modifyReadableState
        );
      },
    },

    // ── Place on Zone ──────────────────────────────────────────────
    {
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
          zoneId: { type: 'string', description: 'Target zone ID' },
          position: { type: 'string', enum: ['top', 'bottom'], description: 'Place on top or bottom of the zone' },
        },
        required: ['cardNames', 'zoneId', 'position'],
      },
      async run(input) {
        // Cards could be in any zone, resolve from full state
        const state = gameLoop.getState();
        const cardIds = (input.cardNames as string[]).map(name => {
          if (name.startsWith('card_')) return name;
          for (const zoneKey of Object.keys(state.zones)) {
            try {
              return resolveCardName(state, name, zoneKey);
            } catch { /* try next zone */ }
          }
          throw new Error(`Card "${name}" not found in any zone`);
        });
        return submitAndReturn(
          gameLoop, p,
          placeOnZone(p, cardIds, input.zoneId as string, input.position as 'top' | 'bottom'),
          modifyReadableState
        );
      },
    },

    // ── Shuffle ────────────────────────────────────────────────────
    {
      name: 'shuffle',
      description: 'Shuffle a zone (typically your deck).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          zoneId: { type: 'string', description: 'Zone ID to shuffle (default "deck")' },
        },
        required: [],
      },
      async run(input) {
        const zoneId = (input.zoneId as string) ?? 'deck';
        return submitAndReturn(gameLoop, p, shuffle(p, zoneId), modifyReadableState);
      },
    },

    // ── Search Zone ────────────────────────────────────────────────
    {
      name: 'search_zone',
      description: 'Search a zone for cards, optionally filtering by name.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          zoneId: { type: 'string', description: 'Zone ID to search' },
          filter: { type: 'string', description: 'Optional filter string to match card names' },
          count: { type: 'number', description: 'Max number of results' },
          fromPosition: { type: 'string', enum: ['top', 'bottom'], description: 'Search from top or bottom' },
        },
        required: ['zoneId'],
      },
      async run(input) {
        return submitAndReturn(
          gameLoop, p,
          searchZone(p, input.zoneId as string, {
            filter: input.filter as string | undefined,
            count: input.count as number | undefined,
            fromPosition: input.fromPosition as 'top' | 'bottom' | undefined,
          }),
          modifyReadableState
        );
      },
    },

    // ── Flip Card Visibility ───────────────────────────────────────
    {
      name: 'flip_card',
      description: 'Change a card\'s visibility (face-up/face-down).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          cardName: { type: 'string', description: 'Name of the card to flip' },
          zoneId: { type: 'string', description: 'Zone the card is in' },
          visibility: {
            type: 'string',
            enum: ['public', 'hidden', 'owner_only'],
            description: 'New visibility: "public" (both see), "hidden" (neither sees), "owner_only" (only you see)',
          },
        },
        required: ['cardName', 'zoneId', 'visibility'],
      },
      async run(input) {
        const zoneKey = makeZoneKey(p, input.zoneId as string);
        const cardId = resolveCard(gameLoop, input.cardName as string, zoneKey);
        const visMap: Record<string, Visibility> = {
          public: [true, true],
          hidden: [false, false],
          owner_only: p === 0 ? [true, false] : [false, true],
        };
        const vis = visMap[input.visibility as string] ?? [true, true];
        return submitAndReturn(gameLoop, p, flipCard(p, cardId, vis), modifyReadableState);
      },
    },

    // ── Set Orientation ────────────────────────────────────────────
    {
      name: 'set_orientation',
      description: 'Set a card\'s orientation (e.g. tap/untap).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          cardName: { type: 'string', description: 'Name of the card' },
          zoneId: { type: 'string', description: 'Zone the card is in' },
          orientation: { type: 'string', description: 'New orientation (e.g. "normal", "tapped")' },
        },
        required: ['cardName', 'zoneId', 'orientation'],
      },
      async run(input) {
        const zoneKey = makeZoneKey(p, input.zoneId as string);
        const cardId = resolveCard(gameLoop, input.cardName as string, zoneKey);
        return submitAndReturn(gameLoop, p, setOrientation(p, cardId, input.orientation as string), modifyReadableState);
      },
    },

    // ── Add Counter ────────────────────────────────────────────────
    {
      name: 'add_counter',
      description: 'Add counters to a card (e.g. damage counters).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          cardName: { type: 'string', description: 'Name of the card' },
          zoneId: { type: 'string', description: 'Zone the card is in' },
          counterType: { type: 'string', description: 'Counter type (e.g. "10" for 10-damage counter, "poison")' },
          amount: { type: 'number', description: 'Number of counters to add (default 1)' },
        },
        required: ['cardName', 'zoneId', 'counterType'],
      },
      async run(input) {
        const zoneKey = makeZoneKey(p, input.zoneId as string);
        const cardId = resolveCard(gameLoop, input.cardName as string, zoneKey);
        const amount = (input.amount as number) ?? 1;
        return submitAndReturn(gameLoop, p, addCounter(p, cardId, input.counterType as string, amount), modifyReadableState);
      },
    },

    // ── Remove Counter ─────────────────────────────────────────────
    {
      name: 'remove_counter',
      description: 'Remove counters from a card.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          cardName: { type: 'string', description: 'Name of the card' },
          zoneId: { type: 'string', description: 'Zone the card is in' },
          counterType: { type: 'string', description: 'Counter type to remove' },
          amount: { type: 'number', description: 'Number of counters to remove (default 1)' },
        },
        required: ['cardName', 'zoneId', 'counterType'],
      },
      async run(input) {
        const zoneKey = makeZoneKey(p, input.zoneId as string);
        const cardId = resolveCard(gameLoop, input.cardName as string, zoneKey);
        const amount = (input.amount as number) ?? 1;
        return submitAndReturn(gameLoop, p, removeCounter(p, cardId, input.counterType as string, amount), modifyReadableState);
      },
    },

    // ── Set Counter ────────────────────────────────────────────────
    {
      name: 'set_counter',
      description: 'Set a counter on a card to a specific value.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          cardName: { type: 'string', description: 'Name of the card' },
          zoneId: { type: 'string', description: 'Zone the card is in' },
          counterType: { type: 'string', description: 'Counter type to set' },
          value: { type: 'number', description: 'New counter value (0 removes the counter)' },
        },
        required: ['cardName', 'zoneId', 'counterType', 'value'],
      },
      async run(input) {
        const zoneKey = makeZoneKey(p, input.zoneId as string);
        const cardId = resolveCard(gameLoop, input.cardName as string, zoneKey);
        return submitAndReturn(gameLoop, p, setCounter(p, cardId, input.counterType as string, input.value as number), modifyReadableState);
      },
    },

    // ── Coin Flip ──────────────────────────────────────────────────
    {
      name: 'coin_flip',
      description: 'Flip one or more coins. Returns heads (true) or tails (false) for each.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          count: { type: 'number', description: 'Number of coins to flip (default 1)' },
        },
        required: [],
      },
      async run(input) {
        const count = (input.count as number) ?? 1;
        return submitAndReturn(gameLoop, p, coinFlip(p, count), modifyReadableState);
      },
    },

    // ── Dice Roll ──────────────────────────────────────────────────
    {
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
        const sides = (input.sides as number) ?? 6;
        const count = (input.count as number) ?? 1;
        return submitAndReturn(gameLoop, p, diceRoll(p, sides, count), modifyReadableState);
      },
    },

    // ── Peek ───────────────────────────────────────────────────────
    {
      name: 'peek',
      description: 'Look at the top or bottom cards of a zone without changing visibility.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          zoneId: { type: 'string', description: 'Zone ID to peek at (default "deck")' },
          count: { type: 'number', description: 'Number of cards to peek at (default 1)' },
          fromPosition: { type: 'string', enum: ['top', 'bottom'], description: 'Peek from top or bottom (default "top")' },
        },
        required: [],
      },
      async run(input) {
        const zoneId = (input.zoneId as string) ?? 'deck';
        const count = (input.count as number) ?? 1;
        const from = (input.fromPosition as 'top' | 'bottom') ?? 'top';
        return submitAndReturn(gameLoop, p, peek(p, zoneId, count, from), modifyReadableState);
      },
    },

    // ── Reveal ─────────────────────────────────────────────────────
    {
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
          zoneId: { type: 'string', description: 'Zone the cards are in' },
          to: { type: 'string', enum: ['opponent', 'both'], description: 'Who to reveal to (default "both")' },
        },
        required: ['cardNames', 'zoneId'],
      },
      async run(input) {
        const zoneKey = makeZoneKey(p, input.zoneId as string);
        const cardIds = (input.cardNames as string[]).map(name =>
          resolveCard(gameLoop, name, zoneKey)
        );
        const to = (input.to as 'opponent' | 'both') ?? 'both';
        return submitAndReturn(gameLoop, p, reveal(p, cardIds, to), modifyReadableState);
      },
    },

    // ── End Turn ───────────────────────────────────────────────────
    {
      name: 'end_turn',
      description: 'End your turn and pass to the opponent.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
      async run() {
        return submitAndReturn(gameLoop, p, endTurn(p), modifyReadableState);
      },
    },

    // ── Concede ────────────────────────────────────────────────────
    {
      name: 'concede',
      description: 'Concede the game. Your opponent wins.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
      async run() {
        return submitAndReturn(gameLoop, p, concede(p), modifyReadableState);
      },
    },

    // ── Declare Victory ────────────────────────────────────────────
    {
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
        return submitAndReturn(gameLoop, p, declareVictory(p, input.reason as string | undefined), modifyReadableState);
      },
    },
  ];
}
