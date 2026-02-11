import { streamText, jsonSchema } from 'ai';
import type { LanguageModelV1, ToolSet, CoreMessage } from 'ai';
import { createFireworks } from '@ai-sdk/fireworks';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { GamePlugin } from '../core';
import type { ToolContext, RunnableTool } from '../core/ai-tools';
import { logStepFinish } from './logging';
import { AI_CONFIG, TERMINAL_TOOL_NAMES, KEEP_LATEST_INFO_TOOL_NAMES } from './constants';
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
 * Mutable per-step state shared across parallel tool calls.
 * When any tool errors/is blocked, `blocked` is set so subsequent
 * tools in the same parallel batch are short-circuited.
 */
export interface StepState {
  blocked: boolean;
  blockReason?: string;
}

/**
 * Shared signal for rewind communication between tools and the agent loop.
 * The rewind tool sets `triggered = true`; the loop detects it after the step.
 */
export interface RewindSignal {
  triggered: boolean;
  reason: string;
  guidance: string;
}

const MAX_REWINDS = 2;

/**
 * Convert our RunnableTool[] array into the Record<string, CoreTool>
 * map that the Vercel AI SDK's generateText expects.
 *
 * When an AbortController is provided, terminal tools (end_turn, concede, etc.)
 * set the abort flag so the caller knows to stop looping.
 *
 * When a StepState is provided, a tool error/block terminates the entire
 * parallel batch — subsequent tools return a cancellation message instead
 * of executing. The caller resets `stepState.blocked` between steps.
 */
export function toAISDKTools(
  tools: RunnableTool[],
  abort?: AbortController,
  stepState?: StepState,
  rewindSignal?: RewindSignal,
  restoreCheckpoint?: () => void,
): ToolSet {
  const result: ToolSet = {};
  for (const t of tools) {
    const sdkTool: any = {
      parameters: jsonSchema(t.parameters as any),
      execute: async (args: Record<string, any>) => {
        if (stepState?.blocked) {
          return `Cancelled: a prior action in this parallel batch was blocked (${stepState.blockReason}). All remaining actions have been cancelled. Review the error and adjust your plan.`;
        }
        const res = await t.execute(args);
        if (abort && TERMINAL_TOOLS.has(t.name)) {
          abort.abort();

          // NEW: Block subsequent parallel tools in this step
          if (stepState) {
            stepState.blocked = true;
            stepState.blockReason = `${t.name} executed - turn ending`;
          }
        }
        // Handle rewind: set signal, block batch, restore state
        if (t.name === 'rewind' && rewindSignal) {
          rewindSignal.triggered = true;
          rewindSignal.reason = args.reason ?? '';
          rewindSignal.guidance = args.guidance ?? '';
          if (stepState) {
            stepState.blocked = true;
            stepState.blockReason = 'Rewind triggered — remaining actions cancelled';
          }
          restoreCheckpoint?.();
        }
        return res;
      },
    };
    // Use getter so dynamic descriptions (e.g. attach_energy) refresh each step
    Object.defineProperty(sdkTool, 'description', {
      get() { return t.description; },
      enumerable: true,
    });
    result[t.name] = sdkTool;
  }
  return result;
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
  label: string;
  logging?: boolean;
  /** AbortController for coordinating termination across planner and subagents. */
  abort?: AbortController;
  /** Checkpoint for rewind support. When provided, the AI can call `rewind` to restore state. */
  checkpoint?: {
    snapshot: any;
    restore: (snapshot: any) => void;
  };
}

interface AgentResult {
  text: string;
  stepCount: number;
  aborted: boolean;
}

/** Info tools that share a single "keep latest" slot (only the most recent is preserved). */
const KEEP_LATEST_SET = new Set<string>(KEEP_LATEST_INFO_TOOL_NAMES);

/**
 * Condense tool results in message history to save tokens.
 *
 * Only peek/search_zone are condensed: they share a single "keep latest" slot
 * where only the most recent call is preserved (searching invalidates peek positions).
 * All other tool results are left untouched so the AI retains full context
 * (including block messages, error details, and effect text).
 */
