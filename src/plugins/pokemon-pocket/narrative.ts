/**
 * narrative.ts — Pokemon Pocket AI context formatter.
 *
 * Compresses ReadableGameState into compact text for LLM consumption.
 * Pocket-specific: energy counters, point tracking, simplified weakness (+20).
 */
import type { ReadableGameState, ReadableZone, ReadableCard, ReadableTurn } from '../../core/readable';
import { ACTION_TYPES } from '../../core/types/constants';
import { isFieldZone } from './helpers';
import { SUPERTYPES, NARRATIVE, FIRST_EVOLUTION_TURN, POINTS_TO_WIN, ENERGY_COUNTER_TYPES } from './constants';
import { toPlayerPerspective } from '../../core/zone-perspective';
import type { PlayerIndex } from '../../core/types/card';
import type { PocketPluginState } from './plugin-state';

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
  lines.push(...formatBoard(readable, aiPrefix, 'Your'));

  // Opponent's board
  lines.push('');
  lines.push('--- OPPONENT BOARD ---');
  lines.push('');
  lines.push(...formatBoard(readable, oppPrefix, 'Opponent'));

  // KO alerts
  const koLines = formatKOAlerts(readable, aiIdx);
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

// ── Card Reference ───────────────────────────────────────────────

function collectUniqueCards(readable: ReadableGameState): ReadableCard[] {
  const seen = new Map<string, ReadableCard>();

  for (const [zoneKey, zone] of Object.entries(readable.zones)) {
    if (zoneKey.endsWith('_deck')) continue;
    const aiHandKey = `player${readable.viewer + 1}_hand`;
    if (zoneKey.endsWith('_hand') && zoneKey !== aiHandKey) continue;

    const field = isFieldZone(zoneKey);

    for (let i = 0; i < zone.cards.length; i++) {
      const card = zone.cards[i];
      const isTop = field && i === zone.cards.length - 1;
      const isPokemon = card.supertype === SUPERTYPES.POKEMON;

      if (field && !isTop && isPokemon) continue;

      if (!seen.has(card.name)) {
        seen.set(card.name, card);
      }
    }
  }

  return Array.from(seen.values());
}

