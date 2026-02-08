import { generateText, jsonSchema } from 'ai';
import type { LanguageModelV1, ToolSet, CoreMessage } from 'ai';
import { createFireworks } from '@ai-sdk/fireworks';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { GamePlugin } from '../core';
import type { ToolContext, RunnableTool } from '../core/ai-tools';
import { createSpawnSubagentTool } from './spawn-subagent';
import { logStepFinish } from './logging';
import { AI_CONFIG, PIPELINE_CONFIG, AUTONOMOUS_CONFIG, TERMINAL_TOOL_NAMES } from './constants';

export type AIProvider = 'fireworks' | 'anthropic';

export interface ModelOption {
  id: string;
  label: string;
  provider: AIProvider;
  modelId: string;
  apiKeyEnv: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'kimi-k2',
    label: 'Kimi K2',
    provider: 'fireworks',
    modelId: AI_CONFIG.DEFAULT_MODEL,
    apiKeyEnv: 'VITE_FIREWORKS_API_KEY',
  },
  {
    id: 'kimi-k2p5',
    label: 'Kimi K2.5',
    provider: 'fireworks',
    modelId: AI_CONFIG.DEFAULT_MODEL,
    apiKeyEnv: 'VITE_FIREWORKS_API_KEY',
  },
  {
    id: 'glm-4p7',
    label: 'GLM 4p7',
    provider: 'fireworks',
    modelId: 'accounts/fireworks/models/glm-4p7',
    apiKeyEnv: 'VITE_FIREWORKS_API_KEY',
  },
  {
    id: 'sonnet-4.5',
    label: 'Sonnet 4.5',
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-5-20250929',
    apiKeyEnv: 'VITE_ANTHROPIC_API_KEY',
  },
];

export interface AITurnConfig {
  context: ToolContext;
  plugin: GamePlugin;
  heuristics: string;
  model?: string;
  provider?: AIProvider;
  apiKey: string;
  logging?: boolean;
  decisionMode?: boolean;
  setupMode?: boolean;
}

/** Tools that signal the end of an AI turn — no further steps needed. */
const TERMINAL_TOOLS = new Set<string>(TERMINAL_TOOL_NAMES);

/**
 * Convert our RunnableTool[] array into the Record<string, CoreTool>
 * map that the Vercel AI SDK's generateText expects.
 *
 * When an AbortController is provided, terminal tools (end_turn, concede, etc.)
 * will abort after executing so generateText stops immediately.
 */
export function toAISDKTools(tools: RunnableTool[], abort?: AbortController): ToolSet {
  const result: ToolSet = {};
  for (const t of tools) {
    result[t.name] = {
      description: t.description,
      parameters: jsonSchema(t.parameters as any),
      execute: async (args: Record<string, any>) => {
        try {
          const res = await t.execute(args);
          if (abort && TERMINAL_TOOLS.has(t.name)) {
            abort.abort();
          }
          return res;
        } catch (e: any) {
          const msg = e?.message ?? String(e);
          console.warn(`[AI] Tool "${t.name}" error:`, msg);
          return `Error: ${msg}`;
        }
      },
    };
  }
  return result;
}

/**
 * Create a fetch wrapper that:
 * 1. Serializes requests with a minimum delay between each one
 * 2. Intercepts 429 responses and retries with Retry-After awareness
 *
 * This handles rate limits transparently so the AI SDK's own retry loop
 * (which doesn't respect Retry-After) doesn't pile on more 429s.
 */
