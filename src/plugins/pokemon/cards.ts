import type { CardTemplate } from '../../core';
import type { DeckList } from '../../core/engine';

/**
 * Pokemon card template extending the base CardTemplate.
 */
export interface PokemonCardTemplate extends CardTemplate {
  setId: string;
  number: number;
}

/**
 * Base Set card data (1-30).
 */
const BASE_SET_CARDS: Array<{ number: number; name: string }> = [
  { number: 1, name: 'Alakazam' },
  { number: 2, name: 'Blastoise' },
  { number: 3, name: 'Chansey' },
  { number: 4, name: 'Charizard' },
  { number: 5, name: 'Clefairy' },
  { number: 6, name: 'Gyarados' },
  { number: 7, name: 'Hitmonchan' },
  { number: 8, name: 'Machamp' },
  { number: 9, name: 'Magneton' },
  { number: 10, name: 'Mewtwo' },
  { number: 11, name: 'Nidoking' },
  { number: 12, name: 'Ninetales' },
  { number: 13, name: 'Poliwrath' },
  { number: 14, name: 'Raichu' },
  { number: 15, name: 'Venusaur' },
  { number: 16, name: 'Zapdos' },
  { number: 17, name: 'Beedrill' },
  { number: 18, name: 'Dragonair' },
  { number: 19, name: 'Dugtrio' },
  { number: 20, name: 'Electabuzz' },
  { number: 21, name: 'Electrode' },
  { number: 22, name: 'Pidgeotto' },
  { number: 23, name: 'Arcanine' },
  { number: 24, name: 'Charmeleon' },
  { number: 25, name: 'Dewgong' },
  { number: 26, name: 'Dratini' },
  { number: 27, name: "Farfetch'd" },
  { number: 28, name: 'Growlithe' },
  { number: 29, name: 'Haunter' },
  { number: 30, name: 'Ivysaur' },
];

/**
 * Create a Pokemon card template.
 */
function createTemplate(setId: string, number: number, name: string): PokemonCardTemplate {
  return {
    id: `${setId}-${number}`,
    name,
    imageUrl: `/card-images/pokemon/${setId}-${number}.png`,
    setId,
    number,
  };
}

/**
 * All Pokemon card templates indexed by ID for O(1) lookup.
 */
export const POKEMON_TEMPLATE_MAP: Map<string, PokemonCardTemplate> = new Map(
  BASE_SET_CARDS.map(({ number, name }) => {
    const template = createTemplate('base1', number, name);
    return [template.id, template];
  })
);

/**
 * Get a card template by ID.
 */
export function getTemplate(id: string): PokemonCardTemplate | undefined {
  return POKEMON_TEMPLATE_MAP.get(id);
}

/**
 * Get the card back image URL.
 */
export function getCardBack(): string {
  return '/card-images/pokemon/cardback.png';
}

/**
 * Default Pokemon deck: 2 copies of each Base Set card (1-30) = 60 cards.
 */
export const DEFAULT_POKEMON_DECK: DeckList = {
  id: 'default-pokemon-deck',
  name: 'Default Pokemon Deck',
  cards: BASE_SET_CARDS.map(({ number }) => ({
    templateId: `base1-${number}`,
    count: 2,
  })),
};
