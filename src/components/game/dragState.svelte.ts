import type { CardInstance, CardTemplate, Visibility, GameState } from '../../core';
import { executeAction, moveCard, moveCardStack, flipCard, checkOpponentZone, VISIBILITY, type PluginManager } from '../../core';
import { playSfx } from '../../lib/audio.svelte';

export interface DragState {
  cardInstanceId: string;
  fromZoneKey: string;
  originalVisibility: Visibility;
  card: CardInstance<CardTemplate>;
  mouseX: number;
  mouseY: number;
  pileCardIds?: string[];
}

// Export the state directly so Svelte can track it reactively
export const dragStore = $state<{ current: DragState | null }>({ current: null });

export function startDrag(
  card: CardInstance<CardTemplate>,
  fromZoneKey: string,
  x: number,
  y: number
): void {
  dragStore.current = {
    cardInstanceId: card.instanceId,
    fromZoneKey,
    originalVisibility: [...card.visibility] as Visibility,
    card,
    mouseX: x,
    mouseY: y
  };
}

export function startPileDrag(
  cards: CardInstance<CardTemplate>[],
  fromZoneKey: string,
  x: number,
  y: number
): void {
  if (cards.length === 0) return;
  const topCard = cards[cards.length - 1];
  dragStore.current = {
    cardInstanceId: topCard.instanceId,
    fromZoneKey,
    originalVisibility: [...topCard.visibility] as Visibility,
    card: topCard,
    mouseX: x,
    mouseY: y,
    pileCardIds: cards.map(c => c.instanceId),
  };
}

export function updateDragPosition(x: number, y: number): void {
  if (dragStore.current) {
    dragStore.current.mouseX = x;
    dragStore.current.mouseY = y;
  }
}

export function endDrag(): void {
  dragStore.current = null;
}

export function executeDrop(
  cardInstanceId: string,
  toZoneKey: string,
  gameState: GameState<CardTemplate>,
  position?: number,
  pluginManager?: PluginManager<CardTemplate>
): GameState<CardTemplate> | null {
  if (!dragStore.current) return null;

  // Don't move to same zone (unless repositioning within zone)
  if (dragStore.current.fromZoneKey === toZoneKey && position === undefined) {
    dragStore.current = null;
    return null;
  }

  const savedVisibility = dragStore.current.originalVisibility;

  // Extract player indices from zone keys for cross-player check
  const fromPlayerIndex = dragStore.current.fromZoneKey.startsWith('player0_') ? 0 : 1;
  const toPlayerIndex = toZoneKey.startsWith('player0_') ? 0 : 1;

  // Build action using the destination player's index for the action player
  // (so warnings check the right player's zones)
  const actionPlayer = toPlayerIndex;
  const action = moveCard(actionPlayer, cardInstanceId, dragStore.current.fromZoneKey, toZoneKey, position);

  // Opponent zone check (game-universal, not plugin-specific)
  const opponentCheck = checkOpponentZone(gameState, action);
  if (opponentCheck) {
    if (opponentCheck.shouldBlock) {
      gameState.log.push(`Action blocked: ${opponentCheck.reason}`);
      dragStore.current = null;
      return null;
    } else {
      gameState.log.push(`Warning: ${opponentCheck.reason}`);
    }
  }

  // Run plugin pre-hooks for ALL drops (same-player and cross-player)
  if (pluginManager) {
    const preResult = pluginManager.runPreHooks(gameState, action);
    if (preResult.outcome === 'block') {
      gameState.log.push(`Action blocked: ${preResult.reason ?? 'Unknown'}`);
      dragStore.current = null;
      return null;
    }
    if (preResult.outcome === 'warn') {
      gameState.log.push(`Warning: ${preResult.reason}`);
    }
  }

  if (fromPlayerIndex !== toPlayerIndex) {
    // Cross-player: inline move (executeAction assumes same player for from/to)
    const fromZone = gameState.zones[dragStore.current.fromZoneKey];
    const toZone = gameState.zones[toZoneKey];
    if (toZone && toZone.config.maxCards !== -1 && toZone.cards.length >= toZone.config.maxCards) {
      gameState.log.push(`Move blocked: ${toZone.config.name} is full (${toZone.config.maxCards}/${toZone.config.maxCards} cards)`);
      dragStore.current = null;
      return null;
    }
    const cardIndex = fromZone.cards.findIndex(c => c.instanceId === cardInstanceId);
    if (cardIndex !== -1 && toZone) {
      const [card] = fromZone.cards.splice(cardIndex, 1);
      if (position !== undefined) {
        toZone.cards.splice(position, 0, card);
      } else {
        toZone.cards.push(card);
      }
    }
  } else {
    // Same-player: use executeAction
    const blocked = executeAction(gameState, action);
    if (blocked) {
      dragStore.current = null;
      return null;
    }
  }

  // Determine visibility for the card
  // Auto-reveal cards moved to hand zones, otherwise restore original visibility
  const isHandZone = toZoneKey.toLowerCase().includes('hand');
  const newVisibility = isHandZone ? VISIBILITY.PUBLIC : savedVisibility;
  const flipAction = flipCard(fromPlayerIndex, cardInstanceId, newVisibility);
  executeAction(gameState, flipAction);

  // Run post-hooks (e.g., setup face-down during setup phase)
  if (pluginManager) {
    pluginManager.runPostHooks(gameState, action, gameState);
  }

  // Clear counters when moving to hand zone
  if (isHandZone) {
    // Find the card in the destination zone and clear its counters
    const toZone = gameState.zones[toZoneKey];
    const movedCard = toZone?.cards.find(c => c.instanceId === cardInstanceId);
    if (movedCard) {
      movedCard.counters = {};
    }
  }

  // Clear drag state
  dragStore.current = null;
  playSfx('cardDrop');

  // Return updated game state for reactivity
  return { ...gameState };
}