function createRateLimitedFetch(minDelayMs: number, maxRetries = 3): typeof fetch {
  let nextAllowedTime = 0;
  let queue: Promise<void> = Promise.resolve();

  // RPM tracker: rolling window of request timestamps
  const requestTimestamps: number[] = [];
  let logInterval: ReturnType<typeof setInterval> | null = null;

  function trackRequest() {
    const now = Date.now();
    requestTimestamps.push(now);
    // Start logging interval on first request
    if (!logInterval) {
      logInterval = setInterval(() => {
        const cutoff = Date.now() - 60000;
        while (requestTimestamps.length > 0 && requestTimestamps[0] < cutoff) {
          requestTimestamps.shift();
        }
        if (requestTimestamps.length > 0) {
          console.log(`[rate-limit] RPM: ${requestTimestamps.length} requests in last 60s`);
        } else {
          // No requests in the last minute, stop logging
          clearInterval(logInterval!);
          logInterval = null;
        }
      }, 10000);
    }
  }

  const throttledFetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const myTurn = queue.then(async () => {
      const now = Date.now();
      const wait = Math.max(0, nextAllowedTime - now);
      if (wait > 0) {
        console.log(`[rate-limit] waiting ${wait}ms before request`);
        await new Promise(r => setTimeout(r, wait));
      }
      nextAllowedTime = Date.now() + minDelayMs;
    });
    queue = myTurn.catch(() => {});

    return myTurn.then(async () => {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        trackRequest();
        const res = await fetch(input, init);
        if (res.status !== 429) return res;

        // Parse Retry-After (seconds) or fall back to exponential backoff
        const retryAfter = res.headers.get('retry-after');
        const waitMs = retryAfter
          ? Math.ceil(parseFloat(retryAfter) * 1000)
          : Math.min(2000 * Math.pow(2, attempt), 30000);

        // Push back nextAllowedTime so queued requests also wait
        nextAllowedTime = Math.max(nextAllowedTime, Date.now() + waitMs);

        if (attempt < maxRetries) {
          console.warn(`[rate-limit] 429 received, retry ${attempt + 1}/${maxRetries} after ${waitMs}ms`);
          await new Promise(r => setTimeout(r, waitMs));
        } else {
          console.warn(`[rate-limit] 429 received, all ${maxRetries} retries exhausted`);
        }
      }
      // All retries exhausted — make one final attempt and return whatever we get
      trackRequest();
      return fetch(input, init);
    });
  }) as typeof fetch;

  return throttledFetch;
}

// ── Agent Phase Runner ──────────────────────────────────────────

interface AgentPhaseConfig {
  model: LanguageModelV1;
  systemPrompt: string;
  userMessage: string;
  tools: RunnableTool[];
  maxSteps: number;
  label: string;
  logging?: boolean;
  messages?: CoreMessage[];  // accumulated history (userMessage appended to end)
}

interface AgentPhaseResult {
  text: string;
  stepCount: number;
  aborted: boolean;
  responseMessages: CoreMessage[];
}

/**
 * Run a single agent phase — wraps one generateText call.
 * Each phase gets its own AbortController so terminal tools
 * only stop the current phase, not the whole pipeline.
 */
async function runAgentPhase(config: AgentPhaseConfig): Promise<AgentPhaseResult> {
  const { model, systemPrompt, userMessage, tools, maxSteps, label, logging, messages: priorMessages } = config;
  const abort = new AbortController();
  let stepCount = 0;

  if (logging) {
    console.group(`[AI Pipeline: ${label}]`);
    console.log('%c[system]', 'color: #88f', systemPrompt.slice(0, 200) + '...');
  }

  // Build message list: prior history (if any) + new user message
  const inputMessages: CoreMessage[] = [
    ...(priorMessages ?? []),
    { role: 'user' as const, content: userMessage },
  ];

  try {
    const result = await generateText({
      model,
      maxTokens: AI_CONFIG.MAX_TOKENS,
      maxRetries: 0,
      system: systemPrompt,
      tools: tools.length > 0 ? toAISDKTools(tools, abort) : undefined,
      maxSteps,
      abortSignal: abort.signal,
      messages: inputMessages,
      onStepFinish: (step) => {
        stepCount++;
        if (logging) logStepFinish(step);
      },
    });

    if (logging) console.groupEnd();
    return { text: result.text ?? '', stepCount, aborted: false, responseMessages: result.response.messages as CoreMessage[] };
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      if (logging) console.groupEnd();
      return { text: '', stepCount, aborted: true, responseMessages: [] };
    }
    if (logging) console.groupEnd();
    throw e;
  }
}

// ── Single-Agent Turn Runner (setup/decision) ──────────────────

