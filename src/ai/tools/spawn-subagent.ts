import { generateText } from 'ai';
import type { LanguageModelV1 } from 'ai';
import type { RunnableTool } from '../../core/ai-tools';
import { toAISDKTools } from '../run-turn';
import { SUBAGENT_CONFIG } from '../constants';

/**
 * Create a tool that spawns a subagent for analysis tasks.
 * The subagent gets the same tools and system prompt but runs
 * as a separate generateText call.
 */
export function createSpawnSubagentTool(
  model: LanguageModelV1,
  tools: RunnableTool[],
  systemPrompt: string,
): RunnableTool {
  return {
    name: 'spawn_subagent',
    description:
      'Spawn a subagent to handle a subtask such as analysis or evaluation. The subagent has access to the same game tools.',
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'What the subagent should do',
        },
      },
      required: ['task'],
    },
    async execute(input: Record<string, any>) {
      const result = await generateText({
        model,
        maxTokens: SUBAGENT_CONFIG.MAX_TOKENS,
        maxRetries: 0, // rate-limited fetch wrapper handles retries
        system: systemPrompt,
        tools: toAISDKTools(tools),
        maxSteps: SUBAGENT_CONFIG.MAX_STEPS,
        messages: [{ role: 'user', content: input.task }],
      });

      return result.text || 'Subagent completed without text response';
    },
  };
}