function condenseToolResults(history: CoreMessage[], fromIndex: number): void {
  // Find the index of the most recent peek/search tool result across ENTIRE history
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

  // Condense only older peek/search results
  for (let i = fromIndex; i < history.length; i++) {
    const msg = history[i];
    if (msg.role === 'tool' && Array.isArray(msg.content)) {
      for (const part of msg.content as any[]) {
        if (part.type !== 'tool-result') continue;
        if (!KEEP_LATEST_SET.has(part.toolName)) continue;
        if (i === lastInfoToolIndex) continue;
        part.result = `[${part.toolName} — superseded by newer call]`;
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
const MAX_STEPS = 1000;
async function runAgent(config: AgentConfig): Promise<AgentResult> {
  return startActiveObservation(config.label, async (span) => {
    const { model, systemPrompt, getState, tools, label, logging, abort: configAbort, checkpoint } = config;
    const abort = configAbort ?? new AbortController();
    const stepState: StepState = { blocked: false };

    // Rewind support
    let rewindCount = 0;
    const rewindSignal: RewindSignal = { triggered: false, reason: '', guidance: '' };
    const restoreCheckpoint = checkpoint
      ? () => checkpoint.restore(checkpoint.snapshot)
      : undefined;

    const sdkTools = tools.length > 0
      ? toAISDKTools(tools, abort, stepState, checkpoint ? rewindSignal : undefined, restoreCheckpoint)
      : undefined;
    let stepCount = 0;
    let lastText = '';
    let aborted = false;

    const history: CoreMessage[] = [];

    span.update({
      input: { systemPrompt: systemPrompt },
      metadata: {toolCount: tools.length, toolNames: tools.map(t => t.name) },
    });

    if (logging) {
      console.group(`[AI: ${label}]`);
      console.log('%c[system]', 'color: #88f', systemPrompt.slice(0, 200) + '...');
    }

    for (let step = 0; step < MAX_STEPS; step++) {
      // Reset chain-termination flag — each step gets a clean slate
      stepState.blocked = false;
      stepState.blockReason = undefined;

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

        const stream = streamText({
          model,
          maxTokens: AI_CONFIG.MAX_TOKENS,
          maxRetries: 0,
          system: systemPrompt,
          tools: sdkTools,
          maxSteps: 1,
          messages: messagesWithState,
          onStepFinish: (s: any) => {
            if (logging) logStepFinish(s);
          },
        });

        // Drain the stream (executes tools, resolves all DelayedPromise properties)
        await stream.consumeStream();

        const res = {
          text: await stream.text,
          reasoning: await stream.reasoning,
          toolCalls: await stream.toolCalls,
          response: await stream.response,
          usage: await stream.usage,
        };

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

      // ── Rewind detection (check BEFORE accumulating history) ──
      if (rewindSignal.triggered) {
        rewindCount++;
        if (logging) {
          console.log(
            `%c[${label}] REWIND #${rewindCount}: ${rewindSignal.reason}`,
            'color: #f44',
          );
        }

        if (rewindCount > MAX_REWINDS) {
          // Over limit — accumulate history normally, inject denial
          if (logging) {
            console.log(`%c[${label}] Max rewinds (${MAX_REWINDS}) exceeded, continuing`, 'color: #f80');
          }
          const prevLen = history.length;
          for (const msg of result.response.messages) {
            history.push(msg as CoreMessage);
          }
          condenseToolResults(history, prevLen);
          history.push({
            role: 'user' as const,
            content: `[REWIND DENIED] Maximum rewind limit (${MAX_REWINDS}) reached. You must continue with the current game state. Guidance: ${rewindSignal.guidance}`,
          });
        } else {
          // Successful rewind — clear history, inject guidance
          history.length = 0;
          history.push({
            role: 'user' as const,
            content: `[REWIND APPLIED] Your previous actions have been undone. Reason: ${rewindSignal.reason}\n\nGuidance for this attempt: ${rewindSignal.guidance}`,
          });
        }

        // Reset signal
        rewindSignal.triggered = false;
        rewindSignal.reason = '';
        rewindSignal.guidance = '';
        continue;
      }

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

      // No tool calls = subagent has completed its instructions
      // Break normally (not aborted) so planner can continue
      if (!result.toolCalls || result.toolCalls.length === 0) {
        if (logging) console.log(`%c[${label}] step ${step}: no tool calls, task complete`, 'color: #f80');
        break;
      }
    }

    if (logging) console.groupEnd();
    span.update({ output: { stepCount, aborted, rewindCount, finalHistory: history } });
    return { text: lastText, stepCount, aborted };
  }, { asType: 'span' });
}

// ── Subagent Tool ───────────────────────────────────────────────

/**
 * Create the launch_subagent tool for the planner to delegate tasks.
 */
function createLaunchSubagentTool(opts: {
  executorModel: LanguageModelV1;
  executorSystemPrompt: string;
  executorTools: RunnableTool[];
  getState: () => string;
  plannerAbort: AbortController;
  logging?: boolean;
  deckStrategy?: string;
}): RunnableTool {
  return {
    name: 'launch_subagent',
    description: 'Launch an executor subagent to perform a specific task. Provide clear, concrete instructions with card names and zones. The subagent will execute mechanically and return when complete or when end_turn is called.',
    parameters: {
      type: 'object',
      properties: {
        instructions: {
          type: 'string',
          description: 'Clear, concrete instructions for the executor. Include specific card names, zones, and actions."',
        },
      },
      required: ['instructions'],
    },
    async execute(input: Record<string, any>) {
      const { executorModel, executorSystemPrompt, executorTools, getState, plannerAbort, logging} = opts;
      const instructions = input.instructions as string;

      const fullPrompt = `${executorSystemPrompt}\n\n## TASK INSTRUCTIONS\n${instructions}`;
      
      const result = await runAgent({
        model: executorModel,
        systemPrompt: fullPrompt,
        getState,
        tools: executorTools,
        label: 'Executor',
        logging,
        abort: plannerAbort,
      });
      return `Subagent completed. Steps used: ${result.stepCount}. Summary: ${result.text || 'Task finished'}`;
    },
  };
}

// ── Autonomous Agent ────────────────────────────────────────────

export interface AIAutonomousConfig {
  context: ToolContext;
  plugin: GamePlugin;
  model?: string;
  provider?: AIProvider;
  apiKey: string;
  aiMode?: 'autonomous' | 'pipeline';
  planner?: {
    model: string;
    provider: AIProvider;
    apiKey: string;
  };
  deckStrategy?: string;
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
    const { context: ctx, plugin, apiKey, deckStrategy } = config;

    agent.update({ metadata: { model: modelId, provider } });

    const model = (provider === 'anthropic'
      ? createAnthropic({ apiKey, baseURL: '/api/anthropic/v1' })(modelId)
      : createFireworks({ apiKey })(modelId)) as any;

    /** Append deck strategy to a prompt if available. */
    const withStrategy = (prompt: string) =>
      deckStrategy ? prompt + '\n\n## YOUR DECK STRATEGY\n' + deckStrategy : prompt;

    const mode = resolveMode(ctx);
    const isNormalTurn = mode === 'main';
    console.log(mode);
    // For normal turns: run start-of-turn first, then main turn
    if (isNormalTurn) {
      const skip = await plugin.shouldSkipStartOfTurn?.(ctx) ?? false;

      if (!skip) {
        const { prompt, tools } = plugin.getAgentConfig!(ctx, 'startOfTurn');
        await runAgent({
          model,
          systemPrompt: withStrategy(prompt),
          getState: () => ctx.getReadableState(),
          tools,
          label: 'StartOfTurn',
          logging: config.logging,
        });
      }

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
          executorSystemPrompt: execPrompt,
          executorTools: execTools,
          getState: () => ctx.getReadableState(),
          plannerAbort,
          logging: config.logging,
          deckStrategy,
        });
        await runAgent({
          model: plannerModel,
          systemPrompt: withStrategy(planPrompt),
          getState: () => ctx.getReadableState(),
          // TODO: give it an end turn tool as well
          tools: [launchTool],
          label: 'Planner',
          logging: config.logging,
          abort: plannerAbort,
        });
      } else {
        // Autonomous: existing single-agent path
        const { prompt, tools } = plugin.getAgentConfig!(ctx, 'main');
        const mainCheckpoint = ctx.createCheckpoint && ctx.restoreState
          ? { snapshot: ctx.createCheckpoint(), restore: ctx.restoreState }
          : undefined;
        await runAgent({
          model,
          systemPrompt: withStrategy(prompt),
          getState: () => ctx.getReadableState(),
          tools,
          label: 'Main',
          logging: config.logging,
          checkpoint: mainCheckpoint,
        });
      }
    } else if (mode === 'decision') {
      const { prompt, tools } = plugin.getAgentConfig!(ctx, 'decision');
      const decisionCheckpoint = ctx.createCheckpoint && ctx.restoreState
        ? { snapshot: ctx.createCheckpoint(), restore: ctx.restoreState }
        : undefined;
      await runAgent({
        model,
        systemPrompt: withStrategy(prompt),
        getState: () => ctx.getReadableState(),
        tools,
        label: 'Decision',
        logging: config.logging,
        checkpoint: decisionCheckpoint,
      });
    } else {
      // Setup: no rewind support
      const { prompt, tools } = plugin.getAgentConfig!(ctx, mode);
      await runAgent({
        model,
        systemPrompt: withStrategy(prompt),
        getState: () => ctx.getReadableState(),
        tools,
        label: 'Setup',
        logging: config.logging,
      });
    }
  }, { asType: 'agent' });
}
