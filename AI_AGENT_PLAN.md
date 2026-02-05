# AI Agent System for LobsterTCG

## Overview

Create an AI agent using the **Anthropic SDK Tool Runner** (beta) that reads game state, makes decisions, spawns subagents, and executes game actions.

## Core Approach: SDK Tool Runner

The SDK handles the agentic loop. We define tools with `run` functions:

```typescript
import { Anthropic } from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';

const anthropic = new Anthropic();

const drawTool = betaTool({
  name: 'draw',
  description: 'Draw cards from deck to hand',
  inputSchema: {
    type: 'object',
    properties: {
      count: { type: 'number', description: 'Number of cards to draw', default: 1 }
    }
  },
  run: async (input) => {
    gameLoop.submit({ type: 'draw', player: playerIndex, count: input.count ?? 1 });
    gameLoop.processNext();
    return JSON.stringify(toReadableState(gameLoop.getState()));
  }
});

const runner = anthropic.beta.messages.toolRunner({
  model: 'claude-sonnet-4-5',
  max_tokens: 4096,
  system: heuristics,  // Game rules + strategy
  tools: [drawTool, playCardTool, endTurnTool, spawnSubagentTool, ...],
  messages: [{ role: 'user', content: `Current state: ${JSON.stringify(state)}. It's your turn.` }]
});

for await (const message of runner) {
  console.log('AI:', message);
}
```

## Directory Structure

```
src/ai/
├── index.ts              # Public exports
├── types.ts              # Minimal types
├── tools/
│   ├── index.ts          # Combine all tools
│   ├── game-actions.ts   # Tools for each action type
│   └── spawn-subagent.ts # Tool to spawn subagents
└── run-turn.ts           # Run AI turn with tool runner
```

## Core Components

### 1. Game Action Tools
**File:** `src/ai/tools/game-actions.ts`

```typescript
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import type { GameLoop } from '../../core';
import { toReadableState } from '../../core/readable';

