/**
 * narrative.ts — Pokemon-specific AI context formatter.
 *
 * Exists because the raw GameState is too verbose and too machine-structured
 * for an LLM to reason over efficiently. This file's job is to compress a
 * ReadableGameState into the tightest human-readable text that still gives the
 * AI everything it needs to make good decisions.
 *
 * Most formatting logic lives in ./narrative-helpers.ts (shared with Pocket).
 * This file handles Pokemon-specific sections: deck strategy, GX/VSTAR markers,
 * deck contents, stadium, and BREAK pre-evolution display.
 */
import type { ReadableGameState, ReadableCard } from '../../core/readable';
import type { PlayerIndex } from '../../core/types/card';
import { SUPERTYPES, COUNTER_IDS, NARRATIVE, FIRST_EVOLUTION_TURN, FIRST_SUPPORTER_TURN } from './constants';
import { isFieldZone } from './helpers';
import type { PokemonPluginState } from './plugin-state';
import {
  type NarrativeConfig,
  collectUniqueCards,
  formatCardReference as _formatCardReference,
  formatBoard,
  formatKOAlerts,
  formatCombatNotes,
  formatStadium,
  formatActions,
  formatZoneList,
  condenseNames,
} from './narrative-helpers';

const POKEMON_CONFIG: NarrativeConfig = {
  supertypes: SUPERTYPES,
  isFieldZone,
  counterIds: COUNTER_IDS,
  discardDisplayLimit: NARRATIVE.DISCARD_DISPLAY_LIMIT,
  handleBreak: true,
  inlineCardDetails: true,
};

/**
 * Convert a ReadableGameState into a compact narrative text format for AI consumption.
 *
 * Structure:
 * 1. CARD REFERENCE — full details for every visible unique card, printed once
 * 2. GAME STATE header — turn, phase, pending decision
 * 3. YOUR BOARD / OPPONENT BOARD — compact layout (names + instance state only)
 * 4. STADIUM, ACTIONS, LOG
 */
export function formatNarrativeState(readable: ReadableGameState): string {
  const lines: string[] = [];
  const aiIdx: PlayerIndex = readable.viewer ?? 1;
  const aiPrefix = `player${aiIdx + 1}`;
  const oppPrefix = `player${aiIdx === 0 ? 2 : 1}`;

  // Card reference (deduplicated, full details) — skipped in inline mode
  if (!POKEMON_CONFIG.inlineCardDetails) {
    const refCards = collectUniqueCards(readable, POKEMON_CONFIG);
    if (refCards.length > 0) {
      lines.push('=== CARD REFERENCE ===');
      for (const card of refCards) {
        lines.push(..._formatCardReference(card, POKEMON_CONFIG));
        lines.push('');
      }
    }
  }

  // Deck strategy
  if (readable.deckStrategy) {
    lines.push('=== YOUR DECK STRATEGY ===');
    lines.push(readable.deckStrategy);
    lines.push('');
  }

  // Header
  lines.push('=== GAME STATE ===');
  const turnRestrictions: string[] = [];
  if (readable.turnNumber <= FIRST_SUPPORTER_TURN) {
    turnRestrictions.push('NO SUPPORTERS');
    turnRestrictions.push('NO ATTACKING');
  }
  if (readable.turnNumber <= FIRST_EVOLUTION_TURN) {
    turnRestrictions.push('NO EVOLUTION');
  }
  const restrictionStr = turnRestrictions.length > 0 ? ` | ${turnRestrictions.join(', ')}` : '';
  lines.push(`Turn ${readable.turnNumber} | Player ${readable.activePlayer + 1}'s turn | Phase: ${readable.phase}${restrictionStr}`);

  // GX / VSTAR marker status
  const ps = readable.pluginState as Partial<PokemonPluginState> | undefined;
  if (ps?.gxUsed || ps?.vstarUsed) {
    const gx = ps.gxUsed ?? [false, false];
    const vstar = ps.vstarUsed ?? [false, false];
    const myGX = gx[aiIdx] ? 'Used' : 'Available';
    const myVSTAR = vstar[aiIdx] ? 'Used' : 'Available';
    const oppGX = gx[aiIdx === 0 ? 1 : 0] ? 'Used' : 'Available';
    const oppVSTAR = vstar[aiIdx === 0 ? 1 : 0] ? 'Used' : 'Available';
    lines.push(`GX: ${myGX} | VSTAR: ${myVSTAR} | Opponent GX: ${oppGX} | Opponent VSTAR: ${oppVSTAR}`);
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
  lines.push(...formatBoard(readable, aiPrefix, 'Your', POKEMON_CONFIG, {
    showLostZone: true,
  }));

  // AI's deck contents (just names)
  const deckKey = `${aiPrefix}_deck`;
  const deck = readable.zones[deckKey];
  if (deck && deck.cards.length > 0) {
    lines.push('');
    lines.push(`--- YOUR DECK (${deck.count} cards) ---`);
    lines.push(condenseNames(deck.cards));
  }

  // Opponent's board
  lines.push('');
  lines.push('--- OPPONENT BOARD ---');
  lines.push('');
  lines.push(...formatBoard(readable, oppPrefix, 'Opponent', POKEMON_CONFIG, {
    showLostZone: true,
  }));

  // KO alerts
  const koLines = formatKOAlerts(readable, aiIdx, POKEMON_CONFIG);
  if (koLines.length > 0) {
    lines.push('');
    lines.push('--- KO ALERTS ---');
    lines.push(...koLines);
  }

  // Combat notes (weakness/resistance matchup between actives)
  const combatLines = formatCombatNotes(readable, aiIdx);
  if (combatLines.length > 0) {
    lines.push('');
    lines.push('--- COMBAT NOTES ---');
    lines.push(...combatLines);
  }

  // Stadium
  const stadiumLines = formatStadium(readable.zones);
  if (stadiumLines.length > 0) {
    lines.push('');
    lines.push('--- STADIUM ---');
    lines.push(...stadiumLines);
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

  // Zone key reference (perspectivized)
  lines.push('');
  lines.push(...formatZoneList(readable.zones, aiIdx));

  return lines.join('\n');
}

/** Pre-bound formatCardReference for Pokemon config. */
export function formatCardReference(card: ReadableCard): string[] {
  return _formatCardReference(card, POKEMON_CONFIG);
}
