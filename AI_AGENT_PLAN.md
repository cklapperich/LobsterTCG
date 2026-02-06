# AI Agent System for LobsterTCG

## Overview

AI agent using the **Anthropic SDK Tool Runner** (beta) that reads game state, makes decisions, spawns subagents, and executes game actions.

## Architecture

### RunnableTool Interface
Tools use a `RunnableTool` interface defined in `src/core/ai-tools.ts` that is structurally compatible with the SDK's `BetaRunnableTool`. This avoids deep SDK imports that break Vite 5's module resolution. The shape is:

```typescript
interface RunnableTool {
  type: 'custom';
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  run: (input: Record<string, any>) => Promise<string> | string;
  parse: (content: unknown) => any;
}
```

### GameLoop for AI Turns
Game.svelte calls `executeAction()` directly — it doesn't use `GameLoop`. But AI tools need hook orchestration (plugin blockers, pre-hooks, post-hooks, state observers, auto-actions). `runAITurn()` creates a `GameLoop` per AI turn with `{ trackHistory: false }`, deep-clones the current state into it, runs tools via `gameLoop.submit()` + `gameLoop.processAll()`, then extracts the final state back.

### SDK toolRunner as Outer Loop
The SDK's `toolRunner` handles the agentic loop: send state to Claude, Claude returns tool calls, SDK calls `run()` functions, sends results back, repeat until Claude responds with text only.

### Agent Instructions
Heuristics/system prompt loaded from `src/plugins/pokemon/agents.md` at build time via Vite raw import.

### AI is Always Player 2
Player index 1. No UI selection for now.

### Client-Side API Key
`VITE_ANTHROPIC_API_KEY` env var, `dangerouslyAllowBrowser: true`.

## Tool Pipeline

1. `createDefaultTools()` in `src/core/ai-tools.ts` — 17 generic game action tools
2. Plugin's `listTools()` filters defaults, adds game-specific tools (Pokemon: `declare_attack`, `declare_retreat`, `declare_ability`)
3. `runAITurn()` appends `spawn_subagent` tool
4. All tools passed to `anthropic.beta.messages.toolRunner()`

## Files

### AI Agent
| File | Purpose |
|------|---------|
| `src/ai/index.ts` | Public exports |
| `src/ai/run-turn.ts` | Main AI turn runner using SDK `toolRunner` |
| `src/ai/logging.ts` | Conversation logging for debugging |
| `src/ai/tools/spawn-subagent.ts` | Subagent spawning tool |

### Core
| File | Purpose |
|------|---------|
| `src/core/ai-tools.ts` | `RunnableTool` interface, `createDefaultTools()` factory |
| `src/core/game-loop.ts` | `trackHistory` option to skip deep-clones |
| `src/core/types/game-plugin.ts` | `listTools()` returns `RunnableTool[]` |

### Pokemon Plugin
| File | Purpose |
|------|---------|
| `src/plugins/pokemon/index.ts` | `listTools()` filters defaults, adds Pokemon tools |
| `src/plugins/pokemon/agents.md` | AI agent instructions/heuristics |

## Usage

1. Add `VITE_ANTHROPIC_API_KEY=sk-ant-...` to `.env`
2. `npm run dev`
3. Start a game, end turn → AI takes over as Player 2
4. Console shows structured conversation log with each tool call and result
5. Game state updates reactively after AI turn
