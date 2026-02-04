import {
  createGameState,
  loadDeck,
  moveCard,
  flipCard,
  makeZoneKey,
  toReadableState,
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
// Use new flat zone access: state.zones["player0_stock"]
const stock = state.zones[makeZoneKey(0, ZONE_IDS.STOCK)];
const waste = state.zones[makeZoneKey(0, ZONE_IDS.WASTE)];
const tableau1 = state.zones[makeZoneKey(0, ZONE_IDS.TABLEAUS[0])];
const foundation1 = state.zones[makeZoneKey(0, ZONE_IDS.FOUNDATIONS[0])];

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

// Test toReadableState
console.log('');
console.log('=== Readable State Test ===');
const readable = toReadableState(state);
const readableStock = readable.zones[makeZoneKey(0, ZONE_IDS.STOCK)];
const readableFoundation = readable.zones[makeZoneKey(0, ZONE_IDS.FOUNDATIONS[0])];

console.log(`Stock zone has ${readableStock.cards.length} readable cards`);
console.log(`Top of readable stock: ${readableStock.cards[0]?.name}`);
console.log(`Foundation 1 cards: ${readableFoundation.cards.map(c => c.name).join(', ') || '(empty)'}`);

// Show zone keys
console.log('');
console.log('=== Zone Keys ===');
console.log(`Zone keys: ${Object.keys(state.zones).slice(0, 5).join(', ')}...`);

// Test duplicate card naming (create a deck with duplicates)
console.log('');
console.log('=== Duplicate Card Naming Test ===');
import type { DeckList } from './core';

// Create a deck with duplicates
const testDuplicateDeck: DeckList = {
  id: 'test-duplicates',
  name: 'Test Deck with Duplicates',
  cards: [
    { templateId: 'A-hearts', count: 3 },  // 3 Aces of hearts
    { templateId: 'K-spades', count: 2 },  // 2 Kings of spades
  ],
};

const duplicateTestState = createGameState<PlayingCardTemplate>(SOLITAIRE_CONFIG, 'test', 'none');
loadDeck(duplicateTestState, 0, ZONE_IDS.STOCK, testDuplicateDeck, (id) => CARD_TEMPLATE_MAP.get(id), false);

const readableDup = toReadableState(duplicateTestState);
const dupStock = readableDup.zones[makeZoneKey(0, ZONE_IDS.STOCK)];
console.log(`Duplicate test stock cards: ${dupStock.cards.map(c => c.name).join(', ')}`);
// Expected: A♥, A♥_1, A♥_2, K♠, K♠_1
