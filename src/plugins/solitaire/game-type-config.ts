import type { GameTypeConfig } from '../../core/types/game-type-config';
import type { CardTemplate } from '../../core/types/card';
import type { GameState } from '../../core/types/game';
import type { PlayerIndex } from '../../core/types/card';
import { plugin, solitaireHooksPlugin } from './index';
import { getTemplate, STANDARD_DECK } from './cards';
import type { SolitaireCardTemplate } from './cards';
import { executeSolitaireSetup } from './setup';

const SUIT_SYMBOLS: Record<string, string> = {
  spades: '\u2660',
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
};

export const solitaireConfig: GameTypeConfig = {
  id: 'klondike',
  name: 'Klondike Solitaire',
  plugin,
  hooksPlugin: solitaireHooksPlugin as any,
  getTemplate,
  deckZoneId: 'stock',
  playerCount: 1,
  needsDeckSelection: false,
  needsAIModel: false,
  getDeck: () => STANDARD_DECK,
  renderFace: (t: CardTemplate) => {
    const st = t as SolitaireCardTemplate;
    return {
      rank: st.rank,
      suit: SUIT_SYMBOLS[st.suit] ?? '',
      color: st.color,
    };
  },
  executeSetup: (state: GameState, playerIndex: PlayerIndex) => {
    executeSolitaireSetup(state, playerIndex);
  },
};
