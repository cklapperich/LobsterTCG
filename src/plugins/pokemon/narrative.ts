import type { ReadableGameState, ReadableZone, ReadableCard, ReadableTurn } from '../../core/readable';
import { ACTION_TYPES } from '../../core/types/constants';
import { isFieldZone } from './helpers';
import { SUPERTYPES, COUNTER_IDS, NARRATIVE, FIRST_EVOLUTION_TURN, FIRST_SUPPORTER_TURN } from './constants';
import { toAIPerspective } from './zone-perspective';
import type { PlayerIndex } from '../../core/types';
import type { PokemonPluginState } from './plugin-state';

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

  // Card reference (deduplicated, full details)
  const refCards = collectUniqueCards(readable);
  if (refCards.length > 0) {
    lines.push('=== CARD REFERENCE ===');
    for (const card of refCards) {
      lines.push(...formatCardReference(card));
      lines.push('');
    }
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
  lines.push(...formatBoard(readable, aiPrefix, 'Your'));

  // Opponent's board
  lines.push('');
  lines.push('--- OPPONENT BOARD ---');
  lines.push('');
  lines.push(...formatBoard(readable, oppPrefix, 'Opponent'));

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

// ── Card Reference ───────────────────────────────────────────────

/**
 * Collect all visible unique cards for the reference section.
 * - Field zones: include top card (Pokemon) + non-Pokemon underneath (energy/tools).
 *   Skip Pokemon buried under a stack (evolved-from — their attacks are irrelevant).
 * - All other zones: include every visible card.
 * - Deduplicate by card name (already disambiguated in ReadableCard).
 */
function collectUniqueCards(readable: ReadableGameState): ReadableCard[] {
  const seen = new Map<string, ReadableCard>();

  for (const [zoneKey, zone] of Object.entries(readable.zones)) {
    const field = isFieldZone(zoneKey);

    for (let i = 0; i < zone.cards.length; i++) {
      const card = zone.cards[i];
      const isTop = field && i === zone.cards.length - 1;
      const isPokemon = card.supertype === SUPERTYPES.POKEMON;

      // Skip non-top Pokemon in field zones (evolved-from cards under the stack)
      // Exception: modifyReadableState already preserves pre-evo under BREAK,
      // so any Pokemon that survived the filter should be included.
      if (field && !isTop && isPokemon) {
        // Check if top is BREAK — if so, include this pre-evo (it survived filtering)
        const topCard = zone.cards[zone.cards.length - 1];
        const topIsBreak = (topCard.subtypes as string[] ?? []).includes('BREAK');
        if (!topIsBreak) continue;
      }

      if (!seen.has(card.name)) {
        seen.set(card.name, card);
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Format a single card's full reference entry.
 */
export function formatCardReference(card: ReadableCard): string[] {
  const lines: string[] = [];
  const supertype = card.supertype as string | undefined;

  if (supertype === SUPERTYPES.POKEMON) {
    lines.push(formatPokemonReference(card));

    // Rules text (EX, GX, V, VMAX, BREAK, LEGEND, V-UNION mechanics)
    const rules = card.rules as string[] | undefined;
    if (rules && rules.length > 0) {
      for (const rule of rules) {
        lines.push(`  ${rule}`);
      }
    }

    const attacks = card.attacks as Array<{ name: string; cost: string[]; damage: string; effect?: string }> | undefined;
    if (attacks && attacks.length > 0) {
      lines.push('  Attacks:');
      for (const atk of attacks) {
        lines.push(`    ${formatAttack(atk)}`);
      }
    }

    const abilities = card.abilities as Array<{ name: string; type: string; effect: string }> | undefined;
    if (abilities && abilities.length > 0) {
      for (const ab of abilities) {
        lines.push(`  ${formatAbility(ab)}`);
      }
    }
  } else if (supertype === SUPERTYPES.TRAINER) {
    const subtypes = card.subtypes as string[] | undefined;
    const sub = subtypes && subtypes.length > 0 ? `, ${subtypes.join('/')}` : '';
    lines.push(`${card.name} \u2014 Trainer${sub}`);

    const rules = card.rules as string[] | undefined;
    if (rules && rules.length > 0) {
      for (const rule of rules) {
        lines.push(`  ${rule}`);
      }
    }
  } else if (supertype === SUPERTYPES.ENERGY) {
    const subtypes = card.subtypes as string[] | undefined;
    const sub = subtypes && subtypes.length > 0 ? `, ${subtypes.join('/')}` : '';
    lines.push(`${card.name} \u2014 Energy${sub}`);

    const rules = card.rules as string[] | undefined;
    if (rules && rules.length > 0) {
      for (const rule of rules) {
        lines.push(`  ${rule}`);
      }
    }
  } else {
    lines.push(card.name);
  }

  return lines;
}

function formatPokemonReference(card: ReadableCard): string {
  const parts: string[] = [card.name];

  const evolveFrom = card.evolveFrom as string | undefined;
  if (evolveFrom) {
    parts.push(`evolves from ${evolveFrom}`);
  }

  const types = card.types as string[] | undefined;
  if (types && types.length > 0) {
    parts.push(types.join('/'));
  }

  const subtypes = card.subtypes as string[] | undefined;
  if (subtypes && subtypes.length > 0) {
    parts.push(subtypes.join('/'));
  }

  const hp = card.hp as number | undefined;
  if (hp) {
    parts.push(`${hp} HP`);
  }

  const retreatCost = card.retreatCost;
  if (retreatCost !== undefined && retreatCost !== null) {
    const cost = typeof retreatCost === 'number' ? retreatCost : (retreatCost as string[]).length;
    parts.push(`retreat ${cost}`);
  }

  const weaknesses = card.weaknesses as Array<{ type: string; value: string }> | undefined;
  if (weaknesses && weaknesses.length > 0) {
    parts.push(weaknesses.map(w => `weak ${w.type} ${w.value}`).join(', '));
  }

  const resistances = card.resistances as Array<{ type: string; value: string }> | undefined;
  if (resistances && resistances.length > 0) {
    parts.push(resistances.map(r => `resist ${r.type} ${r.value}`).join(', '));
  }

  return parts.join(' \u2014 ');
}

function formatAttack(attack: { name: string; cost: string[]; damage: string; effect?: string }): string {
  const cost = attack.cost.length > 0 ? `[${attack.cost.join(', ')}]` : '[Free]';
  const dmg = attack.damage ? ` -> ${attack.damage}` : '';
  const effect = attack.effect ? ` \u2014 ${attack.effect}` : '';
  return `${attack.name} ${cost}${dmg}${effect}`;
}

function formatAbility(ability: { name: string; type: string; effect: string }): string {
  return `${ability.name} (${ability.type}) \u2014 ${ability.effect}`;
}

// ── Board formatting ─────────────────────────────────────────────

function formatBoard(readable: ReadableGameState, playerPrefix: string, owner: string): string[] {
  const lines: string[] = [];
  const zones = readable.zones;

  // Field zones: active, bench_1..5
  const fieldZoneIds = ['active', 'bench_1', 'bench_2', 'bench_3', 'bench_4', 'bench_5'];

  for (const zoneId of fieldZoneIds) {
    const zoneKey = `${playerPrefix}_${zoneId}`;
    const zone = zones[zoneKey];
    if (!zone) continue;

    const bareLabel = zoneId === 'active' ? 'Active' : zoneId.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
    const label = `${owner} ${bareLabel}`;

    if (zone.count === 0) continue;

    if (zone.cards.length === 0 && zone.count > 0) {
      lines.push(`[${label}] (${zone.count} face-down card${zone.count > 1 ? 's' : ''})`);
    } else {
      lines.push(...formatFieldZoneCompact(label, zone));
    }
  }

  // Hand
  const handKey = `${playerPrefix}_hand`;
  const hand = zones[handKey];
  if (hand) {
    lines.push(formatHandLine(hand, owner));
  }

  // Count line: Deck | Discard | Prizes
  lines.push(formatCountLine(zones, playerPrefix, owner));

  // Discard contents (if non-empty and visible)
  const discardKey = `${playerPrefix}_discard`;
  const discard = zones[discardKey];
  if (discard && discard.cards.length > 0) {
    if (discard.cards.length <= NARRATIVE.DISCARD_DISPLAY_LIMIT) {
      lines.push(`  ${owner} Discard: ${condenseNames(discard.cards)}`);
    }
  }

  // Lost zone (only if non-empty)
  const lostKey = `${playerPrefix}_lost_zone`;
  const lost = zones[lostKey];
  if (lost && lost.count > 0) {
    if (lost.cards.length > 0) {
      lines.push(`${owner} Lost Zone (${lost.count}): ${condenseNames(lost.cards)}`);
    } else {
      lines.push(`${owner} Lost Zone: ${lost.count}`);
    }
  }

  // Staging (shared zone, only print once under YOUR BOARD)
  if (owner === 'Your') {
    const staging = zones['staging'];
    if (staging && staging.count > 0) {
      if (staging.cards.length > 0) {
        lines.push(`Staging: ${condenseNames(staging.cards)}`);
      } else {
        lines.push(`Staging: ${staging.count}`);
      }
    }
  }

  return lines;
}

// ── Compact field zone (instance state only, no attacks/abilities) ──

function formatFieldZoneCompact(label: string, zone: ReadableZone): string[] {
  const lines: string[] = [];
  const cards = zone.cards;
  if (cards.length === 0) return lines;

  // Top card is the Pokemon
  const pokemon = cards[cards.length - 1];
  const topIsBreak = (pokemon.subtypes as string[] ?? []).includes('BREAK');

  // Separate pre-evolution Pokemon (under BREAK) from attached cards (energy/tools)
  const preEvo: ReadableCard | undefined = topIsBreak
    ? cards.slice(0, -1).findLast(c => c.supertype === SUPERTYPES.POKEMON)
    : undefined;
  const attached = cards.slice(0, -1).filter(c =>
    c !== preEvo && (c.supertype !== SUPERTYPES.POKEMON || !topIsBreak)
  );

  lines.push(`[${label}] ${formatInstanceStats(pokemon)}`);

  if (preEvo) {
    lines.push(`  Pre-evo: ${preEvo.name} (attacks available — see CARD REFERENCE)`);
  }

  if (attached.length > 0) {
    lines.push(`  Attached: ${condenseNames(attached)}`);
  }

  const flags = pokemon.flags as string[] | undefined;
  if (flags && flags.length > 0) {
    lines.push(`  [${flags.join(', ')}]`);
  }

  return lines;
}

/**
 * Instance-specific stats line for a Pokemon on the board.
 * Only damage, status, burn/poison — card-level details are in the reference.
 */
function formatInstanceStats(card: ReadableCard): string {
  const parts: string[] = [card.name];

  const hp = card.hp as number | undefined;
  const totalDamage = card.totalDamage as number | undefined;
  if (hp) {
    parts.push(`${hp} HP before effects`);
  }
  if (totalDamage) {
    parts.push(`${totalDamage} damage`);
  }

  const status = card.status as string | undefined;
  if (status) {
    parts.push(status.toUpperCase());
  }

  const counters = card.counters as Record<string, number> | undefined;
  if (counters) {
    if (counters[COUNTER_IDS.BURN]) parts.push('BURNED');
    if (counters[COUNTER_IDS.POISON]) parts.push('POISONED');
  }

  return parts.join(' \u2014 ');
}

// ── Hand formatting ──────────────────────────────────────────────

function formatHandLine(zone: ReadableZone, owner: string): string {
  const label = `${owner} Hand`;
  if (zone.count === 0) return `${label}: 0`;

  if (zone.cards.length === 0) {
    return `${label}: ${zone.count} (hidden)`;
  }

  // Sum actual visible card count from condensed entries (each may have count > 1)
  const visibleCount = zone.cards.reduce((sum, c) => sum + ((c.count as number) ?? 1), 0);
  const hiddenCount = zone.count - visibleCount;
  const cardList = condenseNames(zone.cards);

  if (hiddenCount > 0) {
    return `${label} (${zone.count}): ${cardList}, [${hiddenCount} hidden]`;
  }
  return `${label} (${zone.count}): ${cardList}`;
}

// ── Shared helpers ───────────────────────────────────────────────

/** Condense card names for inline display. Groups duplicates: "Fire Energy x2" */
function condenseNames(cards: ReadableCard[]): string {
  const groups: { name: string; count: number }[] = [];
  for (const card of cards) {
    const cardCount = (card.count as number | undefined) ?? 1;
    const existing = groups.find(g => g.name === card.name);
    if (existing) {
      existing.count += cardCount;
    } else {
      groups.push({ name: card.name, count: cardCount });
    }
  }
  return groups.map(g => g.count > 1 ? `${g.name} x${g.count}` : g.name).join(', ');
}

function formatCountLine(zones: Record<string, ReadableZone>, prefix: string, owner: string): string {
  const deckCount = zones[`${prefix}_deck`]?.count ?? 0;
  const discardCount = zones[`${prefix}_discard`]?.count ?? 0;
  // Sum across all 6 individual prize zones
  let prizesCount = 0;
  for (let i = 1; i <= 6; i++) {
    prizesCount += zones[`${prefix}_prizes_${i}`]?.count ?? 0;
  }
  const prizesTaken = 6 - prizesCount;
  return `${owner} Deck: ${deckCount} | ${owner} Discard: ${discardCount} | ${owner} Prizes: ${prizesCount} remaining (${prizesTaken} taken)`;
}

// ── Actions formatting ───────────────────────────────────────────

function formatActions(turn: ReadableTurn): string[] {
  const lines: string[] = [];
  for (let i = 0; i < turn.actions.length; i++) {
    const a = turn.actions[i];
    lines.push(`${i + 1}. ${formatAction(a)}`);
  }
  return lines;
}

function formatAction(a: Record<string, unknown>): string {
  const type = a.type as string;
  const cardName = (a.cardName ?? a.cardNames) as string | string[] | undefined;
  const fromZone = a.fromZone as string | undefined;
  const toZone = a.toZone as string | undefined;
  const zoneId = a.zoneId as string | undefined;

  const nameStr = Array.isArray(cardName) ? cardName.join(', ') : (cardName ?? '');

  switch (type) {
    case ACTION_TYPES.MOVE_CARD:
    case ACTION_TYPES.MOVE_CARD_STACK:
      return `${type} ${nameStr}: ${fromZone} -> ${toZone}`;
    case ACTION_TYPES.DRAW:
      return `draw ${a.count} from ${zoneId ?? fromZone ?? '?'}`;
    case ACTION_TYPES.SHUFFLE:
      return `shuffle ${zoneId}`;
    case ACTION_TYPES.ADD_COUNTER:
      return `add_counter ${a.amount}x ${a.counterType} to ${nameStr}`;
    case ACTION_TYPES.REMOVE_COUNTER:
      return `remove_counter ${a.amount}x ${a.counterType} from ${nameStr}`;
    case ACTION_TYPES.SET_COUNTER:
      return `set_counter ${a.counterType}=${a.value} on ${nameStr}`;
    case ACTION_TYPES.COIN_FLIP:
      return `coin_flip x${a.count}`;
    case ACTION_TYPES.END_TURN:
      return 'end_turn';
    case ACTION_TYPES.SET_ORIENTATION:
      return `set_orientation ${nameStr} ${a.orientation}`;
    default:
      return `${type}${nameStr ? ' ' + nameStr : ''}`;
  }
}

// ── Combat notes (weakness/resistance between actives) ──────────

function formatCombatNotes(readable: ReadableGameState, aiIdx: PlayerIndex = 1): string[] {
  const lines: string[] = [];

  const myPrefix = `player${aiIdx + 1}`;
  const oppPrefix = `player${aiIdx === 0 ? 2 : 1}`;
  const myActive = getTopCard(readable.zones[`${myPrefix}_active`]);
  const oppActive = getTopCard(readable.zones[`${oppPrefix}_active`]);

  if (!myActive || !oppActive) return lines;

  const myTypes = (myActive.types as string[] | undefined) ?? [];
  const oppTypes = (oppActive.types as string[] | undefined) ?? [];

  const myWeaknesses = (myActive.weaknesses as Array<{ type: string; value: string }> | undefined) ?? [];
  const myResistances = (myActive.resistances as Array<{ type: string; value: string }> | undefined) ?? [];
  const oppWeaknesses = (oppActive.weaknesses as Array<{ type: string; value: string }> | undefined) ?? [];
  const oppResistances = (oppActive.resistances as Array<{ type: string; value: string }> | undefined) ?? [];

  // Your attacks vs opponent's active
  const oppWeakMatch = oppWeaknesses.filter(w => myTypes.includes(w.type));
  const oppResistMatch = oppResistances.filter(r => myTypes.includes(r.type));

  if (oppWeakMatch.length > 0) {
    for (const w of oppWeakMatch) {
      lines.push(`Your ${myActive.name} VS ${oppActive.name}: WEAKNESS applies: ${myActive.name} takes 2x damage from ${w.type} types such as ${oppActive.name} (unless an effect nullifies it`);
    }
  }
  if (oppResistMatch.length > 0) {
    for (const r of oppResistMatch) {
      lines.push(`Your ${myActive.name} VS ${oppActive.name}: RESISTANCE applies: ${myActive.name} takes -30 damage from ${r.type} types such as ${oppActive.name} (unless an effect nullifies it`);
    }
  }

  // Opponent's attacks vs your active
  const myWeakMatch = myWeaknesses.filter(w => oppTypes.includes(w.type));
  const myResistMatch = myResistances.filter(r => oppTypes.includes(r.type));

  if (myWeakMatch.length > 0) {
    for (const w of myWeakMatch) {
      lines.push(`Your ${myActive.name} VS ${oppActive.name}: WEAKNESS applies: ${oppActive.name} takes 2x damage from ${w.type} types such as your ${myActive.name} (unless an effect nullifies it`);
    }
  }
  if (myResistMatch.length > 0) {
    for (const r of myResistMatch) {
      lines.push(`Your ${myActive.name} VS ${oppActive.name}: RESISTANCE applies: ${oppActive.name} takes -30 damage from ${r.type} types such as your ${myActive.name} (unless an effect nullifies it`);
    }
  }

  if (lines.length === 0) {
    lines.push(`No weakness or resistance between ${myActive.name} (${myTypes.join('/')}) and ${oppActive.name} (${oppTypes.join('/')})`);
  }

  return lines;
}

function getTopCard(zone: ReadableZone | undefined): ReadableCard | undefined {
  if (!zone || zone.cards.length === 0) return undefined;
  return zone.cards[zone.cards.length - 1];
}

// ── Stadium formatting ───────────────────────────────────────────

function formatStadium(zones: Record<string, ReadableZone>): string[] {
  const lines: string[] = [];
  const stadium = zones['stadium'];
  if (stadium && stadium.count > 0) {
    for (const card of stadium.cards) {
      lines.push(card.name);
    }
  }
  return lines;
}

// ── Zone key reference ──────────────────────────────────────────

function formatZoneList(zones: Record<string, ReadableZone>, aiIdx: PlayerIndex): string[] {
  const lines: string[] = [];
  const yourKeys: string[] = [];
  const opponentKeys: string[] = [];
  const sharedKeys: string[] = [];

  for (const zoneKey of Object.keys(zones)) {
    const perspective = toAIPerspective(zoneKey, aiIdx);
    if (perspective.startsWith('your_')) {
      yourKeys.push(perspective);
    } else if (perspective.startsWith('opponent_')) {
      opponentKeys.push(perspective);
    } else {
      sharedKeys.push(perspective);
    }
  }

  lines.push('=== YOUR ZONES ===');
  lines.push(yourKeys.join(', '));
  lines.push('=== OPPONENT ZONES ===');
  lines.push(opponentKeys.join(', '));
  if (sharedKeys.length > 0) {
    lines.push('=== SHARED ZONES ===');
    lines.push(sharedKeys.join(', '));
  }

  return lines;
}
