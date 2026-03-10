import { generateText } from 'ai';
import { resolveModel } from '../ai/providers';
import { buildPrompt } from '../plugins/pokemon/prompt-builder';
import { formatCardInventory } from '../core/readable';
import { getTemplate } from '../plugins/pokemon/cards';
import { formatCardReference } from '../plugins/pokemon/narrative';
import type { DeckList } from '../core/types/deck';

export async function generateDeckStrategy(deckList: DeckList): Promise<string> {
  const templates = deckList.cards
    .flatMap(entry => {
      const t = getTemplate(entry.templateId);
      return t ? Array(entry.count).fill(t) : [];
    });

  const formatter = (t: any) => formatCardReference(t as any).join('\n');
  const inventory = formatCardInventory(templates, formatter);

  const { text } = await generateText({
    model: resolveModel('anthropic/claude-opus-4-6'),
    system: buildPrompt('DECK_STRATEGY'),
    prompt: `Deck: ${deckList.name}\n\n${inventory}`,
  });

  return text;
}