export function createGameTools(gameLoop: GameLoop, playerIndex: number) {
  // Resolve readable card name (e.g., "Pikachu_1") to instanceId
  function resolveCardName(cardName: string): string {
    const state = gameLoop.getState();
    for (const zone of Object.values(state.zones)) {
      const nameCount = new Map<string, number>();
      for (const card of zone.cards) {
        const baseName = card.template.name;
        const count = nameCount.get(baseName) ?? 0;
        nameCount.set(baseName, count + 1);
        const displayName = count === 0 ? baseName : `${baseName}_${count}`;
        if (displayName === cardName) {
          return card.instanceId;
        }
        // Also check attachments
        for (const att of card.attachments) {
          // Similar logic for attachments...
        }
      }
    }
    throw new Error(`Card not found: ${cardName}`);
  }

  const submitAndReturn = (action: any) => {
    gameLoop.submit({ ...action, player: playerIndex });
    gameLoop.processNext();
    return JSON.stringify(toReadableState(gameLoop.getState()));
  };

  return [
    betaTool({
      name: 'draw',
      description: 'Draw cards from deck to hand',
      inputSchema: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Number of cards to draw' }
        }
      },
      run: async (input) => submitAndReturn({ type: 'draw', count: input.count ?? 1 })
    }),

    betaTool({
      name: 'move_card',
      description: 'Move a card from one zone to another',
      inputSchema: {
        type: 'object',
        properties: {
          cardName: { type: 'string', description: 'The card to move (e.g., "Pikachu" or "Pikachu_1")' },
          fromZone: { type: 'string', description: 'Source zone' },
          toZone: { type: 'string', description: 'Destination zone' },
          position: { type: 'number', description: 'Position in destination (optional)' }
        },
        required: ['cardName', 'fromZone', 'toZone']
      },
      run: async (input) => submitAndReturn({
        type: 'move_card',
        cardInstanceId: resolveCardName(input.cardName),
        fromZone: input.fromZone,
        toZone: input.toZone,
        position: input.position
      })
    }),

    betaTool({
      name: 'play_card',
      description: 'Play a card from hand to a zone',
      inputSchema: {
        type: 'object',
        properties: {
          cardName: { type: 'string', description: 'The card to play (e.g., "Rare Candy")' },
          toZone: { type: 'string', description: 'Zone to play the card to' },
          targetName: { type: 'string', description: 'Target card name (optional)' }
        },
        required: ['cardName', 'toZone']
      },
      run: async (input) => submitAndReturn({
        type: 'play_card',
        cardInstanceId: resolveCardName(input.cardName),
        toZone: input.toZone,
        targetInstanceId: input.targetName ? resolveCardName(input.targetName) : undefined
      })
    }),

    betaTool({
      name: 'attach_card',
      description: 'Attach a card to another card (e.g., energy to Pokemon)',
      inputSchema: {
        type: 'object',
        properties: {
          cardName: { type: 'string', description: 'Card to attach (e.g., "Fire Energy")' },
          targetName: { type: 'string', description: 'Card to attach to (e.g., "Charizard")' }
        },
        required: ['cardName', 'targetName']
      },
      run: async (input) => submitAndReturn({
        type: 'attach_card',
        cardInstanceId: resolveCardName(input.cardName),
        targetInstanceId: resolveCardName(input.targetName)
      })
    }),

    betaTool({
      name: 'coin_flip',
      description: 'Flip coins for game effects',
      inputSchema: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Number of coins to flip' }
        }
      },
      run: async (input) => submitAndReturn({ type: 'coin_flip', count: input.count ?? 1 })
    }),

    betaTool({
      name: 'add_counter',
      description: 'Add counters to a card (e.g., damage counters)',
      inputSchema: {
        type: 'object',
        properties: {
          cardName: { type: 'string', description: 'Card to add counters to (e.g., "Pikachu")' },
          counterType: { type: 'string', description: 'Type of counter (e.g., "damage")' },
          amount: { type: 'number', description: 'Number of counters to add' }
        },
        required: ['cardName', 'counterType', 'amount']
      },
      run: async (input) => submitAndReturn({
        type: 'add_counter',
        cardInstanceId: resolveCardName(input.cardName),
        counterType: input.counterType,
        amount: input.amount
      })
    }),

    betaTool({
      name: 'shuffle',
      description: 'Shuffle a zone (typically deck)',
      inputSchema: {
        type: 'object',
        properties: {
          zoneId: { type: 'string', description: 'Zone to shuffle' }
        },
        required: ['zoneId']
      },
      run: async (input) => submitAndReturn({ type: 'shuffle', ...input })
    }),

    betaTool({
      name: 'end_turn',
      description: 'End your turn',
      inputSchema: { type: 'object', properties: {} },
      run: async () => {
        gameLoop.submit({ type: 'end_turn', player: playerIndex });
        gameLoop.processNext();
        return JSON.stringify({ status: 'turn_ended' });
      }
    }),

    // ... other actions from src/core/action.ts
  ];
}
```

### 2. Spawn Subagent Tool
**File:** `src/ai/tools/spawn-subagent.ts`

```typescript
import { Anthropic } from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';

export function createSpawnSubagentTool(
  anthropic: Anthropic,
  parentTools: any[],
  systemPrompt: string
) {
  return betaTool({
    name: 'spawn_subagent',
    description: 'Spawn a subagent to handle a subtask (analysis, evaluation, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'What the subagent should do' },
        model: {
          type: 'string',
          enum: ['sonnet', 'haiku'],
          description: 'Model to use (haiku for simple, sonnet for complex)'
        }
      },
      required: ['task']
    },
    run: async (input) => {
      const model = input.model === 'haiku'
        ? 'claude-haiku-4-20250514'
        : 'claude-sonnet-4-5';

      const runner = anthropic.beta.messages.toolRunner({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        tools: parentTools,
        messages: [{ role: 'user', content: input.task }]
      });

      // Get final response from subagent
      const finalMessage = await runner;
      const textContent = finalMessage.content.find(c => c.type === 'text');
      return textContent?.text ?? 'Subagent completed without text response';
    }
  });
}
```

### 3. Run Turn
**File:** `src/ai/run-turn.ts`

```typescript
import { Anthropic } from '@anthropic-ai/sdk';
import type { GameLoop, PlayerIndex } from '../core';
import { toReadableState, getPlayerView } from '../core';
import { createGameTools } from './tools/game-actions';
import { createSpawnSubagentTool } from './tools/spawn-subagent';

export interface AITurnConfig {
  gameLoop: GameLoop;
  playerIndex: PlayerIndex;
  heuristics: string;
  model?: string;
  apiKey: string;
  onMessage?: (message: any) => void;
}

