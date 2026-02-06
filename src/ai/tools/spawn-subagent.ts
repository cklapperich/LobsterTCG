import Anthropic from '@anthropic-ai/sdk';
import type { RunnableTool } from '../../core/ai-tools';

/**
 * Create a tool that spawns a subagent for analysis tasks.
 * The subagent gets the same tools and system prompt but runs
 * as a separate toolRunner call.
 */
export function createSpawnSubagentTool(
  anthropic: Anthropic,
  tools: RunnableTool[],
  systemPrompt: string,
): RunnableTool {
  return {
    type: 'custom',
    name: 'spawn_subagent',
    description:
      'Spawn a subagent to handle a subtask such as analysis or evaluation. The subagent has access to the same game tools.',
    input_schema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'What the subagent should do',
        },
        model: {
          type: 'string',
          enum: ['sonnet', 'haiku'],
          description: 'Model to use (haiku for simple, sonnet for complex)',
        },
      },
      required: ['task'],
    },
    parse: (content: unknown) => content,
    async run(input: Record<string, any>) {
      const model =
        input.model === 'haiku'
          ? 'claude-haiku-4-5-20251001'
          : 'claude-sonnet-4-5-20250929';

      const runner = anthropic.beta.messages.toolRunner({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        tools: tools as any,
        messages: [{ role: 'user', content: input.task }],
      });

      const finalMessage = await runner.runUntilDone();
      const textContent = finalMessage.content.find(
        (c) => c.type === 'text',
      );
      return textContent?.type === 'text' ? textContent.text : 'Subagent completed without text response';
    },
  };
}
