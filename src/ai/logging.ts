/**
 * Structured logging for AI turn steps (Vercel AI SDK format).
 * Formats reasoning, text, and tool calls with color-coded console output.
 */
export function logStepFinish(step: {
  text?: string;
  toolCalls?: Array<{ toolName: string; args: Record<string, any> }>;
  reasoning?: string;
}): void {
  if (step.reasoning) {
    console.log('%c[thinking]', 'color: #888', step.reasoning);
  }
  if (step.text) {
    console.log('%c[AI]', 'color: #4a9', step.text);
  }
  if (step.toolCalls) {
    for (const call of step.toolCalls) {
      console.log(
        `%c[tool] ${call.toolName}`,
        'color: #c80',
        call.args,
      );
    }
  }
}
