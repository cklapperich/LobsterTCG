# Plan: Planner-Executor AI Agent Split

## Context

Cheap models (Kimi K2.5, GLM 4.7) can't play Pokemon TCG correctly — they miss abilities, misplay Rare Candy, undo their own successful actions when they see warnings. Sonnet plays perfectly but costs ~$1/game. The solution: **Sonnet plans the turn (text-only, 1 API call), cheap model executes mechanically (tool calls)**. Coin flips or blocks trigger a replan (Sonnet called again with current state).

The UI already has a "Pipeline (Plan+Execute)" / "Autonomous (Single Agent)" dropdown in DeckSelect. The `aiMode` prop flows to Game.svelte but isn't wired to `runAutonomousAgent` yet.

## Scope: Main Phase ONLY

**Planner-executor applies ONLY to the main phase.** The other phases stay single-model (user-selected, e.g. Kimi K2.5):

| Phase | Mode | Why |
|-------|------|-----|
| **Setup** | Single agent (Kimi) | Simple: place basics, mulligan. Kimi handles this fine. |
| **Start-of-Turn** | Single agent (Kimi) | Mechanical: apply poison/burn, draw card. No strategy needed. |
| **Main** | **Planner (Sonnet) + Executor (Kimi)** | Complex: play trainers, evolve, attach energy, use abilities, attack. This is where Kimi fails. |
| **Decision** | Single agent (Kimi) | Short: promote a Pokemon, take a prize. Kimi handles this fine. |

## Files to Modify

| File | Changes |
|------|---------|
| `src/ai/run-turn.ts` | Add `TerminalToolSignal`, extend `AgentResult`, add `runPlanner()`, add `runPlannerExecutorLoop()`, extend `AIAutonomousConfig`, modify `runAutonomousAgent()` main-phase branch |
| `src/ai/constants.ts` | Add `PLANNER_MAX_TOKENS`, `MAX_REPLANS` |
| `src/plugins/pokemon/prompt-builder.ts` | Extend `AgentMode` with `'planner' | 'executor'`, add two `MODE_CONFIGS` entries |
| `src/plugins/pokemon/prompt-sections.md` | Add `@ROLE_PLANNER`, `@PLANNER_OUTPUT_FORMAT`, `@ROLE_EXECUTOR` sections |
| `src/core/types/game-plugin.ts` | Extend `getAgentConfig` mode union with `'planner' | 'executor'` |
| `src/core/ai-tools.ts` | Add `request_replan` tool to `createDefaultTools()` |
| `src/components/game/Game.svelte` | Destructure `aiMode` from props, pass it + planner API key to `runAutonomousAgent()` |

## Implementation Steps

### Step 1: Constants (`src/ai/constants.ts`)

Add to `AI_CONFIG`:
```
PLANNER_MAX_TOKENS: 2048
```

Add to `AUTONOMOUS_CONFIG`:
```
MAX_REPLANS: 3
```

`request_replan` is already in `TERMINAL_TOOL_NAMES` — no change needed.

### Step 2: Terminal Tool Detection (`src/ai/run-turn.ts`)

Add a `TerminalToolSignal` interface:
```typescript
export interface TerminalToolSignal {
  name: string;
}
```

Extend `AgentResult`:
```typescript
interface AgentResult {
  text: string;
  stepCount: number;
  aborted: boolean;
  terminalTool?: string;  // NEW — which tool triggered the abort
}
```

Modify `toAISDKTools()`: add `terminalSignal?: TerminalToolSignal` parameter. When a terminal tool fires (line ~112), set `terminalSignal.name = t.name` before calling `abort.abort()`.

Modify `runAgent()`: create `TerminalToolSignal`, pass to `toAISDKTools`, read it after loop to set `AgentResult.terminalTool`.

### Step 3: Add `request_replan` tool (`src/core/ai-tools.ts`)

Add to `createDefaultTools()` array, near the `rewind` tool:
```typescript
tool({
  name: 'request_replan',
  description: 'Request a new strategic plan. Use when the current plan is invalidated: coin flip results, blocked actions, or unexpected board state. Already-executed actions stay — the planner sees CURRENT state and plans the REMAINDER.',
  inputSchema: {
    type: 'object',
    properties: {
      reason: { type: 'string', description: 'What invalidated the current plan' },
    },
    required: ['reason'],
  },
  async run(input) {
    return `Replan requested: ${input.reason}`;
  },
})
```

### Step 4: Prompt Sections (`src/plugins/pokemon/prompt-sections.md`)

Add three sections:

**`@ROLE_PLANNER`** — Strategic planner role. No tools. Output a concrete numbered action plan. Include coin flip contingencies (HEADS → X, TAILS → Y). Be specific: name exact cards, zones, targets. Mention `allowed_by_card_effect=true` when card effects bypass rules (Rare Candy, energy acceleration, etc.).

**`@PLANNER_OUTPUT_FORMAT`** — Structured format:
```
SITUATION: [1-2 sentences]
PLAN:
1. [action with exact card names and zones]
2. ...
N. end_turn
COIN FLIP CONTINGENCIES: [or "None"]
```