export async function runAITurn(config: AITurnConfig): Promise<void> {
  const { context, plugin, heuristics, apiKey } = config;
  const modelId = config.model ?? AI_CONFIG.DEFAULT_MODEL;
  const provider = config.provider ?? 'fireworks';

  const rateLimitedFetch = createRateLimitedFetch(AI_CONFIG.MIN_REQUEST_INTERVAL_MS);
  const model = (provider === 'anthropic'
    ? createAnthropic({ apiKey, fetch: rateLimitedFetch })(modelId)
    : createFireworks({ apiKey, fetch: rateLimitedFetch })(modelId)) as any;

  const gameTools = plugin.listTools!(context);
  const subagentTool = createSpawnSubagentTool(model, gameTools, heuristics);
  const allTools = [...gameTools, subagentTool];

  const readableState = context.getReadableState();

  const userMessage = config.setupMode
    ? `Current game state:\n${readableState}\n\nDo your setup.`
    : config.decisionMode
    ? `Current game state:\n${readableState}\n\nYour opponent has requested a decision. Read the pendingDecision field and recent log entries. Take the necessary actions, then call resolve_decision when done.`
    : `Current game state:\n${readableState}\n\nIt's your turn. Take actions to advance toward winning. Call end_turn when done.`;

  await runAgentPhase({
    model,
    systemPrompt: heuristics,
    userMessage,
    tools: allTools,
    maxSteps: AI_CONFIG.MAX_STEPS,
    label: config.setupMode ? 'Setup' : config.decisionMode ? 'Decision' : 'Turn',
    logging: config.logging,
  });
}

// ── Multi-Agent Pipeline ────────────────────────────────────────

export interface AIPipelineConfig {
  context: ToolContext;
  plugin: GamePlugin;
  checkupPrompt: string;
  plannerPrompt: string;
  executorPrompt: string;
  model?: string;
  provider?: AIProvider;
  apiKey: string;
  logging?: boolean;
}

/**
 * Run a full AI turn as a 3-phase pipeline:
 *   1. Checkup Agent — handles poison/burn/sleep/draw
 *   2. Planner Agent — reads state, outputs a text plan (no tools)
 *   3. Executor Agent — receives plan, executes with tools
 *
 * Phases 2+3 loop with error recovery (max PIPELINE_CONFIG.MAX_RETRY_CYCLES retries).
 */
