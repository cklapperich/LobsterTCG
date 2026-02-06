import Anthropic from '@anthropic-ai/sdk';
import type { GamePlugin } from '../core';
import type { ToolContext } from '../core/ai-tools';
import { createSpawnSubagentTool } from './tools/spawn-subagent';
import { logMessage } from './logging';

export interface AITurnConfig {
  context: ToolContext;
  plugin: GamePlugin;
  heuristics: string;
  model?: string;
  apiKey: string;
  logging?: boolean;
  decisionMode?: boolean;
}

export async function runAITurn(config: AITurnConfig): Promise<void> {
  const { context, plugin, heuristics, apiKey } = config;
  const model = config.model ?? 'claude-sonnet-4-5-20250929';

  const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  // Get tools from plugin (respects plugin architecture)
  const gameTools = plugin.listTools!(context);

  // Add spawn_subagent tool
  const subagentTool = createSpawnSubagentTool(anthropic, gameTools, heuristics);
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

  // Run the tool loop — SDK handles the agentic loop automatically
  const runner = anthropic.beta.messages.toolRunner({
    model,
    max_tokens: 4096,
    system: heuristics,
    tools: allTools as any,
    messages: [{ role: 'user', content: userMessage }],
  });

  for await (const message of runner) {
    if (config.logging) logMessage(message);
  }

  if (config.logging) console.groupEnd();
}
