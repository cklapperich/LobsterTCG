/**
 * narrative-helpers.ts — Shared narrative formatting utilities for Pokemon-family plugins.
 *
 * Used by both pokemon/narrative.ts and pokemon-pocket/narrative.ts.
 * Contains all the formatting functions that are identical or near-identical
 * between the two plugins, parameterized where they differ.
 */
import type { ReadableGameState, ReadableZone, ReadableCard, ReadableTurn } from '../../core/readable';
import { ACTION_TYPES } from '../../core/types/constants';
import { toPlayerPerspective } from '../../core/zone-perspective';
import type { PlayerIndex } from '../../core/types/card';

// ── Types for plugin-specific config ────────────────────────────

/** Plugin provides its own SUPERTYPES constant. */
export interface NarrativeSupertypes {
  POKEMON: string;
  TRAINER: string;
  ENERGY?: string; // Only standard Pokemon has Energy supertype
}

/** Config passed by each plugin to customize shared formatting. */
export interface NarrativeConfig {
  supertypes: NarrativeSupertypes;
  /** Function to check if a zone key is a field zone (active/bench). */
  isFieldZone: (zoneKey: string) => boolean;
  /** Counter IDs for burn and poison markers. */
  counterIds: { BURN: string; POISON: string };
  /** Max number of discard cards to show inline. */
  discardDisplayLimit: number;
  /** Optional: format energy counters as inline string (Pocket). If omitted, attached cards are shown instead. */
  formatEnergyCounters?: (card: ReadableCard) => string;
  /** Optional: handle BREAK pre-evolution display. Standard Pokemon only. */
  handleBreak?: boolean;
  /** When true, skip the deduplicated CARD REFERENCE section and instead write
   *  full card details (attacks, abilities, rules) inline under each board slot. */
  inlineCardDetails?: boolean;
}

// ── Card Reference ──────────────────────────────────────────────

/**
 * Collect all visible unique cards for the reference section.
 * Dynamically discovers field zones from the state — no hardcoded bench count.
 */
