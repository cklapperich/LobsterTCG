import type { GameState, CardTemplate, PlayerIndex } from '../../core';
import { VISIBILITY, PHASES } from '../../core';
import { ZONE_IDS, TABLEAU_ZONE_IDS } from './zones';

/**
 * Deal Klondike solitaire: shuffle stock, deal tableau piles
 * (pile i gets i+1 cards, top card face-up, rest face-down),
 * remaining 24 stay in stock face-down.
 * Also auto-transitions to PLAYING phase since there's no setup turn.
 */
export function executeSolitaireSetup<T extends CardTemplate>(
  state: GameState<T>,
  _playerIndex: PlayerIndex
): void {
  const stockKey = `player1_${ZONE_IDS.STOCK}`;
  const stock = state.zones[stockKey];
  if (!stock) return;

  // Shuffle the stock
  for (let i = stock.cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [stock.cards[i], stock.cards[j]] = [stock.cards[j], stock.cards[i]];
  }

  // Deal tableau piles
  for (let i = 0; i < TABLEAU_ZONE_IDS.length; i++) {
    const tableauKey = `player1_${TABLEAU_ZONE_IDS[i]}`;
    const tableau = state.zones[tableauKey];
    if (!tableau) continue;

    const cardCount = i + 1;
    for (let c = 0; c < cardCount; c++) {
      const card = stock.cards.pop();
      if (!card) break;
      // Top card is face-up (last card dealt), rest face-down
      if (c === cardCount - 1) {
        card.visibility = VISIBILITY.PUBLIC;
      } else {
        card.visibility = VISIBILITY.HIDDEN;
      }
      tableau.cards.push(card);
    }
  }

  // Remaining cards stay in stock, all face-down
  for (const card of stock.cards) {
    card.visibility = VISIBILITY.HIDDEN;
  }

  // Auto-transition to playing phase (no setup turn needed for solitaire)
  state.setupComplete[0] = true;
  state.phase = PHASES.PLAYING;
  state.turnNumber = 1;
  state.currentTurn = { number: 1, activePlayer: 0, actions: [], ended: false };
}
