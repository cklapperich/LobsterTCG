/**
 * Declarative agent configuration for each AI mode.
 *
 * Colocates prompt sections AND tool filter rules so adding or changing
 * a mode is a single edit in this file. Tool factory implementations
 * live in tools.ts; this file only *lists* what to include/exclude.
 *
 * Mirrors the buildPrompt() pattern:
 *   buildPrompt(...sections)  → composes prompt text from section names
 *   buildToolList(ctx, mode)  → composes a tool set from declarative config
 */
import sectionsRaw from './prompt-sections.md?raw';
import { ACTION_TYPES } from '../../core';
import { createDefaultTools, type RunnableTool, type ToolContext } from '../../core/ai-tools';
import {
  createPokemonCustomTools,
  createSetStatusTool,
  createEndPhaseTool,
  HIDDEN_DEFAULT_TOOLS,
} from './tools';

// ── Prompt Section Parser ────────────────────────────────────────

/** Parse ## @SECTION_NAME delimited markdown into a Record<string, string> */
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

/** Compose a prompt from section names. */
export function buildPrompt(...keys: string[]): string {
  return keys.map(k => {
    const s = SECTIONS[k];
    if (!s) throw new Error(`Unknown prompt section: ${k}`);
    return s.trim();
  }).join('\n\n');
}

// ── Types ────────────────────────────────────────────────────────

export type AgentMode = 'setup' | 'startOfTurn' | 'main' | 'decision';

interface ModeConfig {
  /** Prompt section keys composed via buildPrompt(). */
  sections: string[];
  /**
   * 'include' — only keep core tools whose names are in `coreTools`.
   * 'exclude' — keep all core tools EXCEPT those in `coreTools`.
   */
  coreToolFilter: 'include' | 'exclude';
  /** Core tool names to include or exclude (depends on coreToolFilter). */
  coreTools: string[];
  /** Whether to add all Pokemon-specific custom tools (attacks, retreat, etc.). */
  addCustomTools: boolean;
  /** Optional extra tools specific to this mode (e.g. set_status, end_phase). */
  extras?: (ctx: ToolContext) => RunnableTool[];
}
// ── Declarative Mode Configs ─────────────────────────────────────

const MODE_CONFIGS: Record<AgentMode, ModeConfig> = {
  setup: {
    sections: [
      'INTRO', 'ROLE_SETUP', 'TURN_STRUCTURE_SETUP',
      'ZONE_LAYOUT', 'KEY_RULES',
      'TOOL_USAGE', 'DECISIONS', 'ERROR_CORRECTION', 'STRATEGY_PLANNING',
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
    extras: (ctx) => {
      // end_phase alias — prompt-sections.md references it
      const tools = createDefaultTools(ctx);
      const endTurnTool = tools.find(t => t.name === ACTION_TYPES.END_TURN);
      if (endTurnTool) {
        return [{ ...endTurnTool, name: 'end_phase', description: 'End the setup phase' }];
      }
      return [];
    },
  },

  startOfTurn: {
    sections: [
      'INTRO', 'ROLE_CHECKUP', 'TURN_STRUCTURE_CHECKUP', 'WIN_CONDITIONS',
      'ZONE_LAYOUT', 'KEY_RULES', 'STATUS_CONDITIONS', 'DAMAGE',
      'TOOL_USAGE', 'DECISIONS', 'ERROR_CORRECTION',
    ],
    coreToolFilter: 'include',
    coreTools: [
      ACTION_TYPES.ADD_COUNTER,
      ACTION_TYPES.REMOVE_COUNTER,
      ACTION_TYPES.SET_COUNTER,
      ACTION_TYPES.COIN_FLIP,
      ACTION_TYPES.DRAW,
      ACTION_TYPES.SWAP_CARD_STACKS,
      ACTION_TYPES.CONCEDE,
    ],
    addCustomTools: false,
    extras: (ctx) => [
      createSetStatusTool(ctx),
      createEndPhaseTool('Signal that start-of-turn phase is complete.'),
    ],
  },

  main: {
    sections: [
      'INTRO', 'ROLE_FULLTURN', 'TURN_STRUCTURE_MAIN', 'WIN_CONDITIONS',
      'ZONE_LAYOUT', 'KEY_RULES', 'STATUS_CONDITIONS', 'DAMAGE',
      'TOOL_USAGE', 'PEEK_AND_SEARCH', 'DECISIONS', 'ERROR_CORRECTION', 'STRATEGY_PLANNING',
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
      'TOOL_USAGE', 'PEEK_AND_SEARCH', 'DECISIONS', 'ERROR_CORRECTION',
    ],
    coreToolFilter: 'exclude',
    coreTools: [
      ACTION_TYPES.END_TURN,
      ACTION_TYPES.CREATE_DECISION,
      ACTION_TYPES.SEARCH_ZONE,
      ACTION_TYPES.MULLIGAN,
      ...HIDDEN_DEFAULT_TOOLS,
    ],
    addCustomTools: true,
  },
};

// ── Tool List Builder ────────────────────────────────────────────

/** Assemble the tool set for a given mode from its declarative config. */
function buildToolList(ctx: ToolContext, mode: AgentMode): RunnableTool[] {
  const config = MODE_CONFIGS[mode];
  let tools = createDefaultTools(ctx);

  if (config.coreToolFilter === 'include') {
    const allowed = new Set(config.coreTools);
    tools = tools.filter(t => allowed.has(t.name));
  } else {
    const blocked = new Set(config.coreTools);
    tools = tools.filter(t => !blocked.has(t.name));
  }

  if (config.addCustomTools) {
    tools.push(...createPokemonCustomTools(ctx));
  }

  if (config.extras) {
    tools.push(...config.extras(ctx));
  }

  return tools;
}

// ── Public API ───────────────────────────────────────────────────

/** Single entry point: returns prompt + tools for a given agent mode. */
export function getAgentConfig(ctx: ToolContext, mode: AgentMode): { prompt: string; tools: RunnableTool[] } {
  const config = MODE_CONFIGS[mode];
  return {
    prompt: buildPrompt(...config.sections),
    tools: buildToolList(ctx, mode),
  };
}
