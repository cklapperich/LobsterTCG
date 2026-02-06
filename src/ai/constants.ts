export const AI_CONFIG = {
  DEFAULT_MODEL: 'accounts/fireworks/models/kimi-k2p5',
  MAX_TOKENS: 4096,
  MAX_STEPS: 30,
} as const;

export const SUBAGENT_CONFIG = {
  MAX_TOKENS: 2048,
  MAX_STEPS: 20,
} as const;

export const TERMINAL_TOOL_NAMES = [
  'end_turn', 'end_phase', 'concede', 'declare_victory', 'resolve_decision',
] as const;