**`@ROLE_EXECUTOR`** — Mechanical executor role. Follow the plan literally. Call `request_replan` when: coin flip invalidates plan, action is blocked, card not found in expected zone. Do NOT make strategic decisions.

### Step 5: Mode Configs (`src/plugins/pokemon/prompt-builder.ts`)

Extend `AgentMode`:
```typescript
export type AgentMode = 'setup' | 'startOfTurn' | 'main' | 'decision' | 'planner' | 'executor';
```

Add `planner` config:
- **Sections**: INTRO, GAME_ENGINE, ROLE_PLANNER, TURN_STRUCTURE_MAIN, WIN_CONDITIONS, ZONE_LAYOUT, KEY_RULES, STATUS_CONDITIONS, DAMAGE, STRATEGY_PLANNING, PLANNER_OUTPUT_FORMAT
- **Tools**: None (`coreToolFilter: 'include', coreTools: []`)

Add `executor` config:
- **Sections**: INTRO, GAME_ENGINE, ROLE_EXECUTOR, TURN_STRUCTURE_MAIN, WIN_CONDITIONS, ZONE_LAYOUT, KEY_RULES, STATUS_CONDITIONS, DAMAGE, TOOL_USAGE, PEEK_AND_SEARCH, DECISIONS, ERROR_CORRECTION
- **Tools**: Same as `main` mode but exclude `rewind` (replan replaces it). `request_replan` comes through as a default core tool.
- `addCustomTools: true`

Update `getAgentConfig` type in `src/core/types/game-plugin.ts` to include `'planner' | 'executor'`.

### Step 6: Planner Function (`src/ai/run-turn.ts`)

New `runPlanner()` function:
- Takes: model, systemPrompt, gameState string, label, logging
- Single `streamText()` call with NO tools
- Returns `{ plan: string }` — the text output
- Uses `PLANNER_MAX_TOKENS` (2048)

### Step 7: Planner-Executor Loop (`src/ai/run-turn.ts`)

New `runPlannerExecutorLoop()` function:

```
loop (max MAX_REPLANS + 1 iterations):
  1. Call runPlanner(sonnetModel, plannerPrompt, currentState)
  2. Build executor prompt = executorSystemPrompt + "\n\n## PLAN\n" + plan
  3. Call runAgent(kimiModel, executorPrompt, tools, remainingSteps)
  4. If result.terminalTool === 'request_replan':
     - Increment replanCount
     - If over limit: run executor one final time WITHOUT request_replan tool
     - Else: continue loop (planner sees current state, plans remainder)
  5. If any other terminal tool or step budget exhausted: break
```

Key design decisions:
- **No checkpoint restore on replan** — actions stay, planner sees current state and plans the remainder
- **Executor history starts fresh each replan** — new plan = clean conversation
- **Total step budget shared** across all executor runs (75 steps)

### Step 8: Wire Up (`src/ai/run-turn.ts` + `Game.svelte`)

Extend `AIAutonomousConfig`:
```typescript
aiMode?: 'autonomous' | 'pipeline';
plannerApiKey?: string;
```

In `runAutonomousAgent()`, **only the `isNormalTurn` (main phase) branch** changes:
```
if (isNormalTurn) {
  // Start-of-turn: ALWAYS single-agent with user-selected model (unchanged)
  run startOfTurn agent with user model...

  // Main phase: check aiMode
  if (config.aiMode === 'pipeline') {
    → runPlannerExecutorLoop() with Sonnet planner + user-selected executor
  } else {
    → existing runAgent() single-agent path (unchanged)
  }
}
// Setup and decision branches: UNCHANGED (always single-agent, user model)
```

Default `PLANNER_MODEL` constant pointing to Sonnet 4.5.

In `Game.svelte`:
- Destructure `aiMode` from `$props()` (currently declared in Props interface but not destructured on line 44)
- Pass `aiMode` and `plannerApiKey: import.meta.env.VITE_ANTHROPIC_API_KEY` to `runAutonomousAgent()`

## Verification

1. **TypeScript compilation**: `npx tsc --noEmit` should pass
2. **Autonomous mode unchanged**: Select "Autonomous" + any model → setup, checkup, main, decision all work as before
3. **Pipeline mode — setup/checkup/decision**: These still use the user-selected model (Kimi K2.5), no Sonnet involvement
4. **Pipeline mode — main phase**: Select "Pipeline" + Kimi K2.5 → observe:
   - Console shows `[AI: Planner]` with structured plan text (Sonnet)
   - Console shows `[AI: Executor]` following the plan with tool calls (Kimi)
   - Turn completes with `end_turn`
5. **Replan trigger**: Play a deck with coin-flip attacks → observe:
   - Executor calls `request_replan` after coin flip
   - Console shows `[AI: Replanner-1]` with revised plan for remainder
   - Executor continues with new plan
6. **Max replan limit**: Force 4+ replans → executor runs without `request_replan` on final attempt
