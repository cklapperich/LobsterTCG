import { generateText, jsonSchema } from 'ai';
import type { ToolSet } from 'ai';
import { createFireworks } from '@ai-sdk/fireworks';
import type { GamePlugin } from '../core';
import type { ToolContext, RunnableTool } from '../core/ai-tools';
import { createSpawnSubagentTool } from './tools/spawn-subagent';
import { logStepFinish } from './logging';

export interface AITurnConfig {
  context: ToolContext;
  plugin: GamePlugin;
  heuristics: string;
  model?: string;
  apiKey: string;
  logging?: boolean;
  decisionMode?: boolean;
}

/**
 * Convert our RunnableTool[] array into the Record<string, CoreTool>
 * map that the Vercel AI SDK's generateText expects.
 */
export function toAISDKTools(tools: RunnableTool[]): ToolSet {
  const result: ToolSet = {};
  for (const t of tools) {
    result[t.name] = {
      description: t.description,
      parameters: jsonSchema(t.parameters as any),
      execute: async (args: Record<string, any>) => t.execute(args),
    };
  }
  return result;
}

export async function runAITurn(config: AITurnConfig): Promise<void> {
  const { context, plugin, heuristics, apiKey } = config;
  const modelId = config.model ?? 'accounts/fireworks/models/kimi-k2p5';

  const fireworks = createFireworks({ apiKey });
  const model = fireworks(modelId);

  // Get tools from plugin (respects plugin architecture)
  const gameTools = plugin.listTools!(context);

  // Add spawn_subagent tool
  const subagentTool = createSpawnSubagentTool(model, gameTools, heuristics);
  const allTools = [...gameTools, subagentTool];

  // Initial readable state
  const readableState = context.getReadableState();

  const userMessage = config.decisionMode
    ? `Current game state:\n${readableState}\n\nYour opponent has requested a decision. Read the pendingDecision field and recent log entries. Take the necessary actions, then call resolve_decision when done.`
    : `Current game state:\n${readableState}\n\nIt's your turn. Take actions to advance toward winning. Call end_turn when done.`;

  // Log system prompt
  if (config.logging) {
    console.group('[AI Turn]');
    console.log('%c[system]', 'color: #88f', heuristics.slice(0, 200) + '...');
  }

  // Run the tool loop — AI SDK handles the agentic loop via maxSteps
  await generateText({
    model,
    maxTokens: 4096,
    system: heuristics,
    tools: toAISDKTools(allTools),
    maxSteps: 30,
    messages: [{ role: 'user', content: userMessage }],
    onStepFinish: (step) => {
      if (config.logging) logStepFinish(step);
    },
  });

  if (config.logging) console.groupEnd();
}
