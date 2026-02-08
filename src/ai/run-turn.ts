import { generateText, jsonSchema } from 'ai';
import type { LanguageModelV1, ToolSet, CoreMessage } from 'ai';
import { createFireworks } from '@ai-sdk/fireworks';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { GamePlugin } from '../core';
import type { ToolContext, RunnableTool } from '../core/ai-tools';
import { createSpawnSubagentTool } from './spawn-subagent';
import { logStepFinish } from './logging';
import { AI_CONFIG, PIPELINE_CONFIG, AUTONOMOUS_CONFIG, TERMINAL_TOOL_NAMES } from './constants';
import { startActiveObservation } from '@langfuse/tracing';

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
 * set the abort flag so the caller knows to stop looping.
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
    if (!logInterval) {
      logInterval = setInterval(() => {
        const cutoff = Date.now() - 60000;
        while (requestTimestamps.length > 0 && requestTimestamps[0] < cutoff) {
          requestTimestamps.shift();
        }
        if (requestTimestamps.length > 0) {
          console.log(`[rate-limit] RPM: ${requestTimestamps.length} requests in last 60s`);
        } else {
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

        const retryAfter = res.headers.get('retry-after');
        const waitMs = retryAfter
          ? Math.ceil(parseFloat(retryAfter) * 1000)
          : Math.min(2000 * Math.pow(2, attempt), 30000);

        nextAllowedTime = Math.max(nextAllowedTime, Date.now() + waitMs);

        if (attempt < maxRetries) {
          console.warn(`[rate-limit] 429 received, retry ${attempt + 1}/${maxRetries} after ${waitMs}ms`);
          await new Promise(r => setTimeout(r, waitMs));
        } else {
          console.warn(`[rate-limit] 429 received, all ${maxRetries} retries exhausted`);
        }
      }
      trackRequest();
      return fetch(input, init);
    });
  }) as typeof fetch;

  return throttledFetch;
}

// ── Agent Runner ────────────────────────────────────────────────

interface AgentConfig {
  model: LanguageModelV1;
  /** Base system prompt (heuristics/rules). Fresh game state is appended as the last message. */
  systemPrompt: string;
  /** Called before every LLM call to get fresh readable state. */
  getState: () => string;
  /** Initial user message — task instructions only (state is the last message). */
  initialMessage: string;
  tools: RunnableTool[];
  maxSteps: number;
  label: string;
  logging?: boolean;
}

interface AgentResult {
  text: string;
  stepCount: number;
  aborted: boolean;
}

/**
 * Condense tool results in message history to save tokens.
 * Replaces verbose tool-result content with a short summary like
 * "[move_card succeeded]" or "[move_card failed: Card not found...]".
 * Only processes messages from `fromIndex` onward.
 */
function condenseToolResults(history: CoreMessage[], fromIndex: number): void {
  for (let i = fromIndex; i < history.length; i++) {
    const msg = history[i];
    if (msg.role === 'tool' && Array.isArray(msg.content)) {
      for (const part of msg.content as any[]) {
        if (part.type === 'tool-result') {
          const raw = typeof part.result === 'string' ? part.result : JSON.stringify(part.result);
          const isError = raw.toLowerCase().startsWith('error');
          part.result = isError
            ? `[${part.toolName} failed: ${raw.slice(0, 120)}]`
            : `[${part.toolName} succeeded]`;
        }
      }
    }
  }
}

/**
 * Run an AI agent with per-step state refresh.
 *
 * Each step:
 *   1. Append fresh game state as the last user message (ephemeral)
 *   2. Call generateText with maxSteps: 1 (single LLM inference)
 *   3. Accumulate tool calls/results into conversation history
 *   4. Condense tool results from this step (saves tokens next step)
 *   5. Check if a terminal tool was called or model stopped calling tools
 *
 * State is always current because it's injected as the final message
 * (refreshed every call) rather than stored in the history. Previous
 * tool results are condensed to short summaries to keep context lean.
 */