export async function runAIPipeline(config: AIPipelineConfig): Promise<void> {
  const { context: ctx, plugin, apiKey } = config;
  const modelId = config.model ?? AI_CONFIG.DEFAULT_MODEL;
  const provider = config.provider ?? 'fireworks';

  // Shared rate limiter + model across all phases
  const rateLimitedFetch = createRateLimitedFetch(AI_CONFIG.MIN_REQUEST_INTERVAL_MS);
  const model = (provider === 'anthropic'
    ? createAnthropic({ apiKey, fetch: rateLimitedFetch })(modelId)
    : createFireworks({ apiKey, fetch: rateLimitedFetch })(modelId)) as any;

  // ── Phase 1: START OF TURN ─────────────────────────────────────
  // Plugin can skip the agent and handle mandatory actions (draw, deck-out) itself.
  let skipStartOfTurn = false;
  try {
    skipStartOfTurn = await plugin.shouldSkipStartOfTurn?.(ctx) ?? false;
  } catch (e) {
    console.warn('[AI Pipeline] shouldSkipStartOfTurn hook failed:', e);
  }

  if (!skipStartOfTurn) {
    try {
      ctx.agentRole = 'checkup';
      const checkupTools = plugin.listTools!(ctx);

      if (checkupTools.length > 0) {
        const readableState = ctx.getReadableState();
        await runAgentPhase({
          model,
          systemPrompt: config.checkupPrompt,
          userMessage: `Current game state:\n${readableState}\n\nPerform the start-of-turn checkup, then call end_phase.`,
          tools: checkupTools,
          maxSteps: PIPELINE_CONFIG.CHECKUP_MAX_STEPS,
          label: 'Checkup',
          logging: config.logging,
        });
      }
    } catch (e) {
      // Checkup failure is non-fatal — planner/executor can compensate
      console.warn('[AI Pipeline] Checkup agent failed, continuing:', e);
    }
  }

  // ── Phases 2+3: PLANNER → EXECUTOR retry loop ────────────────
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= PIPELINE_CONFIG.MAX_RETRY_CYCLES; attempt++) {
    // Phase 2: PLANNER (no tools, text-only output)
    ctx.agentRole = 'planner';
    const plannerTools = plugin.listTools!(ctx); // should return []

    const plannerState = ctx.getReadableState();
    let plannerMessage = `Current game state:\n${plannerState}\n\nPlan your turn. Output a numbered plan as text.`;
    if (lastError) {
      plannerMessage += `\n\n⚠️ RETRY: The previous execution attempt failed with this error:\n${lastError}\nPlease adjust your plan to avoid this issue.`;
    }

    let planText = '';
    try {
      const planResult = await runAgentPhase({
        model,
        systemPrompt: config.plannerPrompt,
        userMessage: plannerMessage,
        tools: plannerTools,
        maxSteps: PIPELINE_CONFIG.PLANNER_MAX_STEPS,
        label: attempt > 0 ? `Planner (retry ${attempt})` : 'Planner',
        logging: config.logging,
      });
      planText = planResult.text;
    } catch (e) {
      console.warn('[AI Pipeline] Planner failed:', e);
      planText = 'Execute your best available play and call end_turn.';
    }

    // Phase 3: EXECUTOR (full tools + request_replan)
    ctx.agentRole = 'executor';
    ctx.replanReason = undefined;
    const executorTools = [
      ...plugin.listTools!(ctx),
      // Pipeline-level tool: bail back to planner
      {
        name: 'request_replan',
        description: 'Abandon the current plan and return to the planner for a new one. Use when a coin flip, search result, or error makes the plan impossible to continue.',
        parameters: { type: 'object' as const, properties: { reason: { type: 'string', description: 'Why the plan needs to change' } }, required: ['reason'] },
        execute: (input: Record<string, any>) => { ctx.replanReason = input.reason; return 'Returning to planner...'; },
      } satisfies RunnableTool,
    ];

    const executorState = ctx.getReadableState();
    const executorMessage = `Current game state:\n${executorState}\n\nExecute this plan:\n${planText}\n\nCall end_turn when done. If you can't proceed (coin flip failed, card not found, wrong tool used), call request_replan instead.`;

    try {
      const execResult = await runAgentPhase({
        model,
        systemPrompt: config.executorPrompt,
        userMessage: executorMessage,
        tools: executorTools,
        maxSteps: PIPELINE_CONFIG.EXECUTOR_MAX_STEPS,
        label: attempt > 0 ? `Executor (retry ${attempt})` : 'Executor',
        logging: config.logging,
      });

      // Check if executor requested a replan
      if (ctx.replanReason) {
        lastError = ctx.replanReason;
        if (attempt < PIPELINE_CONFIG.MAX_RETRY_CYCLES) {
          console.warn(`[AI Pipeline] Executor requested replan: ${lastError}`);
          continue;
        }
      }

      // If executor called end_turn (aborted=true), we're done
      if (execResult.aborted) break;

      // If the executor finished without calling end_turn and it's still AI's turn,
      // capture error for retry
      const state = ctx.getState();
      if (state.activePlayer === 1) {
        lastError = `Executor completed ${execResult.stepCount} steps without calling end_turn. The turn was not ended.`;
        if (attempt < PIPELINE_CONFIG.MAX_RETRY_CYCLES) {
          console.warn(`[AI Pipeline] ${lastError} Retrying...`);
          continue;
        }
      }
      break;
    } catch (e: any) {
      lastError = e?.message ?? String(e);
      if (attempt < PIPELINE_CONFIG.MAX_RETRY_CYCLES) {
        console.warn(`[AI Pipeline] Executor error, retrying: ${lastError}`);
        continue;
      }
      console.error('[AI Pipeline] Executor failed after all retries:', e);
      break;
    }
  }

  // Clear agentRole when pipeline is done
  ctx.agentRole = undefined;
}

// ── Autonomous Agent ────────────────────────────────────────────

export interface AIAutonomousConfig {
  context: ToolContext;
  plugin: GamePlugin;
  systemPrompt: string;      // for main loop (PROMPT_AUTONOMOUS)
  checkupPrompt: string;     // for checkup phase (PROMPT_START_OF_TURN)
  model?: string;
  provider?: AIProvider;
  apiKey: string;
  logging?: boolean;
}

