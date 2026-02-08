import type { GamePlugin, GameState, PlayerIndex, Playmat, ActionPanel, Action } from '../../core';
import { loadPlaymat, createGameState, VISIBILITY, executeAction } from '../../core';
import { moveCard } from '../../core';
import type { SolitaireCardTemplate } from './cards';
import { ZONE_IDS } from './zones';

async function getSolitairePlaymat(): Promise<Playmat> {
  return loadPlaymat('/playmats/solitaire.json');
}

async function startSolitaireGame(): Promise<GameState<SolitaireCardTemplate>> {
  const playmat = await getSolitairePlaymat();
  const config = {
    gameType: 'klondike',
    zones: playmat.zones,
    playerCount: 1 as const,
  };
  return createGameState<SolitaireCardTemplate>(config, 'player', 'none');
}

function getCardInfo(template: SolitaireCardTemplate): string {
  return template.name;
}

function getActionPanels(state: GameState<SolitaireCardTemplate>, _player: PlayerIndex): ActionPanel[] {
  const stockKey = `player1_${ZONE_IDS.STOCK}`;
  const wasteKey = `player1_${ZONE_IDS.WASTE}`;
  const stock = state.zones[stockKey];
  const waste = state.zones[wasteKey];

  const stockEmpty = !stock || stock.cards.length === 0;
  const wasteHasCards = waste && waste.cards.length > 0;

  const buttons = [];
  if (!stockEmpty) {
    buttons.push({ id: 'draw', label: 'DRAW' });
  } else if (wasteHasCards) {
    buttons.push({ id: 'reset', label: 'RESET STOCK' });
  }

  return buttons.length > 0
    ? [{ id: 'solitaire', title: 'STOCK', buttons }]
    : [];
}

function onActionPanelClick(
  state: GameState<SolitaireCardTemplate>,
  player: PlayerIndex,
  _panelId: string,
  buttonId: string
): Action | void {
  const stockKey = `player1_${ZONE_IDS.STOCK}`;
  const wasteKey = `player1_${ZONE_IDS.WASTE}`;

  if (buttonId === 'draw') {
    const stock = state.zones[stockKey];
    if (!stock || stock.cards.length === 0) return;
    // Move top card from stock to waste
    const topCard = stock.cards[stock.cards.length - 1];
    if (topCard) {
      // Move the card, then flip it face-up via direct mutation
      // (move_card doesn't support visibility override)
      executeAction(state, moveCard(player, topCard.instanceId, stockKey, wasteKey));
      // The card is now in waste — flip it face-up
      const movedCard = state.zones[wasteKey]?.cards.find(c => c.instanceId === topCard.instanceId);
      if (movedCard) {
        movedCard.visibility = VISIBILITY.PUBLIC;
      }
      state.log.push(`[Player 1] Drew ${topCard.template.name} from stock`);
      return; // Direct mutation path
    }
  }

  if (buttonId === 'reset') {
    // Move all waste cards back to stock face-down (direct mutation, like mulligan)
    const waste = state.zones[wasteKey];
    const stock = state.zones[stockKey];
    if (!waste || !stock) return;

    // Reverse the waste pile so the order is preserved correctly
    const cards = waste.cards.splice(0, waste.cards.length).reverse();
    for (const card of cards) {
      card.visibility = VISIBILITY.HIDDEN;
      stock.cards.push(card);
    }
    state.log.push('[Player 1] Reset stock from waste');
    return; // Direct mutation path
  }
}

export const plugin: GamePlugin<SolitaireCardTemplate> = {
  getPlaymat: getSolitairePlaymat,
  startGame: startSolitaireGame,
  getCardInfo,
  getActionPanels,
  onActionPanelClick,
};

export { solitaireHooksPlugin } from './hooks';
export { ZONE_IDS } from './zones';
export type { SolitaireCardTemplate } from './cards';
export { getTemplate, STANDARD_DECK, SOLITAIRE_TEMPLATE_MAP } from './cards';
