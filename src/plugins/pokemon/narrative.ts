import type { ReadableGameState, ReadableZone, ReadableCard, ReadableTurn } from '../../core/readable';
import { isFieldZone } from './helpers';

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
  lines.push(`Turn ${readable.turnNumber} | Player ${readable.activePlayer + 1}'s turn | Phase: ${readable.phase}`);

  if (readable.pendingDecision) {
    const d = readable.pendingDecision;
    lines.push(`PENDING DECISION: "${d.message ?? 'Action needed'}" (targeting Player ${d.targetPlayer + 1})`);
  }

  if (readable.result) {
    lines.push(`GAME RESULT: ${JSON.stringify(readable.result)}`);
  }

  // Player 1 board (AI = viewer). No player number in label to avoid
  // confusion with zone key prefixes (player1_, player2_).
  lines.push('');
  lines.push('--- YOUR BOARD ---');
  lines.push('');
  lines.push(...formatBoard(readable, 'player2'));

  // Player 0 board (opponent)
  lines.push('');
  lines.push('--- OPPONENT BOARD ---');
  lines.push('');
  lines.push(...formatBoard(readable, 'player1'));

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
    const recent = readable.log.slice(-15);
    for (const entry of recent) {
      lines.push(entry);
    }
  }

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
      const isPokemon = card.supertype === 'Pokemon';

      // Skip non-top Pokemon in field zones (evolved-from cards under the stack)
      if (field && !isTop && isPokemon) continue;

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
function formatCardReference(card: ReadableCard): string[] {
  const lines: string[] = [];
  const supertype = card.supertype as string | undefined;

  if (supertype === 'Pokemon') {
    lines.push(formatPokemonReference(card));

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
  } else if (supertype === 'Trainer') {
    const subtypes = card.subtypes as string[] | undefined;
    const sub = subtypes && subtypes.length > 0 ? `, ${subtypes.join('/')}` : '';
    lines.push(`${card.name} \u2014 Trainer${sub}`);

    const rules = card.rules as string[] | undefined;
    if (rules && rules.length > 0) {
      for (const rule of rules) {
        lines.push(`  ${rule}`);
      }
    }
  } else if (supertype === 'Energy') {
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

function formatBoard(readable: ReadableGameState, playerPrefix: string): string[] {
  const lines: string[] = [];
  const zones = readable.zones;

  // Field zones: active, bench_1..5
  const fieldZoneIds = ['active', 'bench_1', 'bench_2', 'bench_3', 'bench_4', 'bench_5'];

  for (const zoneId of fieldZoneIds) {
    const zoneKey = `${playerPrefix}_${zoneId}`;
    const zone = zones[zoneKey];
    if (!zone) continue;

    const label = zoneId === 'active' ? 'Active' : zoneId.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

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
    lines.push(formatHandLine(hand));
  }

  // Count line: Deck | Discard | Prizes
  lines.push(formatCountLine(zones, playerPrefix));

  // Discard contents (if non-empty and visible)
  const discardKey = `${playerPrefix}_discard`;
  const discard = zones[discardKey];
  if (discard && discard.cards.length > 0) {
    if (discard.cards.length <= 10) {
      lines.push(`  Discard: ${condenseNames(discard.cards)}`);
    }
  }

  // Lost zone (only if non-empty)
  const lostKey = `${playerPrefix}_lost_zone`;
  const lost = zones[lostKey];
  if (lost && lost.count > 0) {
    if (lost.cards.length > 0) {
      lines.push(`Lost Zone (${lost.count}): ${condenseNames(lost.cards)}`);
    } else {
      lines.push(`Lost Zone: ${lost.count}`);
    }
  }

  // Staging (only if non-empty)
  const stagingKey = `${playerPrefix}_staging`;
  const staging = zones[stagingKey];
  if (staging && staging.count > 0) {
    if (staging.cards.length > 0) {
      lines.push(`Staging: ${condenseNames(staging.cards)}`);
    } else {
      lines.push(`Staging: ${staging.count}`);
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
  const attached = cards.slice(0, -1);

  lines.push(`[${label}] ${formatInstanceStats(pokemon)}`);

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
  if (totalDamage && hp) {
    parts.push(`${totalDamage}/${hp} HP`);
  }

  const status = card.status as string | undefined;
  if (status) {
    parts.push(status.toUpperCase());
  }

  const counters = card.counters as Record<string, number> | undefined;
  if (counters) {
    if (counters['burn']) parts.push('BURNED');
    if (counters['poison']) parts.push('POISONED');
  }

  return parts.join(' \u2014 ');
}

// ── Hand formatting ──────────────────────────────────────────────

function formatHandLine(zone: ReadableZone): string {
  if (zone.count === 0) return 'Hand: 0';

  if (zone.cards.length === 0) {
    return `Hand: ${zone.count} (hidden)`;
  }

  // Sum actual visible card count from condensed entries (each may have count > 1)
  const visibleCount = zone.cards.reduce((sum, c) => sum + ((c.count as number) ?? 1), 0);
  const hiddenCount = zone.count - visibleCount;
  const cardList = condenseNames(zone.cards);

  if (hiddenCount > 0) {
    return `Hand (${zone.count}): ${cardList}, [${hiddenCount} hidden]`;
  }
  return `Hand (${zone.count}): ${cardList}`;
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

function formatCountLine(zones: Record<string, ReadableZone>, prefix: string): string {
  const deckCount = zones[`${prefix}_deck`]?.count ?? 0;
  const discardCount = zones[`${prefix}_discard`]?.count ?? 0;
  const prizesCount = zones[`${prefix}_prizes`]?.count ?? 0;
  return `Deck: ${deckCount} | Discard: ${discardCount} | Prizes: ${prizesCount}`;
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
    case 'move_card':
    case 'move_card_stack':
      return `${type} ${nameStr}: ${fromZone} -> ${toZone}`;
    case 'draw':
      return `draw ${a.count} from ${zoneId ?? fromZone ?? '?'}`;
    case 'shuffle':
      return `shuffle ${zoneId}`;
    case 'add_counter':
      return `add_counter ${a.amount}x ${a.counterType} to ${nameStr}`;
    case 'remove_counter':
      return `remove_counter ${a.amount}x ${a.counterType} from ${nameStr}`;
    case 'set_counter':
      return `set_counter ${a.counterType}=${a.value} on ${nameStr}`;
    case 'coin_flip':
      return `coin_flip x${a.count}`;
    case 'end_turn':
      return 'end_turn';
    case 'set_orientation':
      return `set_orientation ${nameStr} ${a.orientation}`;
    default:
      return `${type}${nameStr ? ' ' + nameStr : ''}`;
  }
}

// ── Stadium formatting ───────────────────────────────────────────

function formatStadium(zones: Record<string, ReadableZone>): string[] {
  const lines: string[] = [];
  for (const [key, zone] of Object.entries(zones)) {
    if (!key.endsWith('_stadium')) continue;
    if (zone.count === 0) continue;

    for (const card of zone.cards) {
      lines.push(card.name);
    }
  }
  return lines;
}
