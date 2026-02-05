import type { CardInstance, CardTemplate, GameState } from '../../core';
import { playSfx } from '../../lib/audio.svelte';

export interface CounterDragState {
  counterId: string;
  source: 'tray' | string; // 'tray' or cardInstanceId
  mouseX: number;
  mouseY: number;
}

// Export the state directly so Svelte can track it reactively
export const counterDragStore = $state<{ current: CounterDragState | null }>({ current: null });

export function startCounterDrag(
  counterId: string,
  source: 'tray' | string,
  x: number,
  y: number
): void {
  counterDragStore.current = {
    counterId,
    source,
    mouseX: x,
    mouseY: y,
  };
}

export function updateCounterDragPosition(x: number, y: number): void {
  if (counterDragStore.current) {
    counterDragStore.current.mouseX = x;
    counterDragStore.current.mouseY = y;
  }
}

export function endCounterDrag(): void {
  counterDragStore.current = null;
}

/**
 * Add a counter to a card (drop from tray or another card)
 */
export function executeCounterDrop(
  counterId: string,
  targetCardInstanceId: string,
  gameState: GameState<CardTemplate>
): GameState<CardTemplate> | null {
  if (!counterDragStore.current) return null;

  // Find the target card
  let targetCard: CardInstance<CardTemplate> | undefined;
  for (const zone of Object.values(gameState.zones)) {
    targetCard = zone.cards.find((c) => c.instanceId === targetCardInstanceId);
    if (targetCard) break;
  }

  if (!targetCard) {
    counterDragStore.current = null;
    return null;
  }

  // If dragging from another card, remove from source first
  if (counterDragStore.current.source !== 'tray') {
    const sourceCardId = counterDragStore.current.source;
    for (const zone of Object.values(gameState.zones)) {
      const sourceCard = zone.cards.find((c) => c.instanceId === sourceCardId);
      if (sourceCard && sourceCard.counters[counterId]) {
        sourceCard.counters[counterId]--;
        if (sourceCard.counters[counterId] <= 0) {
          delete sourceCard.counters[counterId];
        }
        break;
      }
    }
  }

  // Add counter to target card
  targetCard.counters[counterId] = (targetCard.counters[counterId] ?? 0) + 1;

  counterDragStore.current = null;
  playSfx('confirm');

  return { ...gameState };
}

/**
 * Remove a counter from a card (drop back to tray)
 */
export function executeCounterReturn(
  gameState: GameState<CardTemplate>
): GameState<CardTemplate> | null {
  if (!counterDragStore.current) return null;

  const { counterId, source } = counterDragStore.current;

  // Only process if dragged from a card (not from tray)
  if (source === 'tray') {
    counterDragStore.current = null;
    return null;
  }

  // Find the source card and remove the counter
  for (const zone of Object.values(gameState.zones)) {
    const sourceCard = zone.cards.find((c) => c.instanceId === source);
    if (sourceCard && sourceCard.counters[counterId]) {
      sourceCard.counters[counterId]--;
      if (sourceCard.counters[counterId] <= 0) {
        delete sourceCard.counters[counterId];
      }
      counterDragStore.current = null;
      playSfx('cancel');
      return { ...gameState };
    }
  }

  counterDragStore.current = null;
  return null;
}

/**
 * Clear all counters from a card
 */
export function clearCardCounters(
  cardInstanceId: string,
  gameState: GameState<CardTemplate>
): GameState<CardTemplate> {
  for (const zone of Object.values(gameState.zones)) {
    const card = zone.cards.find((c) => c.instanceId === cardInstanceId);
    if (card) {
      card.counters = {};
      break;
    }
  }
  return { ...gameState };
}

/**
 * Clear all counters from all cards in a zone
 */
export function clearZoneCounters(
  zoneKey: string,
  gameState: GameState<CardTemplate>
): GameState<CardTemplate> {
  const zone = gameState.zones[zoneKey];
  if (zone) {
    for (const card of zone.cards) {
      card.counters = {};
    }
  }
  return { ...gameState };
}
