import { generateText, jsonSchema } from 'ai';
import type { ToolSet } from 'ai';
import { createFireworks } from '@ai-sdk/fireworks';
import type { GamePlugin } from '../core';
import type { ToolContext, RunnableTool } from '../core/ai-tools';
import { createSpawnSubagentTool } from './tools/spawn-subagent';
import { logStepFinish } from './logging';
import { AI_CONFIG, TERMINAL_TOOL_NAMES } from './constants';

export interface AITurnConfig {
  context: ToolContext;
  plugin: GamePlugin;
  heuristics: string;
  model?: string;
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
        const res = await t.execute(args);
        if (abort && TERMINAL_TOOLS.has(t.name)) {
          abort.abort();
        }
        return res;
      },
    };
  }
  return result;
}

export async function runAITurn(config: AITurnConfig): Promise<void> {
  const { context, plugin, heuristics, apiKey } = config;
  const modelId = config.model ?? AI_CONFIG.DEFAULT_MODEL;

  const fireworks = createFireworks({ apiKey });
  const model = fireworks(modelId);

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
