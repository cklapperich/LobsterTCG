import { SET_CODE_ALIASES, SET_NAME_ALIASES } from './constants';

/** Minimal card shape needed for parsing. Satisfied by WesternCard and simpledex's Card. */
export interface ParseableCard {
  id: string;
  names: Record<string, string>;
  set: string;
  number: string;
  ptcgoCode?: string;
  supertype?: string;
  subtypes?: string[];
}

export interface ParsedEntry { cardId: string; quantity: number; }
export interface PTCGOParseError { line?: number; cardName?: string; message: string; }
export interface PTCGOParseOutput { entries: ParsedEntry[]; errors: PTCGOParseError[]; }

function normalizeNumber(num: string): string {
  return num.replace(/^0+/, '') || '0';
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[éèêë]/g, 'e').replace(/[áàâä]/g, 'a').replace(/[íìîï]/g, 'i')
    .replace(/[óòôö]/g, 'o').replace(/[úùûü]/g, 'u')  // accented vowels (e.g. Pokémon → Pokemon)
    .replace(/[\[\]]/g, '')             // brackets (e.g. "Unown [T]" → "Unown T")
    .replace(/[♂♀]/g, '')              // gender symbols often omitted in decklists
    .replace(/α/g, 'alpha').replace(/β/g, 'beta').replace(/γ/g, 'gamma')  // Greek letters
    .replace(/\s+/g, ' ')              // collapse any double-spaces from symbol removal
    .trim();
}

function getCardEnName(card: ParseableCard): string {
  return card.names?.en || Object.values(card.names)[0] || '';
}

/**
 * Core PTCGO parser. All fallback passes included: full set name, set name aliases, ptcgoCode,
 * set code aliases, TG/GG suffix, parenthetical stripping, energy prefix.
 * Deduplicates: same cardId added multiple times → single entry with summed qty.
 */
