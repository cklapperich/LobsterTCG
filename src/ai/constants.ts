export const AI_CONFIG = {
  DEFAULT_MODEL: 'accounts/fireworks/models/kimi-k2p5',
  MAX_TOKENS: 4096,
  MAX_STEPS: 30,
  /** Minimum ms between API requests to avoid 429 rate limits. */
  MIN_REQUEST_INTERVAL_MS: 1000,
} as const;

export const SUBAGENT_CONFIG = {
  MAX_TOKENS: 2048,
  MAX_STEPS: 20,
} as const;

export const TERMINAL_TOOL_NAMES = [
  'end_turn', 'end_phase', 'concede', 'declare_victory', 'resolve_decision', 'request_replan',
] as const;

export const PIPELINE_CONFIG = {
  CHECKUP_MAX_STEPS: 15,
  PLANNER_MAX_STEPS: 5,
  EXECUTOR_MAX_STEPS: 30,
  MAX_RETRY_CYCLES: 2, // 3 total: initial + 2 retries
} as const;

export const AUTONOMOUS_CONFIG = {
  CHECKUP_MAX_STEPS: 15,
  MAX_STEPS: 75,
} as const;
