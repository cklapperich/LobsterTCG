# AI Tool Calling Architecture

## What is Tool Calling?

Tool calling (also called "function calling") is a capability where LLMs can invoke external functions during generation. Instead of just outputting text, the model can:

1. **Decide** to call a tool based on the conversation
2. **Generate** structured arguments matching the tool's schema
3. **Receive** the tool's result and continue the conversation

This enables agents to take real actions (move cards, draw, attack) rather than just talk about them.

### The Flow

```
User Request → LLM generates tool call → Your code executes tool → Result sent back to LLM → LLM continues
```

## AI SDK 6 Tool Calling

This repo uses [Vercel AI SDK 6](https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling).

### Key Concepts

#### ToolSet (Object, Not Array)

```ts
// AI SDK 6 expects tools as an OBJECT keyed by tool name
const tools: ToolSet = {
  draw: tool({ description: '...', inputSchema: z.object({...}), execute: async (args) => {...} }),
  move_card: tool({ description: '...', inputSchema: z.object({...}), execute: async (args) => {...} }),
};
```

The tool name comes from the **object key**, not a `.name` property on the tool itself.

#### `tool()` Function

```ts
import { tool } from 'ai';
import { z } from 'zod';

const myTool = tool({
  description: 'What this tool does',  // Shown to the LLM
  inputSchema: z.object({              // Zod schema for arguments
    cardName: z.string(),
    zone: z.string(),
  }),
  execute: async (args) => {           // Called with validated args
    // Return a string (sent back to LLM)
    return `Moved ${args.cardName} to ${args.zone}`;
  },
});
```

#### Tool Calls Use `input`, Not `args`

In AI SDK 6, tool call objects have an `input` property (not `args`):

```ts
// In onStepFinish callback
onStepFinish: (step) => {
  for (const call of step.toolCalls) {
    console.log(call.toolName);  // "move_card"
    console.log(call.input);     // { cardName: "Pikachu", zone: "active" }
  }
}
```

## Our Architecture

