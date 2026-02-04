import type { GameState, Playmat } from '../../core';
import { createGameState, loadDeck } from '../../core';
import { getSolitairePlaymat, getGameConfig, ZONE_IDS } from './playmat';
import { STANDARD_DECK, CARD_TEMPLATE_MAP, type PlayingCardTemplate } from './deck';

export type SolitaireGameState = GameState<PlayingCardTemplate>;

// Rules text for AI consumption (blank for now)
export const SOLITAIRE_RULES = ``;

/**
 * Start a new solitaire game.
 * Loads the playmat from JSON and creates initial game state.
 */
export async function startSolitaire(): Promise<SolitaireGameState> {
  const playmat = await getSolitairePlaymat();
  const config = getGameConfig(playmat);

  const state = createGameState<PlayingCardTemplate>(
    config,
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

/**
 * Start solitaire with an already-loaded playmat.
 * Use this when you've preloaded the playmat.
 */
export function startSolitaireWithPlaymat(playmat: Playmat): SolitaireGameState {
  const config = getGameConfig(playmat);

  const state = createGameState<PlayingCardTemplate>(
    config,
    'player',
    'none'
  );

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
export { getSolitairePlaymat, getGameConfig, ZONE_IDS } from './playmat';
export { STANDARD_DECK, PLAYING_CARD_TEMPLATES, getTemplate } from './deck';
export type { PlayingCardTemplate, Suit, Rank } from './deck';
