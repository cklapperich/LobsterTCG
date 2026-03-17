/**
 * Declarative agent configuration for each AI mode in Pokemon Pocket.
 */
import type { ToolSet } from 'ai';
import sectionsRaw from './prompt-sections.md?raw';
import { ACTION_TYPES } from '../../core/types/constants';
import { createDefaultTools, type ToolContext } from '../../core/ai-tools';
import {
  createPocketCustomTools,
  createSetStatusTool,
  createEndPhaseTool,
  createAwardPointsTool,
  HIDDEN_DEFAULT_TOOLS,
} from './tools';

function parseSections(raw: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const regex = /^## @(\w+)\s*$/gm;
  let match: RegExpExecArray | null;
  let lastKey: string | null = null;
  let lastIndex = 0;

  while ((match = regex.exec(raw)) !== null) {
    if (lastKey !== null) {
      sections[lastKey] = raw.slice(lastIndex, match.index).trim();
    }
    lastKey = match[1];
    lastIndex = match.index + match[0].length;
  }

  if (lastKey !== null) {
    sections[lastKey] = raw.slice(lastIndex).trim();
  }

  return sections;
}

const SECTIONS = parseSections(sectionsRaw);

export function buildPrompt(...keys: string[]): string {
  return keys.map(k => {
    const s = SECTIONS[k];
    if (!s) throw new Error(`Unknown prompt section: ${k}`);
    return s.trim();
  }).join('\n\n');
}

export type AgentMode = 'setup' | 'betweenTurns' | 'main' | 'decision' | 'planner' | 'executor';

interface ModeConfig {
  sections: string[];
  coreToolFilter: 'include' | 'exclude';
  coreTools: string[];
  addCustomTools: boolean;
  extras?: (ctx: ToolContext) => ToolSet;
}

const MODE_CONFIGS: Record<AgentMode, ModeConfig> = {
  setup: {
    sections: [
      'INTRO', 'ROLE_SETUP', 'TURN_STRUCTURE_SETUP',
      'ZONE_LAYOUT', 'KEY_RULES',
      'TOOL_USAGE', 'STRATEGY_PLANNING',
    ],
    coreToolFilter: 'include',
    coreTools: [
      ACTION_TYPES.MOVE_CARD,
      ACTION_TYPES.DRAW,
      ACTION_TYPES.SWAP_CARD_STACKS,
      ACTION_TYPES.END_TURN,
      ACTION_TYPES.MULLIGAN,
    ],
    addCustomTools: false,
  },

  betweenTurns: {
    sections: [
      'INTRO', 'ROLE_BETWEEN_TURNS', 'WIN_CONDITIONS',
      'ZONE_LAYOUT', 'KEY_RULES', 'STATUS_CONDITIONS', 'DAMAGE',
      'TOOL_USAGE', 'DECISIONS',
    ],
    coreToolFilter: 'include',
    coreTools: [
      ACTION_TYPES.ADD_COUNTER,
      ACTION_TYPES.REMOVE_COUNTER,
      ACTION_TYPES.SET_COUNTER,
      ACTION_TYPES.COIN_FLIP,
      ACTION_TYPES.DRAW,
      ACTION_TYPES.SWAP_CARD_STACKS,
      ACTION_TYPES.MOVE_CARD,
      ACTION_TYPES.CREATE_DECISION,
      ACTION_TYPES.CONCEDE,
    ],
    addCustomTools: false,
    extras: (ctx) => ({
      set_status: createSetStatusTool(ctx),
      discard_pokemon_cards: createPocketCustomTools(ctx).discard_pokemon_cards,
      award_points: createAwardPointsTool(ctx),
      end_phase: createEndPhaseTool('Signal that between-turns phase is complete.'),
    }),
  },

  main: {
    sections: [
      'INTRO', 'ROLE_FULLTURN', 'TURN_STRUCTURE_MAIN', 'WIN_CONDITIONS',
      'ZONE_LAYOUT', 'KEY_RULES', 'STATUS_CONDITIONS', 'DAMAGE',
      'TOOL_USAGE', 'PEEK_AND_SEARCH', 'DECISIONS', 'STRATEGY_PLANNING',
      'ATTACK_ENERGY_CHECK',
    ],
    coreToolFilter: 'exclude',
    coreTools: [
      ACTION_TYPES.RESOLVE_DECISION,
      ACTION_TYPES.MULLIGAN,
      ...HIDDEN_DEFAULT_TOOLS,
    ],
    addCustomTools: true,
  },

  decision: {
    sections: [
      'INTRO', 'ROLE_DECISION', 'TURN_STRUCTURE_DECISION',
      'ZONE_LAYOUT', 'STATUS_CONDITIONS', 'DAMAGE',
      'TOOL_USAGE', 'PEEK_AND_SEARCH', 'DECISIONS',
    ],
    coreToolFilter: 'exclude',
    coreTools: [
      ACTION_TYPES.END_TURN,
      ACTION_TYPES.CREATE_DECISION,
      ACTION_TYPES.MULLIGAN,
      ...HIDDEN_DEFAULT_TOOLS,
    ],
    addCustomTools: true,
  },

  planner: {
    sections: [
      'INTRO', 'ROLE_PLANNER', 'TURN_STRUCTURE_MAIN',
      'WIN_CONDITIONS', 'ZONE_LAYOUT', 'KEY_RULES',
      'STATUS_CONDITIONS', 'DAMAGE', 'STRATEGY_PLANNING',
      'ATTACK_ENERGY_CHECK',
    ],
    coreToolFilter: 'include',
    coreTools: [
      ACTION_TYPES.DECLARE_VICTORY,
      ACTION_TYPES.CONCEDE,
    ],
    addCustomTools: false,
  },

  executor: {
    sections: [
      'ROLE_EXECUTOR', 'ZONE_LAYOUT', 'TOOL_USAGE', 'PEEK_AND_SEARCH',
    ],
    coreToolFilter: 'exclude',
    coreTools: [
      ACTION_TYPES.RESOLVE_DECISION,
      ACTION_TYPES.MULLIGAN,
      ...HIDDEN_DEFAULT_TOOLS,
    ],
    addCustomTools: true,
  },
};

function filterToolSet(tools: ToolSet, filter: 'include' | 'exclude', names: string[]): ToolSet {
  const nameSet = new Set(names);
  const result: ToolSet = {};

  for (const [name, tool] of Object.entries(tools)) {
    const matches = nameSet.has(name);
    if ((filter === 'include' && matches) || (filter === 'exclude' && !matches)) {
      result[name] = tool;
    }
  }

  return result;
}

function buildToolSet(ctx: ToolContext, mode: AgentMode): ToolSet {
  const config = MODE_CONFIGS[mode];
  let tools = createDefaultTools(ctx);

  tools = filterToolSet(tools, config.coreToolFilter, config.coreTools);

  if (config.addCustomTools) {
    tools = { ...tools, ...createPocketCustomTools(ctx) };
  }

  if (config.extras) {
    tools = { ...tools, ...config.extras(ctx) };
  }

  return tools;
}

export function getAgentConfig(ctx: ToolContext, mode: AgentMode): { prompt: string; tools: ToolSet } {
  const config = MODE_CONFIGS[mode];
  return {
    prompt: buildPrompt(...config.sections),
    tools: buildToolSet(ctx, mode),
  };
}
