export const AI_CONFIG = {
  DEFAULT_MODEL: 'accounts/fireworks/models/kimi-k2p5',
  MAX_TOKENS: 4096,
  MAX_STEPS: 30,
} as const;

export const TERMINAL_TOOL_NAMES = [
  'end_turn', 'end_phase', 'concede', 'declare_victory', 'resolve_decision',
] as const;

export const AUTONOMOUS_CONFIG = {
  CHECKUP_MAX_STEPS: 15,
  MAX_STEPS: 75,
  MAX_REPLANS: 3,
} as const;

/** Tools that share a single "keep latest" slot in condenseToolResults.
 *  Only the most recent call among ALL of these is preserved; older ones are condensed.
 *  Rationale: peek and search are mutually exclusive (searching invalidates peek positions). */
export const KEEP_LATEST_INFO_TOOL_NAMES = ['search_zone', 'peek'] as const;

