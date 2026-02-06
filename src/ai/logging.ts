/**
 * Structured logging for AI turn messages.
 * Formats thinking, text, and tool_use blocks with color-coded console output.
 */
export function logMessage(message: { content: Array<Record<string, any>> }): void {
  for (const block of message.content) {
    if (block.type === 'thinking') {
      console.log('%c[thinking]', 'color: #888', block.thinking);
    } else if (block.type === 'text') {
      console.log('%c[AI]', 'color: #4a9', block.text);
    } else if (block.type === 'tool_use') {
      console.log(
        `%c[tool] ${block.name}`,
        'color: #c80',
        block.input,
      );
    }
  }
}
