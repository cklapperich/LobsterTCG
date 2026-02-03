import type { GameState } from '../../core';
import { createGameState, loadDeck } from '../../core';
import { SOLITAIRE_CONFIG, ZONE_IDS } from './playmat';
import { STANDARD_DECK, CARD_TEMPLATE_MAP, type PlayingCardTemplate } from './deck';

export type SolitaireGameState = GameState<PlayingCardTemplate>;

// Rules text for AI consumption (blank for now)
export const SOLITAIRE_RULES = ``;

/**
 * Start a new solitaire game.
 * Loads a shuffled deck into the stock zone.
 */
export function startSolitaire(): SolitaireGameState {
  const state = createGameState<PlayingCardTemplate>(
    SOLITAIRE_CONFIG,
    'player',
    'none' // solitaire only uses player 0
  );

  // Load shuffled deck into stock
  loadDeck(
    state,
    0,
    ZONE_IDS.STOCK,
    STANDARD_DECK,
    (id) => CARD_TEMPLATE_MAP.get(id),
    true
  );

  return state;
}

// Re-exports
export { SOLITAIRE_CONFIG, ZONE_IDS } from './playmat';
export { STANDARD_DECK, PLAYING_CARD_TEMPLATES, getTemplate } from './deck';
export type { PlayingCardTemplate, Suit, Rank } from './deck';
