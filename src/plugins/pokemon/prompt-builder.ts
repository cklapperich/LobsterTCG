import sectionsRaw from './prompt-sections.md?raw';

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

/** Compose a prompt from section names */
export function buildPrompt(...keys: string[]): string {
  return keys.map(k => {
    const s = SECTIONS[k];
    if (!s) throw new Error(`Unknown prompt section: ${k}`);
    return s.trim();
  }).join('\n\n');
}

// Pre-built prompts for each agent role
export const PROMPT_SETUP = buildPrompt('INTRO', 'ROLE_SETUP');

export const PROMPT_START_OF_TURN = buildPrompt(
  'INTRO', 'ROLE_START_OF_TURN', 'TOOL_USAGE',
  'KEY_RULES', 'STATUS_CONDITIONS', 'POKEMON_CHECKUP', 'DAMAGE'
);

export const PROMPT_PLANNER = buildPrompt(
  'INTRO', 'ROLE_PLANNER', 'TURN_STRUCTURE', 'WIN_CONDITIONS',
  'ZONE_LAYOUT', 'KEY_RULES', 'STATUS_CONDITIONS',
  'DAMAGE', 'STRATEGY', 'STRATEGY_PLANNING'
);

export const PROMPT_EXECUTOR = buildPrompt(
  'INTRO', 'ROLE_EXECUTOR', 'ZONE_LAYOUT',
  'KEY_RULES', 'STATUS_CONDITIONS', 'DAMAGE', 'STRATEGY',
  'TOOL_USAGE', 'DECISIONS'
);

export const PROMPT_FULL_TURN = buildPrompt(
  'INTRO', 'TURN_STRUCTURE', 'WIN_CONDITIONS', 'ZONE_LAYOUT',
  'KEY_RULES', 'STATUS_CONDITIONS', 'POKEMON_CHECKUP', 'DAMAGE',
  'STRATEGY', 'TOOL_USAGE', 'DECISIONS', 'STRATEGY_PLANNING'
);

export const PROMPT_AUTONOMOUS = buildPrompt(
  'INTRO', 'ROLE_AUTONOMOUS', 'TURN_STRUCTURE', 'WIN_CONDITIONS',
  'ZONE_LAYOUT', 'KEY_RULES', 'STATUS_CONDITIONS', 'DAMAGE',
  'STRATEGY', 'TOOL_USAGE','DECISIONS',  'KINDNESS','OPPONENT_MISTAKES', 'STRATEGY_PLANNING'
);