/**
 * Run a full AI turn as a single autonomous agent:
 *   1. Checkup phase (same as pipeline — limited tools, shouldSkipStartOfTurn)
 *   2. Autonomous loop — agent thinks + acts with full tools, looping with
 *      accumulated conversation history until end_turn or MAX_ITERATIONS.
 */
export async function runAutonomousAgent(config: AIAutonomousConfig): Promise<void> {
  const { context: ctx, plugin, apiKey } = config;
  const modelId = config.model ?? AI_CONFIG.DEFAULT_MODEL;
  const provider = config.provider ?? 'fireworks';

  const rateLimitedFetch = createRateLimitedFetch(AI_CONFIG.MIN_REQUEST_INTERVAL_MS);
  const model = (provider === 'anthropic'
    ? createAnthropic({ apiKey, fetch: rateLimitedFetch })(modelId)
    : createFireworks({ apiKey, fetch: rateLimitedFetch })(modelId)) as any;

  // ── Phase 1: CHECKUP ─────────────────────────────────────────
  let skipStartOfTurn = false;
  try {
    skipStartOfTurn = await plugin.shouldSkipStartOfTurn?.(ctx) ?? false;
  } catch (e) {
    console.warn('[AI Autonomous] shouldSkipStartOfTurn hook failed:', e);
  }

  if (!skipStartOfTurn) {
    try {
      ctx.agentRole = 'checkup';
      const checkupTools = plugin.listTools!(ctx);

      if (checkupTools.length > 0) {
        const readableState = ctx.getReadableState();
        await runAgentPhase({
          model,
          systemPrompt: config.checkupPrompt,
          userMessage: `Current game state:\n${readableState}\n\nPerform the start-of-turn checkup, then call end_phase.`,
          tools: checkupTools,
          maxSteps: AUTONOMOUS_CONFIG.CHECKUP_MAX_STEPS,
          label: 'Autonomous: Checkup',
          logging: config.logging,
        });
      }
    } catch (e) {
      console.warn('[AI Autonomous] Checkup agent failed, continuing:', e);
    }
  }

  // ── Phase 2: AUTONOMOUS LOOP ─────────────────────────────────
  ctx.agentRole = undefined; // full tools
  const gameTools = plugin.listTools!(ctx);
  const subagentTool = createSpawnSubagentTool(model, gameTools, config.systemPrompt);
  const allTools = [...gameTools, subagentTool];

  let history: CoreMessage[] = [];

  for (let iteration = 0; iteration < AUTONOMOUS_CONFIG.MAX_ITERATIONS; iteration++) {
    const readableState = ctx.getReadableState();
    const userMessage = iteration === 0
      ? `Current game state:\n${readableState}\n\nIt's your turn. Drawing and checkup are already done. Take actions to advance toward winning. Call end_turn when done.`
      : `Continue where you left off. Here is the current game state:\n${readableState}`;

    if (config.logging) {
      console.log(`%c[AI Autonomous] Iteration ${iteration + 1}/${AUTONOMOUS_CONFIG.MAX_ITERATIONS}`, 'color: #8f8; font-weight: bold');
    }

    try {
      const result = await runAgentPhase({
        model,
        systemPrompt: config.systemPrompt,
        userMessage,
        tools: allTools,
        maxSteps: AUTONOMOUS_CONFIG.MAX_STEPS_PER_ITERATION,
        label: iteration === 0 ? 'Autonomous' : `Autonomous (iter ${iteration + 1})`,
        logging: config.logging,
        messages: iteration > 0 ? history : undefined,
      });

      // Accumulate conversation history
      history = [
        ...history,
        { role: 'user' as const, content: userMessage },
        ...result.responseMessages,
      ];

      // If end_turn was called (aborted), we're done
      if (result.aborted) break;

      // If the turn ended some other way (e.g. concede, declare_victory)
      const state = ctx.getState();
      if (state.activePlayer !== 1) break;
    } catch (e: any) {
      console.error(`[AI Autonomous] Iteration ${iteration + 1} failed:`, e);
      break;
    }
  }

  ctx.agentRole = undefined;
}
