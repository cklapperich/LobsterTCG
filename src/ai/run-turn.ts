import { generateText, jsonSchema } from 'ai';
import type { LanguageModelV1, ToolSet, CoreMessage } from 'ai';
import { createFireworks } from '@ai-sdk/fireworks';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { GamePlugin } from '../core';
import type { ToolContext, RunnableTool } from '../core/ai-tools';
import { logStepFinish } from './logging';
import { AI_CONFIG, AUTONOMOUS_CONFIG, TERMINAL_TOOL_NAMES, KEEP_LATEST_INFO_TOOL_NAMES, ALWAYS_PRESERVE_TOOL_NAMES } from './constants';
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

/** Set of tool names that share a single "keep latest" slot. */
const KEEP_LATEST_SET = new Set<string>(KEEP_LATEST_INFO_TOOL_NAMES);
/** Set of tool names whose results are always preserved. */
const ALWAYS_PRESERVE_SET = new Set<string>(ALWAYS_PRESERVE_TOOL_NAMES);

/**
 * Condense tool results in message history to save tokens.
 *
 * Strategy:
 * - peek/search_zone share a single "keep latest" slot: only the most recent
 *   call is preserved, older ones are condensed. Rationale: peek and search
 *   are mutually exclusive (searching invalidates peek positions).
 * - coin_flip/dice_roll are always preserved (small output).
 * - All other tool results are condensed to "[tool_name succeeded]".
 *
 * Only processes messages from `fromIndex` onward.
 */
function condenseToolResults(history: CoreMessage[], fromIndex: number): void {
  // First pass: find the index of the most recent peek/search tool result
  // across the ENTIRE history (not just fromIndex onward) so we preserve it.
  let lastInfoToolIndex = -1;
  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    if (msg.role === 'tool' && Array.isArray(msg.content)) {
      for (const part of msg.content as any[]) {
        if (part.type === 'tool-result' && KEEP_LATEST_SET.has(part.toolName)) {
          lastInfoToolIndex = i;
        }
      }
    }
  }

  // Second pass: condense from fromIndex onward
  for (let i = fromIndex; i < history.length; i++) {
    const msg = history[i];
    if (msg.role === 'tool' && Array.isArray(msg.content)) {
      for (const part of msg.content as any[]) {
        if (part.type !== 'tool-result') continue;

        // Always preserve coin_flip / dice_roll
        if (ALWAYS_PRESERVE_SET.has(part.toolName)) continue;

        // Preserve the single most recent peek/search result
        if (KEEP_LATEST_SET.has(part.toolName) && i === lastInfoToolIndex) continue;

        const raw = typeof part.result === 'string' ? part.result : JSON.stringify(part.result);
        const isError = raw.toLowerCase().startsWith('error');
        part.result = isError
          ? `[${part.toolName} failed: ${raw.slice(0, 120)}]`
          : `[${part.toolName} succeeded]`;
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
    const { model, systemPrompt, getState, tools, maxSteps, label, logging } = config;
    const abort = new AbortController();
    const sdkTools = tools.length > 0 ? toAISDKTools(tools, abort) : undefined;
    let stepCount = 0;
    let lastText = '';
    let aborted = false;

    const history: CoreMessage[] = [
      { role: 'user' as const, content: systemPrompt },
    ];

    span.update({
      input: { systemPrompt: systemPrompt },
      metadata: { maxSteps, toolCount: tools.length, toolNames: tools.map(t => t.name) },
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

        const result = await startActiveObservation(`${label}/step-${step}`, async (gen) => {
          gen.update({
            input: { system: systemPrompt, messages: messagesWithState },
          });

          const res = await generateText({
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

          gen.update({
            output: {
              text: res.text,
              reasoning: res.reasoning,
              toolCalls: res.toolCalls,
              responseMessages: res.response.messages,
            },
            usageDetails: {
              input: res.usage?.promptTokens ?? 0,
              output: res.usage?.completionTokens ?? 0,
              total: res.usage?.totalTokens ?? 0,
            },
          });

          return res;
        }, { asType: 'generation' });

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

        // No tool calls (e.g. thinking consumed all output tokens) → log and continue
        if (!result.toolCalls || result.toolCalls.length === 0) {
          if (logging) console.log(`%c[${label}] step ${step}: no tool calls, continuing`, 'color: #f80');
        }
      }
    } catch (e: any) {
      if (logging) console.groupEnd();
      span.update({ level: 'ERROR', statusMessage: e?.message ?? String(e) });
      throw e;
    }

    if (logging) console.groupEnd();
    span.update({ output: { stepCount, aborted, finalHistory: history } });
    return { text: lastText, stepCount, aborted };
  }, { asType: 'span' });
}

// ── Autonomous Agent ────────────────────────────────────────────

export interface AIAutonomousConfig {
  context: ToolContext;
  plugin: GamePlugin;
  model?: string;
  provider?: AIProvider;
  apiKey: string;
  logging?: boolean;
}

/**
 * Determine the agent mode from game state and tool context.
 */
function resolveMode(ctx: ToolContext): 'setup' | 'startOfTurn' | 'main' | 'decision' {
  if (ctx.isDecisionResponse) return 'decision';
  if (ctx.getState().phase === 'setup') return 'setup';
  return 'main';
}

/**
 * Run a full AI turn as a single autonomous agent.
 * Prompt and tools are determined automatically via plugin.getAgentConfig().
 *
 * For normal turns (playing phase, not decision):
 *   1. Start-of-turn — skipped if plugin.shouldSkipStartOfTurn() returns true,
 *      otherwise runs a short agent with the startOfTurn config
 *   2. Main turn — full tools, runs until end_turn or step budget exhausted
 *
 * For setup and decision modes: single agent call with the appropriate config.
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

    const mode = resolveMode(ctx);
    const isNormalTurn = mode === 'main';

    // For normal turns: run start-of-turn first, then main turn
    if (isNormalTurn) {
      const skip = await plugin.shouldSkipStartOfTurn?.(ctx) ?? false;

      if (!skip) {
        const { prompt, tools } = plugin.getAgentConfig!(ctx, 'startOfTurn');
        await runAgent({
          model,
          systemPrompt: prompt,
          getState: () => ctx.getReadableState(),
          tools,
          maxSteps: AUTONOMOUS_CONFIG.CHECKUP_MAX_STEPS,
          label: 'StartOfTurn',
          logging: config.logging,
        });
      }

      const { prompt, tools } = plugin.getAgentConfig!(ctx, 'main');
      await runAgent({
        model,
        systemPrompt: prompt,
        getState: () => ctx.getReadableState(),
        tools,
        maxSteps: AUTONOMOUS_CONFIG.MAX_STEPS,
        label: 'Main',
        logging: config.logging,
      });
    } else {
      // Setup or decision: single agent call
      const { prompt, tools } = plugin.getAgentConfig!(ctx, mode);
      await runAgent({
        model,
        systemPrompt: prompt,
        getState: () => ctx.getReadableState(),
        tools,
        maxSteps: AUTONOMOUS_CONFIG.MAX_STEPS,
        label: mode === 'decision' ? 'Decision' : 'Setup',
        logging: config.logging,
      });
    }
  }, { asType: 'agent' });
}
