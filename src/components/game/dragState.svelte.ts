import type { CardInstance, CardTemplate, Visibility, GameState } from '../../core';
import { executeAction, moveCard, flipCard, parseZoneKey } from '../../core';
import { playSfx } from '../../lib/audio.svelte';

export interface DragState {
  cardInstanceId: string;
  fromZoneKey: string;
  originalVisibility: Visibility;
  card: CardInstance<CardTemplate>;
  mouseX: number;
  mouseY: number;
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
  position?: number
): GameState<CardTemplate> | null {
  if (!dragStore.current) return null;

  // Don't move to same zone (unless repositioning within zone)
  if (dragStore.current.fromZoneKey === toZoneKey && position === undefined) {
    dragStore.current = null;
    return null;
  }

  const savedVisibility = dragStore.current.originalVisibility;

  // Parse zone keys to get player indices and zone IDs
  const from = parseZoneKey(dragStore.current.fromZoneKey);
  const to = parseZoneKey(toZoneKey);

  // Execute move action with optional position
  const action = moveCard(from.playerIndex, cardInstanceId, from.zoneId, to.zoneId, position);

  // Manually update zone keys since moveCard assumes same player for both zones
  if (from.playerIndex !== to.playerIndex) {
    // Direct zone manipulation for cross-player moves
    const fromZone = gameState.zones[dragStore.current.fromZoneKey];
    const toZone = gameState.zones[toZoneKey];
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
    executeAction(gameState, action);
  }

  // Restore original visibility (moveCard changes it to zone default)
  const flipAction = flipCard(from.playerIndex, cardInstanceId, savedVisibility);
  executeAction(gameState, flipAction);

  // Clear drag state
  dragStore.current = null;
  playSfx('cardDrop');

  // Return updated game state for reactivity
  return { ...gameState };
}
