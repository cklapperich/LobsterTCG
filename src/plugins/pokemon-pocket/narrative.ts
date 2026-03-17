/**
 * narrative.ts — Pokemon Pocket AI context formatter.
 *
 * Compresses ReadableGameState into compact text for LLM consumption.
 * Pocket-specific: energy counters, point tracking, simplified weakness (+20).
 *
 * Most formatting logic lives in ../pokemon/narrative-helpers.ts (shared).
 * This file handles Pocket-specific sections: points, energy zone display,
 * and energy counter formatting.
 */
import type { ReadableGameState, ReadableCard } from '../../core/readable';
import type { PlayerIndex } from '../../core/types/card';
import { SUPERTYPES, NARRATIVE, FIRST_EVOLUTION_TURN, POINTS_TO_WIN, ENERGY_COUNTER_TYPES, COUNTER_IDS } from './constants';
import { isFieldZone } from './helpers';
import type { PocketPluginState } from './plugin-state';
import {
  type NarrativeConfig,
  collectUniqueCards,
  formatCardReference as _formatCardReference,
  formatBoard,
  formatKOAlerts,
  formatCombatNotes,
  formatActions,
  formatZoneList,
} from '../pokemon/narrative-helpers';

function formatEnergyCounters(card: ReadableCard): string {
  const counters = card.counters as Record<string, number> | undefined;
  if (!counters) return 'none';

  const energyParts: string[] = [];
  for (const [type, counterId] of Object.entries(ENERGY_COUNTER_TYPES)) {
    const count = counters[counterId];
    if (count && count > 0) {
      energyParts.push(`${count}x ${type}`);
    }
  }

  return energyParts.length > 0 ? energyParts.join(', ') : 'none';
}

const POCKET_CONFIG: NarrativeConfig = {
  supertypes: SUPERTYPES,
  isFieldZone,
  counterIds: COUNTER_IDS,
  discardDisplayLimit: NARRATIVE.DISCARD_DISPLAY_LIMIT,
  formatEnergyCounters,
  inlineCardDetails: true,
};

export function formatNarrativeState(readable: ReadableGameState): string {
  const lines: string[] = [];
  const aiIdx: PlayerIndex = readable.viewer ?? 1;
  const aiPrefix = `player${aiIdx + 1}`;
  const oppPrefix = `player${aiIdx === 0 ? 2 : 1}`;

  // Card reference (deduplicated, full details) — skipped in inline mode
  if (!POCKET_CONFIG.inlineCardDetails) {
    const refCards = collectUniqueCards(readable, POCKET_CONFIG);
    if (refCards.length > 0) {
      lines.push('=== CARD REFERENCE ===');
      for (const card of refCards) {
        lines.push(..._formatCardReference(card, POCKET_CONFIG));
        lines.push('');
      }
    }
  }

  // Header
  lines.push('=== GAME STATE ===');
  const turnRestrictions: string[] = [];
  if (readable.turnNumber <= 1) {
    turnRestrictions.push('NO ATTACKING (first turn)');
  }
  if (readable.turnNumber <= FIRST_EVOLUTION_TURN) {
    turnRestrictions.push('NO EVOLUTION');
  }
  const restrictionStr = turnRestrictions.length > 0 ? ` | ${turnRestrictions.join(', ')}` : '';
  lines.push(`Turn ${readable.turnNumber} | Player ${readable.activePlayer + 1}'s turn | Phase: ${readable.phase}${restrictionStr}`);

  // Points display
  const ps = readable.pluginState as Partial<PocketPluginState> | undefined;
  if (ps?.points) {
    const myPoints = ps.points[aiIdx];
    const oppPoints = ps.points[aiIdx === 0 ? 1 : 0];
    lines.push(`Points: You ${myPoints}/${POINTS_TO_WIN} | Opponent ${oppPoints}/${POINTS_TO_WIN}`);
  }

  // Energy zone display
  if (ps?.energyZone) {
    const myZone = ps.energyZone[aiIdx];
    const current = myZone?.current ?? null;
    const next = myZone?.next ?? null;
    const currentStr = current ? current : 'empty';
    const nextStr = next ? next : 'none';
    lines.push(`Energy Zone: current=${currentStr} | next=${nextStr}`);
  }

  if (readable.pendingDecision) {
    const d = readable.pendingDecision;
    lines.push(`PENDING DECISION: "${d.message ?? 'Action needed'}" (targeting Player ${d.targetPlayer + 1})`);
  }

  if (readable.result) {
    lines.push(`GAME RESULT: ${JSON.stringify(readable.result)}`);
  }

  // AI's board
  lines.push('');
  lines.push('--- YOUR BOARD ---');
  lines.push('');
  lines.push(...formatBoard(readable, aiPrefix, 'Your', POCKET_CONFIG));

  // Opponent's board
  lines.push('');
  lines.push('--- OPPONENT BOARD ---');
  lines.push('');
  lines.push(...formatBoard(readable, oppPrefix, 'Opponent', POCKET_CONFIG));

  // KO alerts
  const koLines = formatKOAlerts(readable, aiIdx, POCKET_CONFIG);
  if (koLines.length > 0) {
    lines.push('');
    lines.push('--- KO ALERTS ---');
    lines.push(...koLines);
  }

  // Combat notes (weakness only — no resistance in Pocket)
  const combatLines = formatCombatNotes(readable, aiIdx);
  if (combatLines.length > 0) {
    lines.push('');
    lines.push('--- COMBAT NOTES ---');
    lines.push(...combatLines);
  }

  // Actions this turn
  if (readable.currentTurn.actions.length > 0) {
    lines.push('');
    lines.push('--- ACTIONS THIS TURN ---');
    lines.push(...formatActions(readable.currentTurn));
  }

  // Log (last 15)
  if (readable.log.length > 0) {
    lines.push('');
    lines.push('--- LOG (recent) ---');
    const recent = readable.log.slice(-NARRATIVE.RECENT_LOG_LIMIT);
    for (const entry of recent) {
      lines.push(entry);
    }
  }

  // Zone key reference
  lines.push('');
  lines.push(...formatZoneList(readable.zones, aiIdx));

  return lines.join('\n');
}

/** Pre-bound formatCardReference for Pocket config. */
export function formatCardReference(card: ReadableCard): string[] {
  return _formatCardReference(card, POCKET_CONFIG);
}