export async function runAITurn(config: AITurnConfig) {
  const { gameLoop, playerIndex, heuristics, apiKey, onMessage } = config;
  const model = config.model ?? 'claude-sonnet-4-5';

  const anthropic = new Anthropic({ apiKey });

  // Get AI's view of game state
  const state = getPlayerView(gameLoop.getState(), playerIndex);
  const readableState = toReadableState(state);

  // Create tools
  const gameTools = createGameTools(gameLoop, playerIndex);
  const spawnSubagentTool = createSpawnSubagentTool(anthropic, gameTools, heuristics);
  const allTools = [...gameTools, spawnSubagentTool];

  // Run the tool loop
  const runner = anthropic.beta.messages.toolRunner({
    model,
    max_tokens: 4096,
    system: heuristics,
    tools: allTools,
    messages: [{
      role: 'user',
      content: `Current game state:\n${JSON.stringify(readableState, null, 2)}\n\nIt's your turn. Take actions to advance toward winning. Call end_turn when done.`
    }]
  });

  for await (const message of runner) {
    onMessage?.(message);
  }
}

// Hook into GameLoop for automatic AI turns
export function createAIPlayer(config: Omit<AITurnConfig, 'onMessage'> & {
  onThinking?: () => void;
  onDone?: () => void;
}) {
  const { gameLoop, playerIndex, onThinking, onDone, ...rest } = config;

  gameLoop.on('turn:started', async (event, data) => {
    if (data.state.activePlayer === playerIndex) {
      onThinking?.();
      try {
        await runAITurn({ gameLoop, playerIndex, ...rest });
      } catch (error) {
        console.error('AI turn failed:', error);
        // Fallback: end turn
        gameLoop.submit({ type: 'end_turn', player: playerIndex });
        gameLoop.processNext();
      }
      onDone?.();
    }
  });
}
```

### 4. Public Exports
**File:** `src/ai/index.ts`

```typescript
export { runAITurn, createAIPlayer } from './run-turn';
export type { AITurnConfig } from './run-turn';
```

## Usage in Game.svelte

```typescript
import { createAIPlayer } from '../ai';

let aiThinking = $state(false);

// When starting game with AI
createAIPlayer({
  gameLoop,
  playerIndex: 1,
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  heuristics: `
    You are playing Pokemon TCG.

    ## Rules
    - Each turn: draw, then take actions, then attack (optional), then end turn
    - Attach one energy per turn
    - Evolution: place Stage 1 on Basic, Stage 2 on Stage 1

    ## Win Conditions
    - Take all 6 prize cards
    - Opponent has no Pokemon in play
    - Opponent can't draw

    ## Your Deck Strategy
    [Deck-specific strategy here]
  `,
  onThinking: () => aiThinking = true,
  onDone: () => aiThinking = false,
});
```

## Files to Create

1. `src/ai/index.ts` - Public exports
2. `src/ai/types.ts` - Types (if needed)
3. `src/ai/tools/index.ts` - Tool aggregation
4. `src/ai/tools/game-actions.ts` - Game action tools
5. `src/ai/tools/spawn-subagent.ts` - Subagent spawning
6. `src/ai/run-turn.ts` - Main turn runner

## Files to Modify

1. `package.json` - Ensure `@anthropic-ai/sdk` is installed
2. `src/components/game/Game.svelte` - Initialize AI player

## Design Decisions

1. **SDK**: `@anthropic-ai/sdk` with `beta.messages.toolRunner`
2. **API calls**: Client-side with `VITE_ANTHROPIC_API_KEY`
3. **Tools**: Each game action is a tool with `run` function
4. **Subagents**: Via `spawn_subagent` tool using same runner pattern
5. **Game knowledge**: From `heuristics` system prompt

## Key Integration Points

| Component | File | Usage |
|-----------|------|-------|
| State serialization | `src/core/readable.ts` | `toReadableState()` |
| Player view | `src/core/engine.ts` | `getPlayerView()` |
| Game loop | `src/core/game-loop.ts` | `submit()`, `processNext()` |
| Action types | `src/core/action.ts` | Reference for tool schemas |

## Verification

1. `npm install @anthropic-ai/sdk`
2. Add to `.env`: `VITE_ANTHROPIC_API_KEY=sk-ant-...`
3. `npm run dev`
4. Start game, AI takes turn
5. Watch console for tool calls and responses
