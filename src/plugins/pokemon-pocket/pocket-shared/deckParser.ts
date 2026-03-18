import type { DeckEntry } from '../../../core/types/deck';
import type { DeckParseResult } from '../../../core/types/game-type-config';
import type { TCGdexCard } from './types';
import { getPocketCard, registerStubCard } from '../cards';

/**
 * Parse a Pokemon Pocket deck text format into a DeckList.
 *
 * Format:
 *   Pokémon: 10
 *   2 Charmander A2b 008
 *   1 Charmeleon B1a 012
 *   ...
 *
 *   Trainer: 10
 *   2 Professor's Research P-A 007
 *   ...
 *
 * Each line: {count} {cardName} {setCode} {cardNumber}
 * Section headers (Pokémon: N, Trainer: N) are optional decoration.
 * Blank lines are ignored.
 */
export function parsePocketDeck(text: string, deckName?: string): DeckParseResult {
  const entries: DeckEntry[] = [];
  const warnings: string[] = [];

  let currentSection: 'Pokemon' | 'Trainer' = 'Pokemon';

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    // Track section headers like "Pokémon: 10" or "Trainer: 5"
    const headerMatch = line.match(/^(Pok[eé]mon|Trainer|Energy)\s*:\s*\d+$/i);
    if (headerMatch) {
      currentSection = /^pok/i.test(headerMatch[1]) ? 'Pokemon' : 'Trainer';
      continue;
    }
    // Skip comment lines
    if (line.startsWith('#') || line.startsWith('//')) continue;

    // Parse: {count} {name...} {setCode} {cardNumber}
    // Card number is always last, set code is second-to-last
    const match = line.match(/^(\d+)\s+(.+)\s+(\S+)\s+(\d+)$/);
    if (!match) {
      warnings.push(`Could not parse line: "${line}"`);
      continue;
    }

    const count = parseInt(match[1], 10);
    const name = match[2].trim();
    const setCode = match[3];
    const cardNumber = match[4].padStart(3, '0'); // Zero-pad to 3 digits (74 → 074)

    // Build the card ID: "{setCode}-{cardNumber}"
    const templateId = `${setCode}-${cardNumber}`;

    // Validate the card exists; create a stub if not in the database yet
    let card = getPocketCard(templateId);
    if (!card) {
      const stub: TCGdexCard = {
        id: templateId,
        localId: cardNumber,
        name,
        category: currentSection,
        set: { id: setCode, name: setCode },
      };
      registerStubCard(stub);
      card = stub;
      warnings.push(`Card not in database, using stub: ${name} (${templateId})`);
    }

    // Warn if name doesn't match (typo detection)
    if (card.name !== name) {
      warnings.push(`Name mismatch for ${templateId}: expected "${card.name}", got "${name}"`);
    }

    entries.push({ templateId, count });
  }

  return {
    deckList: {
      id: `pocket-${Date.now()}`,
      name: deckName || 'Imported Deck',
      cards: entries,
    },
    warnings,
  };
}

/**
 * Export a pocket deck's cards back to text format.
 */
export function exportPocketDeck(cards: DeckEntry[]): string {
  const pokemonLines: string[] = [];
  const trainerLines: string[] = [];
  let pokemonCount = 0;
  let trainerCount = 0;

  for (const entry of cards) {
    const card = getPocketCard(entry.templateId);
    if (!card) continue;

    const line = `${entry.count} ${card.name} ${card.set.id} ${card.localId}`;
    if (card.category === 'Pokemon') {
      pokemonLines.push(line);
      pokemonCount += entry.count;
    } else {
      trainerLines.push(line);
      trainerCount += entry.count;
    }
  }

  const sections: string[] = [];
  if (pokemonLines.length > 0) {
    sections.push(`Pokémon: ${pokemonCount}\n${pokemonLines.join('\n')}`);
  }
  if (trainerLines.length > 0) {
    sections.push(`Trainer: ${trainerCount}\n${trainerLines.join('\n')}`);
  }
  return sections.join('\n\n') + '\n';
}