export function formatCardReference(card: ReadableCard): string[] {
  const lines: string[] = [];
  const supertype = card.supertype as string | undefined;

  if (supertype === SUPERTYPES.POKEMON) {
    lines.push(formatPokemonReference(card));

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

  // Pocket: weakness is +20, no resistance
  const weakness = card.weakness as { type: string; value: number } | undefined;
  if (weakness) {
    parts.push(`weak ${weakness.type} +${weakness.value}`);
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

  const fieldZoneIds = ['active', 'bench_1', 'bench_2', 'bench_3'];

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

  // Count line: Deck | Discard
  lines.push(formatCountLine(zones, playerPrefix, owner));

  // Discard contents
  const discardKey = `${playerPrefix}_discard`;
  const discard = zones[discardKey];
  if (discard && discard.cards.length > 0 && discard.cards.length <= NARRATIVE.DISCARD_DISPLAY_LIMIT) {
    lines.push(`  ${owner} Discard: ${condenseNames(discard.cards)}`);
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

function formatFieldZoneCompact(label: string, zone: ReadableZone): string[] {
  const lines: string[] = [];
  const cards = zone.cards;
  if (cards.length === 0) return lines;

  const pokemon = cards[cards.length - 1];
  const nonPokemon = cards.slice(0, -1).filter(c => c.supertype !== SUPERTYPES.POKEMON);

  // Show attached items
  const attachedStr = nonPokemon.length > 0 ? condenseNames(nonPokemon) : 'no items';

  // Show energy counters
  const energyStr = formatEnergyCounters(pokemon);

  lines.push(`[${label}] ${formatInstanceStats(pokemon)} (${attachedStr}) [Energy: ${energyStr}]`);

  const flags = pokemon.flags as string[] | undefined;
  if (flags && flags.length > 0) {
    lines.push(`  [${flags.join(', ')}]`);
  }

  return lines;
}

function formatEnergyCounters(card: ReadableCard): string {
  const counters = card.counters as Record<string, number> | undefined;
  if (!counters) return 'none';

  const energyParts: string[] = [];
  for (const [type, counterId] of Object.entries(ENERGY_COUNTER_TYPES)) {
    const count = counters[counterId];
    if (count && count > 0) {
      energyParts.push(`${type} x${count}`);
    }
  }

  return energyParts.length > 0 ? energyParts.join(', ') : 'none';
}

function formatInstanceStats(card: ReadableCard): string {
  const parts: string[] = [card.name];

  const hp = card.hp as number | undefined;
  const totalDamage = card.totalDamage as number | undefined;
  if (hp) {
    parts.push(`${hp} HP`);
  }
  if (totalDamage) {
    parts.push(`${totalDamage} damage`);
  }

  const status = card.status as string | undefined;
  if (status) {
    parts.push(status.toUpperCase());
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

  const visibleCount = zone.cards.reduce((sum, c) => sum + ((c.count as number) ?? 1), 0);
  const hiddenCount = zone.count - visibleCount;
  const cardList = condenseNames(zone.cards);

  if (hiddenCount > 0) {
    return `${label} (${zone.count}): ${cardList}, [${hiddenCount} hidden]`;
  }
  return `${label} (${zone.count}): ${cardList}`;
}

// ── Shared helpers ───────────────────────────────────────────────

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
  return `${owner} Deck: ${deckCount} | ${owner} Discard: ${discardCount}`;
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
    case ACTION_TYPES.END_TURN:
      return 'end_turn';
    default:
      return `${type}${nameStr ? ' ' + nameStr : ''}`;
  }
}

// ── KO alerts ────────────────────────────────────────────────────

function formatKOAlerts(readable: ReadableGameState, aiIdx: PlayerIndex): string[] {
  const lines: string[] = [];
  const fieldZoneIds = ['active', 'bench_1', 'bench_2', 'bench_3'];
  const players = [
    { prefix: `player${aiIdx + 1}`, owner: 'YOUR' },
    { prefix: `player${aiIdx === 0 ? 2 : 1}`, owner: "OPPONENT'S" },
  ];

  for (const { prefix, owner } of players) {
    for (const zoneId of fieldZoneIds) {
      const zone = readable.zones[`${prefix}_${zoneId}`];
      if (!zone || zone.cards.length === 0) continue;

      const pokemon = zone.cards[zone.cards.length - 1];
      const hp = pokemon.hp as number | undefined;
      const totalDamage = pokemon.totalDamage as number | undefined;
      if (!hp || totalDamage === undefined || totalDamage === 0) continue;

      const label = zoneId === 'active' ? 'Active' : zoneId.replace('_', ' ');

      if (totalDamage >= hp) {
        lines.push(`[KO] ${owner} ${label}: ${pokemon.name} has ${totalDamage} damage vs ${hp} HP — should be KO'd.`);
      }
    }
  }

  return lines;
}

// ── Combat notes (weakness only — no resistance in Pocket) ──────

function formatCombatNotes(readable: ReadableGameState, aiIdx: PlayerIndex = 1): string[] {
  const lines: string[] = [];

  const myPrefix = `player${aiIdx + 1}`;
  const oppPrefix = `player${aiIdx === 0 ? 2 : 1}`;
  const myActive = getTopCard(readable.zones[`${myPrefix}_active`]);
  const oppActive = getTopCard(readable.zones[`${oppPrefix}_active`]);

  if (!myActive || !oppActive) return lines;

  const myTypes = (myActive.types as string[] | undefined) ?? [];
  const oppTypes = (oppActive.types as string[] | undefined) ?? [];

  // Pocket weakness: +20, not x2
  const myWeakness = myActive.weakness as { type: string; value: number } | undefined;
  const oppWeakness = oppActive.weakness as { type: string; value: number } | undefined;

  if (oppWeakness && myTypes.includes(oppWeakness.type)) {
    lines.push(`Your ${myActive.name} VS ${oppActive.name}: WEAKNESS applies: ${oppActive.name} takes +${oppWeakness.value} damage from ${oppWeakness.type} types`);
  }

  if (myWeakness && oppTypes.includes(myWeakness.type)) {
    lines.push(`Your ${myActive.name} VS ${oppActive.name}: WEAKNESS applies: ${myActive.name} takes +${myWeakness.value} damage from ${myWeakness.type} types`);
  }

  if (lines.length === 0) {
    lines.push(`No weakness between ${myActive.name} (${myTypes.join('/')}) and ${oppActive.name} (${oppTypes.join('/')})`);
  }

  return lines;
}

function getTopCard(zone: ReadableZone | undefined): ReadableCard | undefined {
  if (!zone || zone.cards.length === 0) return undefined;
  return zone.cards[zone.cards.length - 1];
}

// ── Zone key reference ──────────────────────────────────────────

function formatZoneList(zones: Record<string, ReadableZone>, aiIdx: PlayerIndex): string[] {
  const lines: string[] = [];
  const yourKeys: string[] = [];
  const opponentKeys: string[] = [];
  const sharedKeys: string[] = [];

  for (const zoneKey of Object.keys(zones)) {
    const perspective = toPlayerPerspective(zoneKey, aiIdx);
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
