import {
  createGameState,
  loadDeck,
  moveCard,
  flipCard,
  VISIBILITY,
  GameLoop,
} from './core';
import { SOLITAIRE_CONFIG, ZONE_IDS } from './plugins/solitaire/playmat';
import { STANDARD_DECK, CARD_TEMPLATE_MAP, type PlayingCardTemplate } from './plugins/solitaire/deck';

// Start game with NO shuffle so we know the order
const initialState = createGameState<PlayingCardTemplate>(SOLITAIRE_CONFIG, 'player', 'none');

loadDeck(
  initialState,
  0,
  ZONE_IDS.STOCK,
  STANDARD_DECK,
  (id) => CARD_TEMPLATE_MAP.get(id),
  false // no shuffle - deck is in order: A♥, 2♥, 3♥... K♠
);

// Create game loop with the initial state
const game = new GameLoop(initialState);

// Add event listener for debugging
game.on('action:executed', (event, { action }) => {
  console.log(`  [Event] ${event}: ${action?.type}`);
});

const state = game.getState();
const player = state.players[0];
const stock = player.zones[ZONE_IDS.STOCK];
const waste = player.zones[ZONE_IDS.WASTE];
const tableau1 = player.zones[ZONE_IDS.TABLEAUS[0]];
const foundation1 = player.zones[ZONE_IDS.FOUNDATIONS[0]];

console.log('=== Initial State ===');
console.log(`Stock: ${stock.cards.length} cards`);
console.log(`Top of stock: ${stock.cards[0].template.name}`);
console.log('');

// Action 1: Move top card from stock to waste (draw)
const drawnCard = stock.cards[0];
console.log(`Action 1: Draw ${drawnCard.template.name} from stock to waste`);
game.submit(moveCard(0, drawnCard.instanceId, 'stock', 'waste', 0));
game.submit(flipCard(0, drawnCard.instanceId, VISIBILITY.PUBLIC));
game.processAll();

console.log(`Stock: ${stock.cards.length} cards`);
console.log(`Waste: ${waste.cards.map(c => c.template.name).join(', ')}`);
console.log('');

// Action 2: Draw two more cards
const card2 = stock.cards[0];
const card3 = stock.cards[1];
console.log(`Action 2: Draw ${card2.template.name}`);
game.submit(moveCard(0, card2.instanceId, 'stock', 'waste', 0));
game.submit(flipCard(0, card2.instanceId, VISIBILITY.PUBLIC));
game.processAll();

console.log(`Action 3: Draw ${card3.template.name}`);
game.submit(moveCard(0, card3.instanceId, 'stock', 'waste', 0));
game.submit(flipCard(0, card3.instanceId, VISIBILITY.PUBLIC));
game.processAll();

console.log(`Waste: ${waste.cards.map(c => c.template.name).join(', ')}`);
console.log('');

// Action 4: Move Ace from waste to foundation
// The A♥ should be at the bottom of waste now (index 2)
const aceCard = waste.cards.find(c => c.template.name === 'A♥');
if (aceCard) {
  console.log(`Action 4: Move ${aceCard.template.name} to foundation`);
  game.submit(moveCard(0, aceCard.instanceId, 'waste', 'foundation_1'));
  game.processAll();
  console.log(`Foundation 1: ${foundation1.cards.map(c => c.template.name).join(', ')}`);
  console.log(`Waste: ${waste.cards.map(c => c.template.name).join(', ')}`);
}
console.log('');

// Action 5: Move a card to tableau
const cardForTableau = waste.cards[0];
console.log(`Action 5: Move ${cardForTableau.template.name} to tableau 1`);
game.submit(moveCard(0, cardForTableau.instanceId, 'waste', 'tableau_1'));
game.processAll();
console.log(`Tableau 1: ${tableau1.cards.map(c => c.template.name).join(', ')}`);
console.log('');

// Summary
console.log('=== Final State ===');
console.log(`Stock: ${stock.cards.length} cards`);
console.log(`Waste: ${waste.cards.length} cards - ${waste.cards.map(c => c.template.name).join(', ') || '(empty)'}`);
console.log(`Foundation 1: ${foundation1.cards.map(c => c.template.name).join(', ') || '(empty)'}`);
console.log(`Tableau 1: ${tableau1.cards.map(c => c.template.name).join(', ') || '(empty)'}`);
console.log('');

// Show history
const history = game.getHistory();
console.log(`History: ${history.states.length} states, ${history.actions.length} actions`);
console.log(`Actions: ${history.actions.map(a => a.type).join(', ')}`);