async function runAgent(config: AgentConfig): Promise<AgentResult> {
  return startActiveObservation(config.label, async (span) => {
    const { model, systemPrompt, getState, initialMessage, tools, maxSteps, label, logging } = config;
    const abort = new AbortController();
    const sdkTools = tools.length > 0 ? toAISDKTools(tools, abort) : undefined;
    let stepCount = 0;
    let lastText = '';
    let aborted = false;

    const history: CoreMessage[] = [
      { role: 'user' as const, content: initialMessage },
    ];

    span.update({
      input: { systemPrompt: systemPrompt.slice(0, 500), initialMessage },
      metadata: { maxSteps, toolCount: tools.length },
    });

    if (logging) {
      console.group(`[AI: ${label}]`);
      console.log('%c[system]', 'color: #88f', systemPrompt.slice(0, 200) + '...');
    }

    try {
      for (let step = 0; step < maxSteps; step++) {
        // Fresh state as the last message (ephemeral, not stored in history)
        const freshState = getState();
        const messagesWithState: CoreMessage[] = [
          ...history,
          { role: 'user' as const, content: `[CURRENT GAME STATE]\n${freshState}` },
        ];

        const result = await generateText({
          model,
          maxTokens: AI_CONFIG.MAX_TOKENS,
          maxRetries: 0,
          system: systemPrompt,
          tools: sdkTools,
          maxSteps: 1,
          messages: messagesWithState,
          onStepFinish: (s) => {
            if (logging) logStepFinish(s);
          },
        });

        stepCount++;
        lastText = result.text || lastText;

        // Accumulate response into history, then condense tool results
        const prevLen = history.length;
        for (const msg of result.response.messages) {
          history.push(msg as CoreMessage);
        }
        condenseToolResults(history, prevLen);

        // Terminal tool called (end_turn, concede, etc.)
        if (abort.signal.aborted) {
          aborted = true;
          break;
        }

        // No tool calls → model is done
        if (!result.toolCalls || result.toolCalls.length === 0) break;
      }
    } catch (e: any) {
      if (logging) console.groupEnd();
      span.update({ level: 'ERROR', statusMessage: e?.message ?? String(e) });
      throw e;
    }

    if (logging) console.groupEnd();
    span.update({ output: { stepCount, aborted } });
    return { text: lastText, stepCount, aborted };
  }, { asType: 'span' });
}

// ── Shared Checkup Phase ────────────────────────────────────────

async function runCheckupPhase(config: {
  model: LanguageModelV1;
  ctx: ToolContext;
  plugin: GamePlugin;
  checkupPrompt: string;
  maxSteps: number;
  logging?: boolean;
  logPrefix: string;
}): Promise<void> {
  const { model, ctx, plugin, checkupPrompt, maxSteps, logging, logPrefix } = config;

  let skip = false;
  try {
    skip = await plugin.shouldSkipStartOfTurn?.(ctx) ?? false;
  } catch (e) {
    console.warn(`[${logPrefix}] shouldSkipStartOfTurn hook failed:`, e);
  }
  if (skip) return;

  try {
    ctx.agentRole = 'checkup';
    const tools = plugin.listTools!(ctx);
    if (tools.length === 0) return;

    await runAgent({
      model,
      systemPrompt: checkupPrompt,
      getState: () => ctx.getReadableState(),
      initialMessage: 'Perform the start-of-turn checkup, then call end_phase.',
      tools,
      maxSteps,
      label: 'Checkup',
      logging,
    });
  } catch (e) {
    console.warn(`[${logPrefix}] Checkup agent failed, continuing:`, e);
  }
}

// ── Single-Agent Turn Runner (setup/decision/turn) ──────────────

