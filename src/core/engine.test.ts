import { describe, it, expect } from 'vitest';
import {
  createGameState,
  createCardInstance,
  generateInstanceId,
  GameLoop,
  moveCard,
  moveCardStack,
  addCounter,
  VISIBILITY,
} from './index';
import type { GameState, CardTemplate, ZoneConfig } from './types';

// ---------------------------------------------------------------------------
// Minimal zone configs for testing
// ---------------------------------------------------------------------------
const TEST_ZONES: Record<string, ZoneConfig> = {
  deck: { name: 'Deck', ordered: true, defaultVisibility: VISIBILITY.HIDDEN, maxCards: -1, ownerCanSeeContents: false, opponentCanSeeCount: true },
  hand: { name: 'Hand', ordered: false, defaultVisibility: VISIBILITY.PLAYER_A_ONLY, maxCards: -1, ownerCanSeeContents: true, opponentCanSeeCount: true },
  field: { name: 'Field', ordered: false, defaultVisibility: VISIBILITY.PUBLIC, maxCards: -1, ownerCanSeeContents: true, opponentCanSeeCount: true },
  shared_zone: { name: 'Shared Zone', ordered: false, defaultVisibility: VISIBILITY.PUBLIC, maxCards: -1, ownerCanSeeContents: true, opponentCanSeeCount: true, shared: true },
};

const DUMMY_TEMPLATE: CardTemplate = { id: 'test-card', name: 'Test Card' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupGame() {
  const state = createGameState<CardTemplate>(
    { gameType: 'test', zones: TEST_ZONES, playerCount: 2 },
    'player-a',
    'player-b',
  );

  const gameLoop = new GameLoop<CardTemplate>(state);

  const blocked: Array<{ action: any; reason: string }> = [];
  gameLoop.on('action:blocked', (_event, data) => {
    if (data.action && data.reason) {
      blocked.push({ action: data.action, reason: data.reason });
    }
  });

  return { state, gameLoop, blocked };
}

function placeCard(state: GameState<CardTemplate>, playerIndex: 0 | 1, zoneId: string): string {
  const instanceId = generateInstanceId();
  const zone = state.zones[`player${playerIndex}_${zoneId}`];
  const card = createCardInstance(DUMMY_TEMPLATE, instanceId, zone.config.defaultVisibility);
  zone.cards.push(card);
  return instanceId;
}

// ---------------------------------------------------------------------------
// Tests: checkOpponentZone (via GameLoop)
// ---------------------------------------------------------------------------

describe('checkOpponentZone', () => {
  it('blocks AI move_card to opponent zone', () => {
    const { state, gameLoop, blocked } = setupGame();
    const card = placeCard(state, 0, 'hand');
    gameLoop.submit({ ...moveCard(1, card, 'player1_hand', 'player1_field'), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain("opponent's Field");
  });

  it('warns UI move_card to opponent zone', () => {
    const { state, gameLoop, blocked } = setupGame();
    const card = placeCard(state, 0, 'hand');
    gameLoop.submit(moveCard(1, card, 'player1_hand', 'player1_field'));
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);
    expect(state.log.some(l => l.includes("opponent's Field"))).toBe(true);
  });

  it('allows move_card to own zone', () => {
    const { state, gameLoop, blocked } = setupGame();
    const card = placeCard(state, 0, 'hand');
    gameLoop.submit({ ...moveCard(0, card, 'player0_hand', 'player0_field'), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);
  });

  it('allows move to shared zone even when player differs from active', () => {
    const { state, gameLoop, blocked } = setupGame();
    state.activePlayer = 1;
    const card = placeCard(state, 1, 'hand');
    // shared_zone defaults to player0 ownership, but shared=true
    gameLoop.submit(moveCard(0, card, 'player0_hand', 'player0_shared_zone'));
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);
  });

  it('allows opponent zone move with allowed_by_effect', () => {
    const { state, gameLoop, blocked } = setupGame();
    const card = placeCard(state, 0, 'hand');
    gameLoop.submit({ ...moveCard(1, card, 'player1_hand', 'player1_field'), source: 'ai', allowed_by_effect: true });
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);
  });

  it('blocks AI move_card_stack to opponent zone', () => {
    const { state, gameLoop, blocked } = setupGame();
    const card = placeCard(state, 0, 'hand');
    gameLoop.submit({ ...moveCardStack(1, [card], 'player1_hand', 'player1_field'), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toContain("opponent's Field");
  });

  it('does NOT block counter actions on opponent cards', () => {
    const { state, gameLoop, blocked } = setupGame();
    const card = placeCard(state, 1, 'field');
    // Player 0 places counter on player 1's card — should always be allowed
    gameLoop.submit({ ...addCounter(1, card, 'damage', 1), source: 'ai' });
    gameLoop.processNext();
    expect(blocked).toHaveLength(0);
  });
});
