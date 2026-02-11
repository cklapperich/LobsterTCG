Plan: Planner-Executor with Subagent Orchestration
Context
Cheap models (Kimi K2.5) can't play Pokemon TCG correctly. Sonnet plays perfectly but costs ~$1/game. Solution: Sonnet orchestrates as planner (with launch_subagent tool), cheap model executes mechanically as subagent(s). Main phase only — setup/start-of-turn/decision stay single-model (executor model).

Additionally, we radically simplify hooks for ALL modes: zero pre-hooks (every rule has card effect exceptions), keep only post-hooks (logging, reorder, flags). Delete allowed_by_card_effect from all tool schemas. Old hooks preserved as reference only.

Architecture

Planner (dropdown-selected, e.g. Sonnet) — tool: launch_subagent
  │
  ├─ launch_subagent("Play trainers, evolve pokemon")
  │    └─ Executor (dropdown-selected, e.g. Kimi) — all game tools
  │         └─ returns result → back to Planner
  │
  ├─ launch_subagent("Attach energy and attack, then end turn")
  │    └─ Executor — calls end_turn → shared abort fires → Planner stops too
  │
  └─ (done)
Executor model = setup + start-of-turn + decision + subagent execution (all phases)
Planner model = main-phase orchestrator (pipeline mode only)
Both chosen from DeckSelect.svelte dropdowns
Planner + subagents share one AbortController. Subagent calls end_turn → abort fires → both loops stop.
Subagent runs out of instructions → stops making tool calls → returns to planner normally.
Files to Modify
1. src/ai/constants.ts
Already added PLANNER_CONFIG { MODEL, MAX_TOKENS } and MAX_REPLANS: 3.

Remove request_replan from TERMINAL_TOOL_NAMES
PLANNER_CONFIG.MODEL becomes the default value for the planner dropdown
2. src/plugins/pokemon/hooks.ts → Simplify for ALL modes
Move hooks.ts → hooks-reference.ts (purely for reference, not imported anywhere).

Create new hooks.ts — zero pre-hooks, used by both pipeline and autonomous modes:

Keep all post-hooks (logging, reorder, stamp flags, GX/VSTAR markers)
Zero pre-hooks — every rule has card effect exceptions. AI legality handled by prompts/narrative state.
Keep modifyReadableState and readableStateFormatter: formatNarrativeState
Export pokemonHooksPlugin (same name, so no import changes needed anywhere)
3. src/components/game/DeckSelect.svelte — Two model dropdowns
Current "AI MODEL" dropdown stays (executor model for all phases)
Add "PLANNER MODEL" dropdown — shown only when aiMode === 'pipeline'
Uses same MODEL_OPTIONS, defaults to Sonnet (PLANNER_CONFIG.MODEL lookup)
Add plannerModel state variable
Pass plannerModel in onStartGame callback
4. src/components/game/Game.svelte — Wire up both models + aiMode
Destructure aiMode and plannerModel from $props() (already in Props interface, or add)
Resolve selectedPlannerModel from MODEL_OPTIONS like selectedModel
Pass to runAutonomousAgent():

aiMode,
planner: aiMode === 'pipeline' ? {
  model: selectedPlannerModel.modelId,
  provider: selectedPlannerModel.provider,
  apiKey: import.meta.env[`${selectedPlannerModel.apiKeyEnv}`],
} : undefined,
5. src/core/ai-tools.ts — Delete allowed_by_card_effect
With zero pre-hooks, no code checks this param. Delete it from all tool schemas in createDefaultTools():

move_card — remove property + spread
move_card_stack — remove property + spread
place_on_zone — remove property + spread
add_counter — remove property + spread
6. src/ai/run-turn.ts — Core orchestration changes
a) Delete TerminalToolSignal — already added, needs to be removed. Shared AbortController is the only mechanism needed.

b) AgentConfig — add abort?: AbortController:

runAgent uses config.abort ?? new AbortController(). One line change.

c) New createLaunchSubagentTool() function:


function createLaunchSubagentTool(opts: {
  executorModel: LanguageModelV1;
  executorSystemPrompt: string;
  executorTools: RunnableTool[];
  getState: () => string;
  plannerAbort: AbortController;
  stepBudget: { remaining: number };
  logging?: boolean;
}): RunnableTool
Spawns runAgent with executor prompt + task instructions appended
Passes plannerAbort as the abort param → shared controller
If result.aborted → end_turn fired, return "Turn is over" (planner also stops via shared abort)
Otherwise → return result summary, planner plans next chunk
d) AIAutonomousConfig — extend:


aiMode?: 'autonomous' | 'pipeline';
planner?: {
  model: string;
  provider: AIProvider;
  apiKey: string;
};
e) runAutonomousAgent — pipeline split ONLY in main phase:

Setup, startOfTurn, and decision use the executor model (same model variable from existing code). Only the isNormalTurn main-phase branch forks:


// ── Main phase: FORK ──
if (config.aiMode === 'pipeline' && config.planner) {
  const { model: planModelId, provider: planProvider, apiKey: planApiKey } = config.planner;
  const plannerModel = (planProvider === 'anthropic'
    ? createAnthropic({ apiKey: planApiKey, baseURL: '/api/anthropic/v1' })(planModelId)
    : createFireworks({ apiKey: planApiKey })(planModelId)) as any;

  const { prompt: execPrompt, tools: execTools } = plugin.getAgentConfig!(ctx, 'executor');
  const { prompt: planPrompt } = plugin.getAgentConfig!(ctx, 'planner');
  const plannerAbort = new AbortController();
  const launchTool = createLaunchSubagentTool({
    executorModel: model,  // executor model (from dropdown)
    executorSystemPrompt: withStrategy(execPrompt),
    executorTools: execTools,
    getState: () => ctx.getReadableState(),
    plannerAbort,
    stepBudget: { remaining: AUTONOMOUS_CONFIG.MAX_STEPS },
    logging: config.logging,
  });
  await runAgent({
    model: plannerModel,
    systemPrompt: withStrategy(planPrompt),
    getState: () => ctx.getReadableState(),
    tools: [launchTool],
    maxSteps: AUTONOMOUS_CONFIG.MAX_REPLANS + 1,
    label: 'Planner',
    logging: config.logging,
    abort: plannerAbort,
  });
} else {
  // Autonomous: existing single-agent path (unchanged)
}
7. src/plugins/pokemon/prompt-sections.md — New sections
## @ROLE_PLANNER — Strategic orchestrator. Has launch_subagent tool. Analyze state, form strategy, delegate via focused subagent launches with concrete card names, zones, actions. Plan to "information boundaries" (coin flips, draws, searches).

## @ROLE_EXECUTOR — Mechanical executor. Follow given instructions exactly using game tools. If you run out of instructions, stop making tool calls — control returns to planner automatically.

8. src/plugins/pokemon/prompt-builder.ts — Mode configs
Extend AgentMode: 'planner' | 'executor'

planner config:

Sections: INTRO, GAME_ENGINE, ROLE_PLANNER, TURN_STRUCTURE_MAIN, WIN_CONDITIONS, ZONE_LAYOUT, KEY_RULES, STATUS_CONDITIONS, DAMAGE, STRATEGY_PLANNING
coreToolFilter: 'include', coreTools: [] (launch_subagent added externally)
executor config:

Sections: ROLE_EXECUTOR, ZONE_LAYOUT, TOOL_USAGE, PEEK_AND_SEARCH
Minimal context — executor just follows planner instructions mechanically
Full game tools minus rewind, resolve_decision, mulligan, and HIDDEN_DEFAULT_TOOLS
Has create_decision tool (but planner tells it when to use it, e.g. "play Iono, shuffle cards, request decision")
addCustomTools: true
Important: Since executor has no game rules sections, tool descriptions and TOOL_USAGE prompt must be self-documenting for mechanics like status conditions (paralysis = 90° rotation, confusion = 180°, burn/poison = counters), energy attachment, evolution, etc. Planner gives high-level instructions ("paralyze Pikachu"), executor needs tool-level guidance to know which tool/args to use.
9. src/core/types/game-plugin.ts — Type update
Extend mode union: 'setup' | 'startOfTurn' | 'main' | 'decision' | 'planner' | 'executor'

Verification
npx tsc --noEmit passes
Autonomous mode: works exactly as before (simplified hooks, single model)
Pipeline mode: Planner dropdown (Sonnet) + Executor dropdown (Kimi) → console shows [AI: Planner] + [AI: Executor-N]
Turn ends when subagent calls end_turn (shared abort propagates)
Setup/startOfTurn/decision all use the executor model