export async function runAITurn(config: AITurnConfig): Promise<void> {
  const turnType = config.setupMode ? 'setup' : config.decisionMode ? 'decision' : 'turn';
  const modelId = config.model ?? AI_CONFIG.DEFAULT_MODEL;
  const provider = config.provider ?? 'fireworks';

  await startActiveObservation(`ai-turn:${turnType}`, async (agent) => {
    agent.update({ metadata: { model: modelId, provider, turnType } });

    const { context, plugin, heuristics, apiKey } = config;

    const rateLimitedFetch = createRateLimitedFetch(AI_CONFIG.MIN_REQUEST_INTERVAL_MS);
    const model = (provider === 'anthropic'
      ? createAnthropic({ apiKey, fetch: rateLimitedFetch })(modelId)
      : createFireworks({ apiKey, fetch: rateLimitedFetch })(modelId)) as any;

    const gameTools = plugin.listTools!(context);
    const subagentTool = createSpawnSubagentTool(model, gameTools, heuristics);
    const allTools = [...gameTools, subagentTool];

    const initialMessage = config.setupMode
      ? 'Do your setup.'
      : config.decisionMode
      ? 'Your opponent has requested a decision. Read the pendingDecision field and recent log entries. Take the necessary actions, then call resolve_decision when done.'
      : 'It\'s your turn. Take actions to advance toward winning. Call end_turn when done.';

    await runAgent({
      model,
      systemPrompt: heuristics,
      getState: () => context.getReadableState(),
      initialMessage,
      tools: allTools,
      maxSteps: AI_CONFIG.MAX_STEPS,
      label: turnType.charAt(0).toUpperCase() + turnType.slice(1),
      logging: config.logging,
    });
  }, { asType: 'agent' });
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
  const modelId = config.model ?? AI_CONFIG.DEFAULT_MODEL;
  const provider = config.provider ?? 'fireworks';

  await startActiveObservation('ai-pipeline', async (chain) => {
    const { context: ctx, plugin, apiKey } = config;

    chain.update({ metadata: { model: modelId, provider } });

    const rateLimitedFetch = createRateLimitedFetch(AI_CONFIG.MIN_REQUEST_INTERVAL_MS);
    const model = (provider === 'anthropic'
      ? createAnthropic({ apiKey, fetch: rateLimitedFetch })(modelId)
      : createFireworks({ apiKey, fetch: rateLimitedFetch })(modelId)) as any;

    // ── Phase 1: CHECKUP ──────────────────────────────────────────
    await runCheckupPhase({
      model, ctx, plugin,
      checkupPrompt: config.checkupPrompt,
      maxSteps: PIPELINE_CONFIG.CHECKUP_MAX_STEPS,
      logging: config.logging,
      logPrefix: 'AI Pipeline',
    });

    // ── Phases 2+3: PLANNER → EXECUTOR retry loop ─────────────────
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= PIPELINE_CONFIG.MAX_RETRY_CYCLES; attempt++) {
      // Phase 2: PLANNER (no tools, text-only output)
      ctx.agentRole = 'planner';
      const plannerTools = plugin.listTools!(ctx);

      let plannerExtra = '';
      if (lastError) {
        plannerExtra = `\n\n⚠️ RETRY: The previous execution attempt failed with this error:\n${lastError}\nPlease adjust your plan to avoid this issue.`;
      }

      let planText = '';
      try {
        const planResult = await runAgent({
          model,
          systemPrompt: config.plannerPrompt,
          getState: () => ctx.getReadableState(),
          initialMessage: `Plan your turn. Output a numbered plan as text.${plannerExtra}`,
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
        {
          name: 'request_replan',
          description: 'Abandon the current plan and return to the planner for a new one. Use when a coin flip, search result, or error makes the plan impossible to continue.',
          parameters: { type: 'object' as const, properties: { reason: { type: 'string', description: 'Why the plan needs to change' } }, required: ['reason'] },
          execute: (input: Record<string, any>) => { ctx.replanReason = input.reason; return 'Returning to planner...'; },
        } satisfies RunnableTool,
      ];

      try {
        const execResult = await runAgent({
          model,
          systemPrompt: config.executorPrompt,
          getState: () => ctx.getReadableState(),
          initialMessage: `Execute this plan:\n${planText}\n\nCall end_turn when done. If you can't proceed (coin flip failed, card not found, wrong tool used), call request_replan instead.`,
          tools: executorTools,
          maxSteps: PIPELINE_CONFIG.EXECUTOR_MAX_STEPS,
          label: attempt > 0 ? `Executor (retry ${attempt})` : 'Executor',
          logging: config.logging,
        });

        if (ctx.replanReason) {
          lastError = ctx.replanReason;
          if (attempt < PIPELINE_CONFIG.MAX_RETRY_CYCLES) {
            console.warn(`[AI Pipeline] Executor requested replan: ${lastError}`);
            continue;
          }
        }

        if (execResult.aborted) break;

        const state = ctx.getState();
        if (state.activePlayer === 1) {
          lastError = `Executor completed ${execResult.stepCount} steps without calling end_turn.`;
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

    ctx.agentRole = undefined;
  }, { asType: 'chain' });
}

// ── Autonomous Agent ────────────────────────────────────────────

export interface AIAutonomousConfig {
  context: ToolContext;
  plugin: GamePlugin;
  systemPrompt: string;
  checkupPrompt: string;
  model?: string;
  provider?: AIProvider;
  apiKey: string;
  logging?: boolean;
}

/**
 * Run a full AI turn as a single autonomous agent:
 *   1. Checkup phase (shared helper — limited tools, shouldSkipStartOfTurn)
 *   2. Main turn — full tools, runs until end_turn or step budget exhausted
 *
 * State is refreshed in the system prompt before every LLM call,
 * so the agent always sees the real board after every action.
 */
export async function runAutonomousAgent(config: AIAutonomousConfig): Promise<void> {
  const modelId = config.model ?? AI_CONFIG.DEFAULT_MODEL;
  const provider = config.provider ?? 'fireworks';

  await startActiveObservation('ai-autonomous', async (agent) => {
    const { context: ctx, plugin, apiKey } = config;

    agent.update({ metadata: { model: modelId, provider } });

    const rateLimitedFetch = createRateLimitedFetch(AI_CONFIG.MIN_REQUEST_INTERVAL_MS);
    const model = (provider === 'anthropic'
      ? createAnthropic({ apiKey, fetch: rateLimitedFetch })(modelId)
      : createFireworks({ apiKey, fetch: rateLimitedFetch })(modelId)) as any;

    // ── Phase 1: CHECKUP ─────────────────────────────────────────
    await runCheckupPhase({
      model, ctx, plugin,
      checkupPrompt: config.checkupPrompt,
      maxSteps: AUTONOMOUS_CONFIG.CHECKUP_MAX_STEPS,
      logging: config.logging,
      logPrefix: 'AI Autonomous',
    });

    // ── Phase 2: MAIN TURN ───────────────────────────────────────
    ctx.agentRole = undefined;
    const gameTools = plugin.listTools!(ctx);
    const subagentTool = createSpawnSubagentTool(model, gameTools, config.systemPrompt);
    const allTools = [...gameTools, subagentTool];

    await runAgent({
      model,
      systemPrompt: config.systemPrompt,
      getState: () => ctx.getReadableState(),
      initialMessage: 'It\'s your turn. Drawing and checkup are already done. Take actions to advance toward winning. Call end_turn when done.',
      tools: allTools,
      maxSteps: AUTONOMOUS_CONFIG.MAX_STEPS,
      label: 'Autonomous',
      logging: config.logging,
    });

    ctx.agentRole = undefined;
  }, { asType: 'agent' });
}
