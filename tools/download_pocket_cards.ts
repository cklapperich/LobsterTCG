/**
 * Download all Pokemon Pocket card data from TCGdex API.
 * Usage: npx tsx tools/download_pocket_cards.ts
 *
 * Fetches the tcgp series, iterates all sets, downloads each card,
 * and writes the combined array to src/plugins/pokemon-pocket/cards-pocket.json.
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = 'https://api.tcgdex.net/v2/en';
const OUTPUT_PATH = resolve(__dirname, '../src/plugins/pokemon-pocket/cards-pocket.json');
const DELAY_MS = 50; // Rate-limit delay between card fetches

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

interface SeriesResponse {
  sets: Array<{ id: string; name: string }>;
}

interface SetResponse {
  cards: Array<{ id: string; name: string }>;
}

async function main() {
  console.log('Fetching Pocket series...');
  const series = await fetchJson<SeriesResponse>(`${BASE_URL}/series/tcgp`);
  const setIds = series.sets.map(s => s.id);
  console.log(`Found ${setIds.length} sets: ${setIds.join(', ')}`);

  const allCards: unknown[] = [];
  let totalFetched = 0;

  for (const setId of setIds) {
    console.log(`\nFetching set ${setId}...`);
    const setData = await fetchJson<SetResponse>(`${BASE_URL}/sets/${setId}`);
    const cardIds = setData.cards.map(c => c.id);
    console.log(`  ${cardIds.length} cards in ${setId}`);

    for (let i = 0; i < cardIds.length; i++) {
      const cardId = cardIds[i];
      try {
        const card = await fetchJson<unknown>(`${BASE_URL}/cards/${cardId}`);
        allCards.push(card);
        totalFetched++;
        if ((i + 1) % 50 === 0 || i === cardIds.length - 1) {
          console.log(`  ${i + 1}/${cardIds.length} cards fetched (${totalFetched} total)`);
        }
      } catch (err) {
        console.error(`  Failed to fetch ${cardId}: ${err}`);
      }
      await sleep(DELAY_MS);
    }
  }

  console.log(`\nWriting ${allCards.length} cards to ${OUTPUT_PATH}...`);
  writeFileSync(OUTPUT_PATH, JSON.stringify(allCards, null, 2));
  console.log('Done!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