export function executeStackDrop(
  toZoneKey: string,
  gameState: GameState<CardTemplate>,
  position?: number,
  pluginManager?: PluginManager<CardTemplate>
): GameState<CardTemplate> | null {
  if (!dragStore.current || !dragStore.current.pileCardIds) return null;

  const { fromZoneKey, pileCardIds } = dragStore.current;

  // Don't move to same zone
  if (fromZoneKey === toZoneKey) {
    dragStore.current = null;
    return null;
  }

  const fromPlayerIndex = fromZoneKey.startsWith('player0_') ? 0 : 1;
  const toPlayerIndex = toZoneKey.startsWith('player0_') ? 0 : 1;
  const actionPlayer = toPlayerIndex;
  const action = moveCardStack(actionPlayer, pileCardIds, fromZoneKey, toZoneKey, position);

  // Opponent zone check
  const opponentCheck = checkOpponentZone(gameState, action);
  if (opponentCheck) {
    if (opponentCheck.shouldBlock) {
      gameState.log.push(`Action blocked: ${opponentCheck.reason}`);
      dragStore.current = null;
      return null;
    } else {
      gameState.log.push(`Warning: ${opponentCheck.reason}`);
    }
  }

  // Run plugin pre-hooks
  if (pluginManager) {
    const preResult = pluginManager.runPreHooks(gameState, action);
    if (preResult.outcome === 'block') {
      gameState.log.push(`Action blocked: ${preResult.reason ?? 'Unknown'}`);
      dragStore.current = null;
      return null;
    }
    if (preResult.outcome === 'warn') {
      gameState.log.push(`Warning: ${preResult.reason}`);
    }
  }

  if (fromPlayerIndex !== toPlayerIndex) {
    // Cross-player: inline splice for all cards
    const fromZone = gameState.zones[fromZoneKey];
    const toZone = gameState.zones[toZoneKey];
    if (toZone && toZone.config.maxCards !== -1 && toZone.cards.length + pileCardIds.length > toZone.config.maxCards) {
      gameState.log.push(`Move blocked: ${toZone.config.name} is full`);
      dragStore.current = null;
      return null;
    }
    if (fromZone && toZone) {
      const movedCards: CardInstance<CardTemplate>[] = [];
      for (const id of pileCardIds) {
        const idx = fromZone.cards.findIndex(c => c.instanceId === id);
        if (idx !== -1) {
          const [card] = fromZone.cards.splice(idx, 1);
          movedCards.push(card);
        }
      }
      if (position !== undefined) {
        toZone.cards.splice(position, 0, ...movedCards);
      } else {
        toZone.cards.push(...movedCards);
      }
    }
  } else {
    // Same-player: use executeAction
    const blocked = executeAction(gameState, action);
    if (blocked) {
      dragStore.current = null;
      return null;
    }
  }

  // Run post-hooks
  if (pluginManager) {
    pluginManager.runPostHooks(gameState, action, gameState);
  }

  // Clear drag state
  dragStore.current = null;
  playSfx('cardDrop');

  return { ...gameState };
}