export function parsePTCGO(ptcgoText: string, cards: Iterable<ParseableCard>): PTCGOParseOutput {
  const errors: PTCGOParseError[] = [];
  const cardQuantities = new Map<string, number>();

  // Collect into array so we can iterate multiple times
  const allCards = Array.from(cards);

  // Build lookup sets — also add the part after '—' for sets like "HS—Triumphant"
  const knownSets = new Set<string>();
  const knownPtcgoCodes = new Set<string>();
  for (const card of allCards) {
    if (card.set) {
      const set = card.set.toLowerCase();
      knownSets.add(set);
      const dashIdx = set.indexOf('\u2014'); // em dash
      if (dashIdx !== -1) knownSets.add(set.slice(dashIdx + 1).trim());
    }
    if (card.ptcgoCode) knownPtcgoCodes.add(card.ptcgoCode.toLowerCase());
  }

  // Build lookup maps
  const cardsByNameSetNumber = new Map<string, ParseableCard>();
  const cardsByNamePtcgoNumber = new Map<string, ParseableCard>();

  for (const card of allCards) {
    const name = normalizeName(getCardEnName(card));
    const set = (card.set || '').toLowerCase();
    const ptcgoCode = (card.ptcgoCode || '').toLowerCase();
    const normNum = normalizeNumber(String(card.number));

    // Also index under shortened set name for "HS—Triumphant" → "triumphant"
    const sets = [set];
    const dashIdx = set.indexOf('\u2014');
    if (dashIdx !== -1) sets.push(set.slice(dashIdx + 1).trim());

    for (const s of sets) {
      if (s) cardsByNameSetNumber.set(`${name}|${s}|${normNum}`, card);
    }
    if (ptcgoCode) cardsByNamePtcgoNumber.set(`${name}|${ptcgoCode}|${normNum}`, card);

    // Also index under name with parentheticals stripped, so "Boss's Orders" matches
    // "Boss's Orders (Ghetsis)" in the database
    const strippedName = name.replace(/\s*\([^)]*\)/g, '').trim();
    if (strippedName !== name) {
      for (const s of sets) {
        if (s) cardsByNameSetNumber.set(`${strippedName}|${s}|${normNum}`, card);
      }
      if (ptcgoCode) cardsByNamePtcgoNumber.set(`${strippedName}|${ptcgoCode}|${normNum}`, card);
    }
  }

  let lineNumber = 0;
  for (const line of ptcgoText.split('\n')) {
    lineNumber++;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^(?:\*\s+)?(\d+)\s+(.+)\s+([A-Za-z0-9-]+)$/);
    if (!match) continue;

    const [, qtyStr, middle, cardNumber] = match;
    const quantity = parseInt(qtyStr, 10);
    if (quantity <= 0) continue;

    const middleNorm = normalizeName(middle);
    const normCardNumber = normalizeNumber(cardNumber);

    let foundCard: ParseableCard | undefined;

    // Pass 1: full set names
    for (const setName of knownSets) {
      if (middleNorm.endsWith(setName)) {
        const cardName = middleNorm.slice(0, -(setName.length)).trim();
        foundCard = cardsByNameSetNumber.get(`${cardName}|${setName}|${normCardNumber}`);
        if (foundCard) break;
      }
    }

    // Pass 2: set name aliases
    if (!foundCard) {
      for (const [alias, canonical] of Object.entries(SET_NAME_ALIASES)) {
        if (middleNorm.endsWith(alias)) {
          const cardName = middleNorm.slice(0, -(alias.length)).trim();
          foundCard = cardsByNameSetNumber.get(`${cardName}|${canonical}|${normCardNumber}`);
          if (foundCard) break;
        }
      }
    }

    // Pass 3: ptcgoCodes
    if (!foundCard) {
      for (const ptcgoCode of knownPtcgoCodes) {
        if (middleNorm.endsWith(ptcgoCode)) {
          const cardName = middleNorm.slice(0, -(ptcgoCode.length)).trim();
          foundCard = cardsByNamePtcgoNumber.get(`${cardName}|${ptcgoCode}|${normCardNumber}`);
          if (foundCard) break;
        }
      }
    }

    // Pass 4: set code aliases + TG/GG suffix
    if (!foundCard) {
      const lastSpaceIdx = middleNorm.lastIndexOf(' ');
      if (lastSpaceIdx > 0) {
        const potentialCode = middleNorm.slice(lastSpaceIdx + 1);
        const cardName = middleNorm.slice(0, lastSpaceIdx).trim();

        const aliasedCode = SET_CODE_ALIASES[potentialCode];
        if (aliasedCode) {
          foundCard = cardsByNamePtcgoNumber.get(`${cardName}|${aliasedCode}|${normCardNumber}`);
        }

        if (!foundCard) {
          const tgMatch = potentialCode.match(/^(.+)-(tg|gg)$/);
          if (tgMatch) {
            const baseCode = tgMatch[1];
            const prefix = tgMatch[2].toUpperCase();
            const prefixedNumber = normalizeNumber(prefix + cardNumber);
            if (knownPtcgoCodes.has(baseCode)) {
              foundCard = cardsByNamePtcgoNumber.get(`${cardName}|${baseCode}|${prefixedNumber}`);
            }
          }
        }
      }
    }

    // Pass 5: strip parentheticals
    if (!foundCard) {
      const stripped = middleNorm.replace(/\s*\([^)]*\)/g, '');
      if (stripped !== middleNorm) {
        for (const ptcgoCode of knownPtcgoCodes) {
          if (stripped.endsWith(ptcgoCode)) {
            const cardName = stripped.slice(0, -(ptcgoCode.length)).trim();
            foundCard = cardsByNamePtcgoNumber.get(`${cardName}|${ptcgoCode}|${normCardNumber}`);
            if (foundCard) break;
          }
        }
        if (!foundCard) {
          for (const setName of knownSets) {
            if (stripped.endsWith(setName)) {
              const cardName = stripped.slice(0, -(setName.length)).trim();
              foundCard = cardsByNameSetNumber.get(`${cardName}|${setName}|${normCardNumber}`);
              if (foundCard) break;
            }
          }
        }
      }
    }

    // Pass 6: prepend "Basic " for energy cards
    if (!foundCard && middleNorm.includes('energy')) {
      const lastSpaceIdx = middleNorm.lastIndexOf(' ');
      if (lastSpaceIdx > 0) {
        const code = middleNorm.slice(lastSpaceIdx + 1);
        const cardName = middleNorm.slice(0, lastSpaceIdx).trim();
        const basicName = `basic ${cardName}`;
        const aliasedCode = SET_CODE_ALIASES[code] || code;

        if (knownPtcgoCodes.has(aliasedCode)) {
          foundCard = cardsByNamePtcgoNumber.get(`${basicName}|${aliasedCode}|${normCardNumber}`);
        }
        if (!foundCard && knownSets.has(aliasedCode)) {
          foundCard = cardsByNameSetNumber.get(`${basicName}|${aliasedCode}|${normCardNumber}`);
        }
      }
    }

    if (foundCard) {
      cardQuantities.set(foundCard.id, (cardQuantities.get(foundCard.id) || 0) + quantity);
    } else {
      errors.push({
        line: lineNumber,
        cardName: middle.trim(),
        message: `Card not found: ${middle} ${cardNumber}`,
      });
    }
  }

  const entries: ParsedEntry[] = [];
  for (const [cardId, quantity] of cardQuantities) {
    entries.push({ cardId, quantity });
  }

  return { entries, errors };
}
