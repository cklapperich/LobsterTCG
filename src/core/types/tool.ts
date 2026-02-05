/**
 * Tool definition compatible with the Anthropic SDK.
 * Matches the shape expected by anthropic.beta.messages.toolRunner({ tools }).
 */
export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (input: Record<string, unknown>) => Promise<string>;
}
