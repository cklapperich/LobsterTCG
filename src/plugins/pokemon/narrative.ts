import type { ReadableGameState, ReadableZone, ReadableCard, ReadableTurn } from '../../core/readable';
import { isFieldZone } from './helpers';

/**
 * Convert a ReadableGameState into a compact narrative text format for AI consumption.
 * Reduces token usage ~60% vs JSON.stringify while preserving all information
 * the AI needs to make decisions and call tools.
 */
export function formatNarrativeState(readable: ReadableGameState): string {
  const lines: string[] = [];

  // Header
  lines.push('=== GAME STATE ===');
  lines.push(`Turn ${readable.turnNumber} | Player ${readable.activePlayer}'s turn | Phase: ${readable.phase}`);

  if (readable.pendingDecision) {
    const d = readable.pendingDecision;
    lines.push(`PENDING DECISION: "${d.message ?? 'Action needed'}" (targeting Player ${d.targetPlayer})`);
  }

  if (readable.result) {
    lines.push(`GAME RESULT: ${JSON.stringify(readable.result)}`);
  }

  // Player 1 board (AI = viewer)
  lines.push('');
  lines.push('--- YOUR BOARD (Player 1) ---');
  lines.push('');
  lines.push(...formatBoard(readable, 'player1', true));

  // Player 0 board (opponent)
  lines.push('');
  lines.push('--- OPPONENT BOARD (Player 0) ---');
  lines.push('');
  lines.push(...formatBoard(readable, 'player0', false));

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

// ── Board formatting ─────────────────────────────────────────────

function formatBoard(readable: ReadableGameState, playerPrefix: string, isViewer: boolean): string[] {
  const lines: string[] = [];
  const zones = readable.zones;

  // Field zones: active, bench_1..5
  const fieldZoneIds = ['active', 'bench_1', 'bench_2', 'bench_3', 'bench_4', 'bench_5'];

  for (const zoneId of fieldZoneIds) {
    const zoneKey = `${playerPrefix}_${zoneId}`;
    const zone = zones[zoneKey];
    if (!zone) continue;

    const label = zoneId === 'active' ? 'Active' : zoneId.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

    if (zone.count === 0) continue; // Skip empty field zones

    if (zone.cards.length === 0 && zone.count > 0) {
      // Cards exist but are hidden (setup phase)
      lines.push(`[${label}] (${zone.count} face-down card${zone.count > 1 ? 's' : ''})`);
    } else {
      lines.push(...formatFieldZone(label, zone));
    }
  }

  // Hand
  const handKey = `${playerPrefix}_hand`;
  const hand = zones[handKey];
  if (hand) {
    lines.push(formatHandInline(hand, isViewer));
  }

  // Count line: Deck | Discard | Prizes
  lines.push(formatCountLine(zones, playerPrefix));

  // Discard contents (if non-empty and viewer or visible)
  const discardKey = `${playerPrefix}_discard`;
  const discard = zones[discardKey];
  if (discard && discard.cards.length > 0) {
    if (discard.cards.length <= 10) {
      const cardList = condenseInline(discard.cards);
      lines.push(`  Discard: ${cardList}`);
    }
  }

  // Lost zone (only if non-empty)
  const lostKey = `${playerPrefix}_lost_zone`;
  const lost = zones[lostKey];
  if (lost && lost.count > 0) {
    if (lost.cards.length > 0) {
      const cardList = condenseInline(lost.cards);
      lines.push(`Lost Zone (${lost.count}): ${cardList}`);
    } else {
      lines.push(`Lost Zone: ${lost.count}`);
    }
  }

  // Staging (only if non-empty)
  const stagingKey = `${playerPrefix}_staging`;
  const staging = zones[stagingKey];
  if (staging && staging.count > 0) {
    if (staging.cards.length > 0) {
      const cardList = condenseInline(staging.cards);
      lines.push(`Staging: ${cardList}`);
    } else {
      lines.push(`Staging: ${staging.count}`);
    }
  }

  return lines;
}

// ── Field zone formatting ────────────────────────────────────────

function formatFieldZone(label: string, zone: ReadableZone): string[] {
  const lines: string[] = [];
  const cards = zone.cards;
  if (cards.length === 0) return lines;

  // Top card is the Pokemon (last in array = visual top)
  const pokemon = cards[cards.length - 1];
  const attached = cards.slice(0, -1);

  lines.push(`[${label}] ${formatPokemonStats(pokemon)}`);

  // Attached cards
  if (attached.length > 0) {
    const condensed = condenseInline(attached);
    lines.push(`  Attached: ${condensed}`);
  }

  // Attacks
  const attacks = pokemon.attacks as Array<{ name: string; cost: string[]; damage: string; effect?: string }> | undefined;
  if (attacks && attacks.length > 0) {
    lines.push('  Attacks:');
    for (const atk of attacks) {
      lines.push(`    ${formatAttack(atk)}`);
    }
  }

  // Abilities
  const abilities = pokemon.abilities as Array<{ name: string; type: string; effect: string }> | undefined;
  if (abilities && abilities.length > 0) {
    for (const ab of abilities) {
      lines.push(`  ${formatAbility(ab)}`);
    }
  }

  // Rules text (for trainers in stadium, etc.)
  const rules = pokemon.rules as string[] | undefined;
  if (rules && rules.length > 0) {
    for (const rule of rules) {
      lines.push(`  ${rule}`);
    }
  }

  // Flags
  const flags = pokemon.flags as string[] | undefined;
  if (flags && flags.length > 0) {
    lines.push(`  [${flags.join(', ')}]`);
  }

  return lines;
}

function formatPokemonStats(card: ReadableCard): string {
  const parts: string[] = [card.name];

  // Subtypes for evolutions
  const subtypes = card.subtypes as string[] | undefined;
  const evolveFrom = card.evolveFrom as string | undefined;
  if (evolveFrom) {
    parts.push(`evolves from ${evolveFrom}`);
  }

  // Type
  const types = card.types as string[] | undefined;
  if (types && types.length > 0) {
    parts.push(types.join('/'));
  }

  // HP
  const hp = card.hp as number | undefined;
  if (hp) {
    parts.push(`${hp} HP`);
  }

  // Damage
  const totalDamage = card.totalDamage as number | undefined;
  if (totalDamage && hp) {
    parts.push(`${totalDamage}/${hp} damage`);
  }

  // Status
  const status = card.status as string | undefined;
  if (status) {
    parts.push(status.toUpperCase());
  }

  // Burn/Poison counters
  const counters = card.counters as Record<string, number> | undefined;
  if (counters) {
    if (counters['burn']) parts.push('BURNED');
    if (counters['poison']) parts.push('POISONED');
  }

  // Retreat cost
  const retreatCost = card.retreatCost;
  if (retreatCost !== undefined && retreatCost !== null) {
    const cost = typeof retreatCost === 'number' ? retreatCost : (retreatCost as string[]).length;
    parts.push(`retreat ${cost}`);
  }

  // Weaknesses
  const weaknesses = card.weaknesses as Array<{ type: string; value: string }> | undefined;
  if (weaknesses && weaknesses.length > 0) {
    const wk = weaknesses.map(w => `weak ${w.type} ${w.value}`).join(', ');
    parts.push(wk);
  }

  // Resistances
  const resistances = card.resistances as Array<{ type: string; value: string }> | undefined;
  if (resistances && resistances.length > 0) {
    const rs = resistances.map(r => `resist ${r.type} ${r.value}`).join(', ');
    parts.push(rs);
  }

  return parts.join(' \u2014 ').replace(/ \u2014 /, ' \u2014 ');
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

// ── Hand formatting ──────────────────────────────────────────────

function formatHandInline(zone: ReadableZone, isViewer: boolean): string {
  if (zone.count === 0) return 'Hand: 0';

  if (zone.cards.length === 0) {
    // All hidden
    return `Hand: ${zone.count} (hidden)`;
  }

  const hiddenCount = zone.count - zone.cards.length;
  const cardList = condenseInline(zone.cards);

  if (hiddenCount > 0) {
    return `Hand (${zone.count}): ${cardList}, [${hiddenCount} hidden]`;
  }
  return `Hand (${zone.count}): ${cardList}`;
}

// ── Inline card formatting ───────────────────────────────────────

function formatCardInline(card: ReadableCard): string {
  const supertype = card.supertype as string | undefined;
  if (supertype && supertype !== 'Pokemon') {
    return `${card.name} (${supertype})`;
  }
  return card.name;
}

function condenseInline(cards: ReadableCard[]): string {
  // Group cards by display string
  const groups: { display: string; count: number }[] = [];
  for (const card of cards) {
    const display = formatCardInline(card);
    const existing = groups.find(g => g.display === display);
    if (existing) {
      // Also account for ReadableCard.count from condenseCards()
      const cardCount = (card.count as number | undefined) ?? 1;
      existing.count += cardCount;
    } else {
      const cardCount = (card.count as number | undefined) ?? 1;
      groups.push({ display, count: cardCount });
    }
  }
  return groups.map(g => g.count > 1 ? `${g.display} x${g.count}` : g.display).join(', ');
}

// ── Count line ───────────────────────────────────────────────────

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
      lines.push(`${card.name}`);
      const rules = card.rules as string[] | undefined;
      if (rules) {
        for (const rule of rules) {
          lines.push(`  ${rule}`);
        }
      }
    }
  }
  return lines;
}
