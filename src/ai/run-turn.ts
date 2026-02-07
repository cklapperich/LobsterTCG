import { generateText, jsonSchema } from 'ai';
import type { ToolSet } from 'ai';
import { createFireworks } from '@ai-sdk/fireworks';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { GamePlugin } from '../core';
import type { ToolContext, RunnableTool } from '../core/ai-tools';
import { createSpawnSubagentTool } from './spawn-subagent';
import { logStepFinish } from './logging';
import { AI_CONFIG, TERMINAL_TOOL_NAMES } from './constants';

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
export function toAISDKTools(tools: RunnableTool[], abort?: AbortController, ctx?: ToolContext): ToolSet {
  const result: ToolSet = {};
  for (const t of tools) {
    result[t.name] = {
      description: t.description,
      parameters: jsonSchema(t.parameters as any),
      execute: async (args: Record<string, any>) => {
        // Batch abort: if a previous tool in this step set the abort reason, reject remaining calls
        if (ctx?.batchAbortReason) {
          return `[batch aborted] ${ctx.batchAbortReason}`;
        }
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

export async function runAITurn(config: AITurnConfig): Promise<void> {
  const { context, plugin, heuristics, apiKey } = config;
  const modelId = config.model ?? AI_CONFIG.DEFAULT_MODEL;
  const provider = config.provider ?? 'fireworks';

  // Rate-limit all API requests through a single queue
  const rateLimitedFetch = createRateLimitedFetch(AI_CONFIG.MIN_REQUEST_INTERVAL_MS);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (provider === 'anthropic'
    ? createAnthropic({ apiKey, fetch: rateLimitedFetch })(modelId)
    : createFireworks({ apiKey, fetch: rateLimitedFetch })(modelId)) as any;

  // Get tools from plugin (respects plugin architecture)
  const gameTools = plugin.listTools!(context);

  // Add spawn_subagent tool
  const subagentTool = createSpawnSubagentTool(model, gameTools, heuristics);
  const allTools = [...gameTools, subagentTool];

  // Initial readable state
  const readableState = context.getReadableState();

  const userMessage = config.setupMode
    ? `Current game state:\n${readableState}\n\nDo your setup.`
    : config.decisionMode
    ? `Current game state:\n${readableState}\n\nYour opponent has requested a decision. Read the pendingDecision field and recent log entries. Take the necessary actions, then call resolve_decision when done.`
    : `Current game state:\n${readableState}\n\nIt's your turn. Take actions to advance toward winning. Call end_turn when done.`;

  // Log system prompt
  if (config.logging) {
    console.group('[AI Turn]');
    console.log('%c[system]', 'color: #88f', heuristics.slice(0, 200) + '...');
  }

  // AbortController stops the loop as soon as a terminal tool (end_turn, etc.) executes
  const abort = new AbortController();

  // Run the tool loop — AI SDK handles the agentic loop via maxSteps
  try {
    await generateText({
      model,
      maxTokens: AI_CONFIG.MAX_TOKENS,
      // Our fetch wrapper handles 429 retries with Retry-After awareness,
      // so disable the SDK's own blind retry loop.
      maxRetries: 0,
      system: heuristics,
      tools: toAISDKTools(allTools, abort, context),
      maxSteps: AI_CONFIG.MAX_STEPS,
      abortSignal: abort.signal,
      messages: [{ role: 'user', content: userMessage }],
      onStepFinish: (step) => {
        if (config.logging) logStepFinish(step);
        // Clear batch abort so the next step starts fresh
        context.batchAbortReason = undefined;
      },
    });
  } catch (e: any) {
    // AbortError is expected when a terminal tool fires — ignore it
    if (e?.name !== 'AbortError') throw e;
  }

  if (config.logging) console.groupEnd();
}