export function collectUniqueCards(readable: ReadableGameState, config: NarrativeConfig): ReadableCard[] {
  const seen = new Map<string, ReadableCard>();

  for (const [zoneKey, zone] of Object.entries(readable.zones)) {
    if (zoneKey.endsWith('_deck')) continue;
    const aiHandKey = `player${readable.viewer + 1}_hand`;
    if (zoneKey.endsWith('_hand') && zoneKey !== aiHandKey) continue;

    const field = config.isFieldZone(zoneKey);

    for (let i = 0; i < zone.cards.length; i++) {
      const card = zone.cards[i];
      const isTop = field && i === zone.cards.length - 1;
      const isPokemon = card.supertype === config.supertypes.POKEMON;

      // Skip non-top Pokemon in field zones (evolved-from cards under the stack)
      if (field && !isTop && isPokemon) {
        if (config.handleBreak) {
          // BREAK can use pre-evolution attacks, so include the direct pre-evo
          const topCard = zone.cards[zone.cards.length - 1];
          const topSubtypes = topCard.subtypes as string[] | undefined;
          const topIsBreak = topCard.supertype === config.supertypes.POKEMON &&
            (topSubtypes ?? []).includes('BREAK');
          if (!topIsBreak) continue;
          const isDirectPreEvo = !zone.cards.slice(i + 1).some(c =>
            c.supertype === config.supertypes.POKEMON && !((c.subtypes as string[] ?? []).includes('BREAK'))
          );
          if (!isDirectPreEvo) continue;
        } else {
          continue;
        }
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
 * Handles Pokemon, Trainer, and Energy supertypes.
 */
export function formatCardReference(card: ReadableCard, config: NarrativeConfig): string[] {
  const lines: string[] = [];
  const supertype = card.supertype as string | undefined;

  if (supertype === config.supertypes.POKEMON) {
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
  } else if (supertype === config.supertypes.TRAINER) {
    const subtypes = card.subtypes as string[] | undefined;
    const sub = subtypes && subtypes.length > 0 ? `, ${subtypes.join('/')}` : '';
    lines.push(`${card.name} \u2014 Trainer${sub}`);

    // Pocket stores trainer text as .effect, standard uses .rules
    const effect = card.effect as string | undefined;
    if (effect) {
      lines.push(`  ${effect}`);
    }

    const rules = card.rules as string[] | undefined;
    if (rules && rules.length > 0) {
      for (const rule of rules) {
        lines.push(`  ${rule}`);
      }
    }
  } else if (config.supertypes.ENERGY && supertype === config.supertypes.ENERGY) {
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
    parts.push(`evolves from: ${evolveFrom}`);
  }

  const types = card.types as string[] | undefined;
  if (types && types.length > 0) {
    parts.push(`type: ${types.join('/')}`);
  }

  const subtypes = card.subtypes as string[] | undefined;
  if (subtypes && subtypes.length > 0) {
    parts.push(`stage: ${subtypes.join('/')}`);
  }

  const hp = card.hp as number | undefined;
  if (hp) {
    parts.push(`HP: ${hp}`);
  }

  const retreatCost = card.retreatCost;
  if (retreatCost !== undefined && retreatCost !== null) {
    const cost = typeof retreatCost === 'number' ? retreatCost : (retreatCost as string[]).length;
    parts.push(`retreat cost: ${cost}`);
  }

  // Standard Pokemon: weaknesses/resistances arrays with x2/-30
  const weaknesses = card.weaknesses as Array<{ type: string; value: string }> | undefined;
  if (weaknesses && weaknesses.length > 0) {
    parts.push(`weakness: ${weaknesses.map(w => `${w.type} ${w.value}`).join(', ')}`);
  }

  const resistances = card.resistances as Array<{ type: string; value: string }> | undefined;
  if (resistances && resistances.length > 0) {
    parts.push(`resistance: ${resistances.map(r => `${r.type} ${r.value}`).join(', ')}`);
  }

  // Pocket: single weakness object with +N
  const weakness = card.weakness as { type: string; value: number } | undefined;
  if (weakness) {
    parts.push(`weakness: ${weakness.type} +${weakness.value}`);
  }

  return parts.join(' | ');
}

export function formatAttack(attack: { name: string; cost: string[]; damage: string; effect?: string }): string {
  const cost = attack.cost.length > 0 ? `Cost (energy requirement): [${condenseCost(attack.cost)}]` : 'Cost (energy requirement): [Free]';
  const dmg = attack.damage ? ` | Damage: ${attack.damage}` : '';
  const effect = attack.effect ? ` | Effect: ${attack.effect}` : '';
  return `${attack.name} | ${cost}${dmg}${effect}`;
}

/** Condense attack cost array: ["Fire","Fire","Colorless"] → "2x Fire, 1x Any" */
function condenseCost(cost: string[]): string {
  const groups: { type: string; count: number }[] = [];
  for (const c of cost) {
    const label = c.toLowerCase() === 'colorless' ? 'Any' : c;
    const existing = groups.find(g => g.type === label);
    if (existing) {
      existing.count++;
    } else {
      groups.push({ type: label, count: 1 });
    }
  }
  return groups.map(g => `${g.count}x ${g.type}`).join(', ');
}

export function formatAbility(ability: { name: string; type: string; effect: string }): string {
  return `${ability.name} (${ability.type}) \u2014 ${ability.effect}`;
}

// ── Board formatting ────────────────────────────────────────────

/**
 * Format a player's board. Dynamically discovers field zones from state
 * instead of hardcoding bench slot counts.
 */
export function formatBoard(
  readable: ReadableGameState,
  playerPrefix: string,
  owner: string,
  config: NarrativeConfig,
  opts?: {
    /** Show deck contents (names only). Standard Pokemon only. */
    showDeckContents?: boolean;
    /** Show lost zone. Standard Pokemon only. */
    showLostZone?: boolean;
    /** Show prize zones. Standard Pokemon only. */
    showPrizes?: boolean;
  },
): string[] {
  const lines: string[] = [];
  const zones = readable.zones;

  // Dynamically find field zones for this player: active + bench_N
  const fieldZoneIds: string[] = [];
  if (zones[`${playerPrefix}_active`]) fieldZoneIds.push('active');
  for (let i = 1; i <= 10; i++) {
    const key = `bench_${i}`;
    if (zones[`${playerPrefix}_${key}`]) {
      fieldZoneIds.push(key);
    } else {
      break;
    }
  }

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
      lines.push(...formatFieldZoneCompact(label, zone, zoneKey, config));
    }
  }

  // Hand
  const handKey = `${playerPrefix}_hand`;
  const hand = zones[handKey];
  if (hand) {
    lines.push(formatHandLine(hand, owner));
    // Inline mode: write full card details for each visible hand card
    if (config.inlineCardDetails && hand.cards.length > 0) {
      for (const card of hand.cards) {
        const details = formatInlineCardDetails(card, config);
        if (details.length > 0) {
          lines.push(`  ${card.name} | location: ${handKey}:`);
          lines.push(...details);
        }
      }
    }
  }

  // Count line
  lines.push(formatCountLine(zones, playerPrefix, owner));

  // Discard contents (if non-empty and visible)
  const discardKey = `${playerPrefix}_discard`;
  const discard = zones[discardKey];
  if (discard && discard.cards.length > 0 && discard.cards.length <= config.discardDisplayLimit) {
    lines.push(`  ${owner} Discard: ${condenseNames(discard.cards)}`);
  }

  // Energy discard zone (Pocket: zone counters tracking discarded energy)
  const energyDiscardKey = `${playerPrefix}_energy_discard`;
  const energyDiscard = zones[energyDiscardKey];
  if (energyDiscard && energyDiscard.counters) {
    const parts: string[] = [];
    for (const [counterId, count] of Object.entries(energyDiscard.counters)) {
      if (count > 0) {
        // Strip '_energy' suffix for readability: 'fire_energy' → 'fire'
        const label = counterId.replace(/_energy$/, '');
        parts.push(`${count}x ${label}`);
      }
    }
    if (parts.length > 0) {
      lines.push(`${owner} Energy Discard: ${parts.join(', ')}`);
    }
  }

  // Lost zone (only if non-empty)
  if (opts?.showLostZone) {
    const lostKey = `${playerPrefix}_lost_zone`;
    const lost = zones[lostKey];
    if (lost && lost.count > 0) {
      if (lost.cards.length > 0) {
        lines.push(`${owner} Lost Zone (${lost.count}): ${condenseNames(lost.cards)}`);
      } else {
        lines.push(`${owner} Lost Zone: ${lost.count}`);
      }
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

// ── Compact field zone ──────────────────────────────────────────

function formatFieldZoneCompact(label: string, zone: ReadableZone, zoneKey: string, config: NarrativeConfig): string[] {
  const lines: string[] = [];
  const cards = zone.cards;
  if (cards.length === 0) return lines;

  const pokemon = cards[cards.length - 1];
  const attached = cards.slice(0, -1);

  // Separate pre-evo Pokemon from energy/tools/items
  const topSubtypes = pokemon.subtypes as string[] | undefined;
  const topIsBreak = config.handleBreak && pokemon.supertype === config.supertypes.POKEMON &&
    (topSubtypes ?? []).includes('BREAK');
  const nonPokemon = attached.filter(c => c.supertype !== config.supertypes.POKEMON);
  const preEvoPokemon = topIsBreak ? attached.filter(c => c.supertype === config.supertypes.POKEMON) : [];

  // Build the header line — instance stats + attached + energy + location
  const attachedPart = nonPokemon.length > 0 ? ` | attached: ${condenseNames(nonPokemon)}` : '';
  let line = `[${label}] ${formatInstanceStats(pokemon, config)}${attachedPart}`;
  if (config.formatEnergyCounters) {
    line += ` | energy: ${config.formatEnergyCounters(pokemon)}`;
  }
  if (config.inlineCardDetails) {
    line += ` | location: ${zoneKey}`;
  }
  lines.push(line);

  // Inline mode: write full card details (attacks, abilities, rules) under this slot
  if (config.inlineCardDetails) {
    lines.push(...formatInlineCardDetails(pokemon, config));
    for (const card of nonPokemon) {
      lines.push(...formatInlineCardDetails(card, config));
    }
  }

  if (preEvoPokemon.length > 0) {
    const preEvo = preEvoPokemon[preEvoPokemon.length - 1];
    if (config.inlineCardDetails) {
      lines.push(`  Pre-evo: ${preEvo.name} (attacks available below)`);
      lines.push(...formatInlineCardDetails(preEvo, config));
    } else {
      lines.push(`  Pre-evo: ${preEvo.name} (attacks available — see CARD REFERENCE)`);
    }
  }

  const flags = pokemon.flags as string[] | undefined;
  if (flags && flags.length > 0) {
    lines.push(`  [${flags.join(', ')}]`);
  }

  return lines;
}

/** Write full card details (attacks, abilities, rules, effect) indented under a board slot. */
function formatInlineCardDetails(card: ReadableCard, config: NarrativeConfig): string[] {
  const lines: string[] = [];
  const supertype = card.supertype as string | undefined;

  if (supertype === config.supertypes.POKEMON) {
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
  } else if (supertype === config.supertypes.TRAINER) {
    const effect = card.effect as string | undefined;
    if (effect) {
      lines.push(`    ${card.name}: ${effect}`);
    }
    const rules = card.rules as string[] | undefined;
    if (rules && rules.length > 0) {
      for (const rule of rules) {
        lines.push(`    ${card.name}: ${rule}`);
      }
    }
  } else if (config.supertypes.ENERGY && supertype === config.supertypes.ENERGY) {
    const rules = card.rules as string[] | undefined;
    if (rules && rules.length > 0) {
      for (const rule of rules) {
        lines.push(`    ${card.name}: ${rule}`);
      }
    }
  }

  return lines;
}

/**
 * Instance-specific stats line for a Pokemon on the board.
 * Includes damage, status, burn/poison counters.
 */
function formatInstanceStats(card: ReadableCard, config: NarrativeConfig): string {
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
    if (counters[config.counterIds.BURN]) parts.push('BURNED');
    if (counters[config.counterIds.POISON]) parts.push('POISONED');
  }

  return parts.join(' | ');
}

// ── Hand formatting ─────────────────────────────────────────────

export function formatHandLine(zone: ReadableZone, owner: string): string {
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

// ── Shared helpers ──────────────────────────────────────────────

/** Condense card names for inline display. Groups duplicates: "3x Fire Energy" */
export function condenseNames(cards: ReadableCard[]): string {
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
  return groups.map(g => g.count > 1 ? `${g.count}x ${g.name}` : g.name).join(', ');
}

/**
 * Count line: Deck | Discard | Prizes (if applicable).
 * Dynamically detects prize zones.
 */
export function formatCountLine(zones: Record<string, ReadableZone>, prefix: string, owner: string): string {
  const deckCount = zones[`${prefix}_deck`]?.count ?? 0;
  const discardCount = zones[`${prefix}_discard`]?.count ?? 0;

  let line = `${owner} Deck: ${deckCount} | ${owner} Discard: ${discardCount}`;

  // Detect prize zones (standard Pokemon: prizes_1..prizes_6)
  let prizesCount = 0;
  let hasPrizes = false;
  for (let i = 1; i <= 6; i++) {
    const prizeZone = zones[`${prefix}_prizes_${i}`];
    if (prizeZone) {
      hasPrizes = true;
      prizesCount += prizeZone.count;
    }
  }
  if (hasPrizes) {
    const prizesTaken = 6 - prizesCount;
    line += ` | ${owner} Prizes: ${prizesCount} remaining (${prizesTaken} taken)`;
  }

  return line;
}

// ── Actions formatting ──────────────────────────────────────────

export function formatActions(turn: ReadableTurn): string[] {
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

// ── KO alerts ───────────────────────────────────────────────────

/**
 * Warn about any Pokemon whose damage counters meet or exceed their base HP.
 * Dynamically discovers field zones from state.
 */
export function formatKOAlerts(readable: ReadableGameState, aiIdx: PlayerIndex, config: NarrativeConfig): string[] {
  const lines: string[] = [];
  const players = [
    { prefix: `player${aiIdx + 1}`, owner: 'YOUR' },
    { prefix: `player${aiIdx === 0 ? 2 : 1}`, owner: "OPPONENT'S" },
  ];

  for (const { prefix, owner } of players) {
    for (const [zoneKey, zone] of Object.entries(readable.zones)) {
      if (!zoneKey.startsWith(`${prefix}_`)) continue;
      if (!config.isFieldZone(zoneKey)) continue;
      if (zone.cards.length === 0) continue;

      const pokemon = zone.cards[zone.cards.length - 1];
      const hp = pokemon.hp as number | undefined;
      const totalDamage = pokemon.totalDamage as number | undefined;
      if (!hp || totalDamage === undefined || totalDamage === 0) continue;

      const zoneId = zoneKey.replace(`${prefix}_`, '');
      const label = zoneId === 'active' ? 'Active' : zoneId.replace('_', ' ');

      // Check for attached HP-boosting tools so we can mention them
      const attached = zone.cards.slice(0, -1);
      const tools = attached.filter(c => c.supertype === config.supertypes.TRAINER);
      const toolNote = tools.length > 0
        ? ` (has tool: ${tools.map(t => t.name).join(', ')} — verify if it grants extra HP)`
        : '';

      if (totalDamage >= hp) {
        lines.push(`[KO] ${owner} ${label}: ${pokemon.name} has ${totalDamage} damage vs ${hp} base HP — should be KO'd${toolNote}. Check for HP-boosting tools/stadium before acting.`);
      }
    }
  }

  return lines;
}

// ── Combat notes ────────────────────────────────────────────────

/**
 * Format combat weakness/resistance matchup notes between active Pokemon.
 * Handles both standard (x2/-30 arrays) and Pocket (+N single) weakness formats.
 */
export function formatCombatNotes(readable: ReadableGameState, aiIdx: PlayerIndex): string[] {
  const lines: string[] = [];

  const myPrefix = `player${aiIdx + 1}`;
  const oppPrefix = `player${aiIdx === 0 ? 2 : 1}`;
  const myActive = getTopCard(readable.zones[`${myPrefix}_active`]);
  const oppActive = getTopCard(readable.zones[`${oppPrefix}_active`]);

  if (!myActive || !oppActive) return lines;

  const myTypes = (myActive.types as string[] | undefined) ?? [];
  const oppTypes = (oppActive.types as string[] | undefined) ?? [];

  // Standard Pokemon: weaknesses/resistances arrays
  const myWeaknesses = (myActive.weaknesses as Array<{ type: string; value: string }> | undefined) ?? [];
  const myResistances = (myActive.resistances as Array<{ type: string; value: string }> | undefined) ?? [];
  const oppWeaknesses = (oppActive.weaknesses as Array<{ type: string; value: string }> | undefined) ?? [];
  const oppResistances = (oppActive.resistances as Array<{ type: string; value: string }> | undefined) ?? [];

  // Pocket: single weakness object
  const myWeakness = myActive.weakness as { type: string; value: number } | undefined;
  const oppWeakness = oppActive.weakness as { type: string; value: number } | undefined;

  // Your attacks vs opponent's active — standard format
  for (const w of oppWeaknesses.filter(w => myTypes.includes(w.type))) {
    lines.push(`Your ${myActive.name} VS ${oppActive.name}: WEAKNESS applies: ${oppActive.name} takes 2x damage from ${w.type} types such as your ${myActive.name} (unless an effect nullifies it)`);
  }
  for (const r of oppResistances.filter(r => myTypes.includes(r.type))) {
    lines.push(`Your ${myActive.name} VS ${oppActive.name}: RESISTANCE applies: ${oppActive.name} takes -30 damage from ${r.type} types such as your ${myActive.name} (unless an effect nullifies it)`);
  }

  // Opponent's attacks vs your active — standard format
  for (const w of myWeaknesses.filter(w => oppTypes.includes(w.type))) {
    lines.push(`Your ${myActive.name} VS ${oppActive.name}: WEAKNESS applies: ${myActive.name} takes 2x damage from ${w.type} types such as ${oppActive.name} (unless an effect nullifies it)`);
  }
  for (const r of myResistances.filter(r => oppTypes.includes(r.type))) {
    lines.push(`Your ${myActive.name} VS ${oppActive.name}: RESISTANCE applies: ${myActive.name} takes -30 damage from ${r.type} types such as ${oppActive.name} (unless an effect nullifies it)`);
  }

  // Pocket format — single weakness
  if (oppWeakness && myTypes.includes(oppWeakness.type)) {
    lines.push(`Your ${myActive.name} VS ${oppActive.name}: WEAKNESS applies: ${oppActive.name} takes +${oppWeakness.value} damage from ${oppWeakness.type} types`);
  }
  if (myWeakness && oppTypes.includes(myWeakness.type)) {
    lines.push(`Your ${myActive.name} VS ${oppActive.name}: WEAKNESS applies: ${myActive.name} takes +${myWeakness.value} damage from ${myWeakness.type} types`);
  }

  if (lines.length === 0) {
    lines.push(`No weakness or resistance between ${myActive.name} (${myTypes.join('/')}) and ${oppActive.name} (${oppTypes.join('/')})`);
  }

  return lines;
}

export function getTopCard(zone: ReadableZone | undefined): ReadableCard | undefined {
  if (!zone || zone.cards.length === 0) return undefined;
  return zone.cards[zone.cards.length - 1];
}

// ── Stadium formatting ──────────────────────────────────────────

export function formatStadium(zones: Record<string, ReadableZone>): string[] {
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

export function formatZoneList(zones: Record<string, ReadableZone>, aiIdx: PlayerIndex): string[] {
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