### Three-Layer Design

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Tool Definition (ai-tools.ts, plugins/*/tools.ts)          │
│     - Creates ToolSet objects                                   │
│     - Pure tool logic, no context awareness                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Tool Assembly (prompt-builder.ts)                           │
│     - Filters tools by mode (setup, main, decision, etc.)       │
│     - Merges core + plugin tools                                │
│     - Returns { prompt, tools: ToolSet }                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Tool Wrapping (run-turn.ts)                                 │
│     - Wraps tools with execution context                        │
│     - Handles: short-circuit, terminal tools, rewind, errors    │
│     - Passes wrapped tools to streamText()                      │
└─────────────────────────────────────────────────────────────────┘
```

### Why Wrap Tools?

Tools are created once (during `createDefaultTools`) but need fresh context per agent run:

| Context | Created In | Purpose |
|---------|------------|---------|
| `stepState` | runAgent() | Parallel short-circuit (tool #2 fails → #3, #4 cancelled) |
| `rewindSignal` | runAgent() | Rewind communication (tool sets flag, loop clears history) |
| `abort` | runAgent() | Terminal tool handling (end_turn → stop agent) |
| `terminalTools` | runAgent() | Set of tool names that should abort |

### `wrapToolsWithContext()`

```ts
// In ai-tools.ts
export function wrapToolsWithContext(tools: ToolSet, context: ToolExecutionContext): ToolSet {
  const result: ToolSet = {};
  for (const [name, tool] of Object.entries(tools)) {
    result[name] = {
      ...tool,
      execute: async (args) => {
        // 1. Short-circuit if prior tool failed in this parallel batch
        if (context.stepState?.blocked) {
          return `Cancelled: a prior action was blocked...`;
        }
        try {
          const res = await tool.execute(args);
          
          // 2. Terminal tool (end_turn, concede, etc.)
          if (context.terminalTools.has(name) && context.abort) {
            context.abort.abort();
            context.stepState!.blocked = true;
          }
          
          // 3. Rewind tool
          if (name === 'rewind' && context.rewindSignal) {
            context.rewindSignal.triggered = true;
            context.restoreCheckpoint?.();
          }
          
          return res;
        } catch (e) {
          // 4. Error handling
          context.stepState!.blocked = true;
          return `Error: ${e.message}`;
        }
      },
    };
  }
  return result;
}
```

## File Reference

### Core Tool Files

| File | Purpose |
|------|---------|
| `src/core/ai-tools.ts` | `createDefaultTools(ctx)` returns core ToolSet. `wrapToolsWithContext()` adds context handling. |
| `src/ai/run-turn.ts` | `runAgent()` wraps tools with context before calling `streamText()`. Contains `StepState`, `RewindSignal` types. |
| `src/ai/constants.ts` | `TERMINAL_TOOL_NAMES` - tools that end the turn. `KEEP_LATEST_INFO_TOOL_NAMES` - tools whose results are condensed. |

### Plugin Tool Files

| File | Purpose |
|------|---------|
| `src/plugins/pokemon/tools.ts` | Pokemon-specific tools (`declare_attack`, `set_status`, `attach_energy`, etc.). Returns ToolSet. |
| `src/plugins/pokemon/prompt-builder.ts` | `buildToolSet(ctx, mode)` filters and merges tools per agent mode. |
| `src/core/types/game-plugin.ts` | `getAgentConfig(ctx, mode)` interface returns `{ prompt, tools: ToolSet }`. |

## Developer Guide

### Adding a New Core Tool

1. **Define in `ai-tools.ts`:**
```ts
export function createDefaultTools(ctx: ToolContext): ToolSet {
  return {
    // ...existing tools...
    
    my_new_tool: createTool(
      'Description shown to the LLM',
      z.object({
        param1: z.string().describe('What this param does'),
        param2: z.number().optional(),
      }),
      async ({ param1, param2 }) => {
        // Tool logic here
        return 'Result string sent back to LLM';
      }
    ),
  };
}
```

2. **No context handling needed** - `wrapToolsWithContext` adds it later.

3. **If it's terminal** (ends the turn), add to `TERMINAL_TOOL_NAMES` in `constants.ts`.

### Adding a Plugin Tool

1. **Define in `plugins/YOUR_GAME/tools.ts`:**
```ts
import { tool as aiTool } from 'ai';
import { z } from 'zod';

export function createMyPluginTools(ctx: ToolContext): ToolSet {
  return {
    my_tool: aiTool({
      description: '...',
      inputSchema: z.object({...}),
      execute: async (args) => {
        // Use ctx.execute() to run game actions
        return ctx.execute(someAction(ctx.playerIndex, ...));
      },
    }),
  };
}
```

2. **Add to prompt-builder.ts** if it should be filtered per mode.

### Filtering Tools Per Mode

In `prompt-builder.ts`, `buildToolSet()` uses `filterToolSet()`:

```ts
// Include mode: only these tools
filterToolSet(tools, 'include', ['draw', 'move_card', 'end_turn'])

// Exclude mode: all tools except these
filterToolSet(tools, 'exclude', ['rewind', 'mulligan'])
```

### Terminal Tools

Tools that end the agent loop (listed in `TERMINAL_TOOL_NAMES`):
- `end_turn` - Ends the turn
- `end_phase` - Ends setup/start-of-turn phase
- `concede` - Player concedes
- `declare_victory` - Player declares win
- `resolve_decision` - Resolves a pending decision

When called, these:
1. Call `abort.abort()` to signal the agent loop
2. Set `stepState.blocked = true` to cancel parallel tools

### The Rewind Tool

Special handling in `wrapToolsWithContext`:
1. Sets `rewindSignal.triggered = true`
2. Calls `restoreCheckpoint()` to restore game state
3. Agent loop detects signal, clears history, injects guidance
4. Limited to `MAX_REWINDS = 2` per turn

## Common Pitfalls

### ❌ Using `tool.name` or `call.args`
```ts
// WRONG - tools don't have .name in SDK 6
const name = tool.name;

// WRONG - SDK 6 uses 'input', not 'args'  
const args = call.args;
```

### ✅ Correct Pattern
```ts
// RIGHT - name comes from object key
for (const [name, tool] of Object.entries(tools)) { ... }

// RIGHT - SDK 6 uses 'input'
const args = call.input;
```

### ❌ Creating Tools as Arrays
```ts
// WRONG - SDK 6 expects objects
const tools = [
  { name: 'draw', ...toolConfig },
];
```

### ✅ Create as ToolSet Objects
```ts
// RIGHT - SDK 6 ToolSet is an object
const tools: ToolSet = {
  draw: tool({ description: '...', inputSchema: ..., execute: ... }),
};
```

### ❌ Passing Context at Tool Creation
```ts
// WRONG - context changes per runAgent call
const tools = createDefaultTools(ctx, { stepState, abort, ... });
```

### ✅ Wrap Tools at Execution Time
```ts
// RIGHT - create once, wrap per-run
const tools = createDefaultTools(ctx);
const wrapped = wrapToolsWithContext(tools, { stepState, abort, ... });
```
