import type { GameTypeConfig } from '../../core/types/game-type-config';
import { plugin, executeSetup, onSetupComplete, pokemonHooksPlugin, parsePTCGODeck } from './index';
import { getTemplate, getWesternCard } from './cards';

function exportToPTCGO(deck: { cardId: string; count: number }[]): string {
  const sections: { header: string; lines: string[] }[] = [
    { header: 'Pokémon', lines: [] },
    { header: 'Trainer', lines: [] },
    { header: 'Energy', lines: [] },
  ];

  for (const entry of deck) {
    const card = getWesternCard(entry.cardId);
    if (!card) continue;

    const name = card.names.en || Object.values(card.names)[0] || 'Unknown';
    const setCode = card.ptcgoCode || card.set;
    const line = `* ${entry.count} ${name} ${setCode} ${card.number}`;

    const supertype = card.supertype ?? 'Pokemon';
    if (supertype === 'Pokemon') sections[0].lines.push(line);
    else if (supertype === 'Trainer') sections[1].lines.push(line);
    else sections[2].lines.push(line);
  }

  const output: string[] = [];
  for (const section of sections) {
    if (section.lines.length === 0) continue;
    if (output.length > 0) output.push('');
    output.push(`##${section.header}`);
    output.push('');
    output.push(...section.lines);
  }

  return output.join('\n') + '\n';
}

export const pokemonConfig: GameTypeConfig = {
  id: 'pokemon-tcg',
  name: 'Pokemon TCG',
  plugin,
  hooksPlugin: pokemonHooksPlugin as any,
  getTemplate,
  deckZoneId: 'deck',
  playerCount: 2,
  needsDeckSelection: true,
  needsAIModel: true,
  executeSetup: executeSetup,
  onSetupComplete:onSetupComplete,
  tcgFilter: 'Pokemon',
  deckbuilderLink: 'https://my.limitlesstcg.com/builder',
  parseDeckText: (text, name) => parsePTCGODeck(text, name),
  exportDeckText: (cards) => exportToPTCGO(cards.map(c => ({ cardId: c.templateId, count: c.count }))),
};
